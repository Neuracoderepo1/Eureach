// Proves the multi-tenant RLS isolation guarantee against a REAL Postgres
// database, connected as the actual runtime role (eureach_app) that the
// application uses in production -- not as a superuser. This matters:
// RLS policies being *present* in the schema is not the same claim as
// isolation *holding* under real queries from the real, restricted role.
//
// Requires: DATABASE_URL pointing at a database with 001_core_schema.sql,
// 002_runtime_role.sh, and migrations/002+003 already applied, and
// APP_DATABASE_URL pointing at the same database authenticated as
// eureach_app. Run with: node --test tests/rls-isolation.test.mjs
import { test } from 'node:test';
import assert from 'node:assert/strict';
import pg from 'pg';

const { Pool } = pg;

const adminUrl = process.env.DATABASE_URL;
const appUrl = process.env.APP_DATABASE_URL;

if (!adminUrl || !appUrl) {
  console.log('SKIP rls-isolation.test.mjs: set DATABASE_URL and APP_DATABASE_URL to run against a real Postgres instance');
} else {
  const adminPool = new Pool({ connectionString: adminUrl });
  const appPool = new Pool({ connectionString: appUrl });

  async function asTenant(tenantId, fn) {
    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      await client.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
      return await fn(client);
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
  }

  let tenantA, tenantB, recordA, recordB;

  test('seed two tenants with one record each (as admin, bypassing RLS)', async () => {
    const a = await adminPool.query(
      "insert into tenant(id, slug, name, industry_key) values (gen_random_uuid(), 'tenant-a-rls-test', 'Tenant A', 'ngo') returning id"
    );
    const b = await adminPool.query(
      "insert into tenant(id, slug, name, industry_key) values (gen_random_uuid(), 'tenant-b-rls-test', 'Tenant B', 'ngo') returning id"
    );
    tenantA = a.rows[0].id;
    tenantB = b.rows[0].id;

    const ra = await adminPool.query(
      "insert into record(id, tenant_id, status, custom_fields) values (gen_random_uuid(), $1, 'new', '{\"secret\":\"tenant-a-only\"}'::jsonb) returning id",
      [tenantA]
    );
    const rb = await adminPool.query(
      "insert into record(id, tenant_id, status, custom_fields) values (gen_random_uuid(), $1, 'new', '{\"secret\":\"tenant-b-only\"}'::jsonb) returning id",
      [tenantB]
    );
    recordA = ra.rows[0].id;
    recordB = rb.rows[0].id;
  });

  test('tenant A cannot see the tenant table row for tenant B', async () => {
    const rows = await asTenant(tenantA, (c) => c.query('select id from tenant'));
    const ids = rows.rows.map((r) => r.id);
    assert.ok(ids.includes(tenantA), 'tenant A should see its own tenant row');
    assert.ok(!ids.includes(tenantB), 'tenant A must NOT see tenant B\'s tenant row');
  });

  test('tenant A cannot read tenant B\'s record via unfiltered select', async () => {
    const rows = await asTenant(tenantA, (c) => c.query('select id, tenant_id, custom_fields from record'));
    const ids = rows.rows.map((r) => r.id);
    assert.ok(ids.includes(recordA), 'tenant A should see its own record');
    assert.ok(!ids.includes(recordB), 'tenant A must NOT see tenant B\'s record via an unfiltered select');
  });

  test('tenant A cannot read tenant B\'s record even by guessing its exact id', async () => {
    const rows = await asTenant(tenantA, (c) => c.query('select id from record where id = $1', [recordB]));
    assert.equal(rows.rows.length, 0, 'looking up tenant B\'s record id directly while scoped to tenant A must return nothing');
  });

  test('tenant A cannot exfiltrate tenant B\'s data via a self-join across tenant_id', async () => {
    // Adversarial case: try to defeat isolation by joining record against
    // itself with an explicit tenant_id predicate baked into the query
    // text, hoping RLS only filters the "outer" reference.
    const rows = await asTenant(tenantA, (c) =>
      c.query(
        `select r2.id, r2.custom_fields from record r1
         join record r2 on true
         where r2.tenant_id = $1`,
        [tenantB]
      )
    );
    assert.equal(rows.rows.length, 0, 'a self-join explicitly targeting tenant B\'s tenant_id must still return nothing under tenant A\'s session');
  });

  test('tenant A cannot update or delete tenant B\'s record', async () => {
    const updateResult = await asTenant(tenantA, (c) =>
      c.query("update record set status = 'contacted' where id = $1", [recordB])
    );
    assert.equal(updateResult.rowCount, 0, 'update against tenant B\'s record from tenant A\'s session must affect zero rows');

    const deleteResult = await asTenant(tenantA, (c) => c.query('delete from record where id = $1', [recordB]));
    assert.equal(deleteResult.rowCount, 0, 'delete against tenant B\'s record from tenant A\'s session must affect zero rows');
  });

  test('tenant A cannot insert a record claiming to belong to tenant B', async () => {
    await assert.rejects(
      () =>
        asTenant(tenantA, (c) =>
          c.query(
            "insert into record(id, tenant_id, status, custom_fields) values (gen_random_uuid(), $1, 'new', '{}'::jsonb)",
            [tenantB]
          )
        ),
      /row-level security|new row violates/i,
      'inserting a row stamped with tenant B\'s id while scoped to tenant A must be rejected by the WITH CHECK clause'
    );
  });

  test('a session with no tenant context set sees nothing at all (fails closed, not open)', async () => {
    const client = await appPool.connect();
    try {
      await client.query('BEGIN');
      // Deliberately do NOT call set_config('app.tenant_id', ...) --
      // this simulates a bug elsewhere in the app that forgets to scope
      // the session. The correct behavior is zero rows, not everything.
      const rows = await client.query('select id from record');
      assert.equal(rows.rows.length, 0, 'an unscoped session must fail closed (see nothing), never fail open (see everything)');
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      client.release();
    }
  });

  test('cleanup', async () => {
    await adminPool.query('delete from record where tenant_id in ($1,$2)', [tenantA, tenantB]);
    await adminPool.query('delete from tenant where id in ($1,$2)', [tenantA, tenantB]);
    await adminPool.end();
    await appPool.end();
  });
}
