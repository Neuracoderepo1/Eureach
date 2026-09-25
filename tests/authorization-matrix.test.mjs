// Proves that every permission in the shared industry-configuration
// permission set (src/config/configurations.ts: commonPermissions) is
// actually enforced by the real HTTP API -- using the real createServer()
// request pipeline and a real Postgres database, not a mock of
// requirePermission(). For each permission:
//   1. a role granted ONLY that permission must succeed on the one
//      endpoint that requires it, and
//   2. a role granted every OTHER permission (but not this one) must be
//      rejected with 403 FORBIDDEN on the same endpoint.
// This is deliberately modeled on tests/rls-isolation.test.mjs: real
// server, real Postgres, real restricted eureach_app role -- adversarial
// permission combinations, not a happy-path smoke test.
//
// Requires: DATABASE_URL pointing at a database with 001_core_schema.sql
// and migrations/003_launch_hardening.sql already applied, and
// APP_DATABASE_URL pointing at the same database authenticated as
// eureach_app. JWT_SECRET must match the value the server process reads.
// Run with: node --test tests/authorization-matrix.test.mjs
//
// NOTE: this proves API-level authorization. It says nothing about the
// operator console UI, which currently has no screens for outreach,
// assignment or follow-up -- see tests/e2e/operator-console.spec.ts.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { createServer } from '../server/app.mjs';
import { signJwt } from '../server/security.mjs';

const { Pool } = pg;

const adminUrl = process.env.DATABASE_URL;
const appUrl = process.env.APP_DATABASE_URL;
const JWT_SECRET = process.env.JWT_SECRET;

if (!adminUrl || !appUrl || !JWT_SECRET) {
  console.log('SKIP authorization-matrix.test.mjs: set DATABASE_URL, APP_DATABASE_URL and JWT_SECRET to run against a real Postgres instance and a real signing key');
} else {
  const adminPool = new Pool({ connectionString: adminUrl, connectionTimeoutMillis: 5_000 });

  // Keep this in sync by hand with src/config/configurations.ts
  // (commonPermissions) -- this test only proves what's listed here.
  const ALL_PERMISSIONS = [
    'records.read', 'records.update', 'outreach.log', 'followups.manage',
    'campaigns.read', 'campaigns.manage', 'queues.manage', 'users.manage',
    'audit.read', 'analytics.read'
  ];

  // One concrete, unique endpoint per permission, taken directly from the
  // requirePermission(...) call sites in server/app.mjs.
  const ENDPOINTS = {
    'audit.read':       { method: 'GET',  path: () => '/api/v1/audit' },
    'analytics.read':   { method: 'GET',  path: () => '/api/v1/analytics' },
    'records.read':     { method: 'GET',  path: () => '/api/v1/records' },
    'records.update':   { method: 'POST', path: () => '/api/v1/records',
                           body: () => ({ customFields: { name: 'Authz test beneficiary' } }) },
    'outreach.log':      { method: 'POST', path: (ctx) => `/api/v1/records/${ctx.recordId}/outreach`,
                           body: () => ({ outcomeKey: 'follow-up', channel: 'phone' }) },
    'followups.manage': { method: 'GET',  path: () => '/api/v1/follow-ups' },
    'campaigns.read':    { method: 'GET',  path: () => '/api/v1/campaigns' },
    'campaigns.manage':  { method: 'POST', path: () => '/api/v1/campaigns',
                           body: () => ({ name: 'Authz test campaign', type: 'Program Campaign' }) },
    'queues.manage':     { method: 'POST', path: () => '/api/v1/queues',
                           body: () => ({ name: 'Authz test queue' }) },
    'users.manage':      { method: 'GET',  path: () => '/api/v1/roles' }
  };

  let server, baseUrl, tenantId, recordId, testUserId;

  test('start real server and seed one tenant + one real app_user + one record (ngo config)', async () => {
    server = createServer();
    await new Promise((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;

    const t = await adminPool.query(
      "insert into tenant(id, slug, name, industry_key) values (gen_random_uuid(), 'tenant-authz-test', 'Authz Test', 'ngo') returning id"
    );
    tenantId = t.rows[0].id;

    // claims.sub is stored as an actor/agent id (uuid column, with a real
    // foreign key to app_user(tenant_id,id)) by auditQuery() and by the
    // outreach/follow-up writes. It must reference an actual app_user
    // row -- a well-formed UUID that doesn't exist is not enough, the FK
    // constraint rejects it. app_user.role_id also has a real FK to
    // app_role, so a role row is seeded first even though this test
    // grants permissions directly via JWT claims rather than a DB
    // lookup.
    const role = await adminPool.query(
      "insert into app_role(id, tenant_id, name, permissions) values (gen_random_uuid(), $1, 'authz-test-role', '[]'::jsonb) returning id",
      [tenantId]
    );
    const user = await adminPool.query(
      "insert into app_user(id, tenant_id, name, email, password_hash, role_id) values (gen_random_uuid(), $1, 'Authz Test User', 'authz-test@example.invalid', 'not-a-real-hash', $2) returning id",
      [tenantId, role.rows[0].id]
    );
    testUserId = user.rows[0].id;

    const r = await adminPool.query(
      "insert into record(id, tenant_id, status, custom_fields) values (gen_random_uuid(), $1, 'New', '{}'::jsonb) returning id",
      [tenantId]
    );
    recordId = r.rows[0].id;
  });

  function tokenWith(permissions) {
    return signJwt({ sub: testUserId, tid: tenantId, role: 'authz-test-role', permissions }, JWT_SECRET, 900);
  }

  async function call(permission, token) {
    const endpoint = ENDPOINTS[permission];
    const path = endpoint.path({ recordId });
    const body = endpoint.body ? JSON.stringify(endpoint.body()) : undefined;
    const res = await fetch(`${baseUrl}${path}`, {
      method: endpoint.method,
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body
    });
    return res.status;
  }

  for (const permission of ALL_PERMISSIONS) {
    test(`role with ONLY "${permission}" can call its endpoint`, async () => {
      const status = await call(permission, tokenWith([permission]));
      assert.ok(status < 400, `expected success calling the ${permission} endpoint with that exact permission, got ${status}`);
    });

    test(`role WITHOUT "${permission}" is rejected on its endpoint (fails closed)`, async () => {
      const everyOtherPermission = ALL_PERMISSIONS.filter((p) => p !== permission);
      const status = await call(permission, tokenWith(everyOtherPermission));
      assert.equal(status, 403, `expected 403 FORBIDDEN calling the ${permission} endpoint without that permission, got ${status}`);
    });
  }

  test('a token with no permissions at all is rejected on every endpoint', async () => {
    for (const permission of ALL_PERMISSIONS) {
      const status = await call(permission, tokenWith([]));
      assert.equal(status, 403, `expected 403 FORBIDDEN calling the ${permission} endpoint with zero permissions, got ${status}`);
    }
  });

  test('cleanup', async () => {
    await new Promise((resolve) => server.close(resolve));
    // Every tenant-owned table has tenant_id references tenant(id) on
    // delete cascade -- deleting the tenant row is sufficient.
    await adminPool.query('delete from tenant where id=$1', [tenantId]);
    await adminPool.end();
  });
}
