import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL });
import { hashPassword, uuid } from '../server/security.mjs';
import { configurations } from '../dist/config/configurations.js';

const slug = process.env.SEED_TENANT_SLUG || 'demo';
const tenantName = process.env.SEED_TENANT_NAME || 'Eureach Demo';
const industry = process.env.SEED_INDUSTRY || 'agriculture';
const email = process.env.SEED_ADMIN_EMAIL || 'admin@eureach.local';
const password = process.env.SEED_ADMIN_PASSWORD;
if (!password) throw new Error('SEED_ADMIN_PASSWORD is required');
if (!configurations[industry]) throw new Error(`Unsupported industry: ${industry}`);

const client = await pool.connect();
try {
  await client.query('BEGIN');
  const tenant = (await client.query('insert into tenant(id,slug,name,industry_key,configuration_version) values($1,$2,$3,$4,$5) on conflict(slug) do update set name=excluded.name,industry_key=excluded.industry_key,configuration_version=excluded.configuration_version returning id', [uuid(), slug, tenantName, industry, configurations[industry].version])).rows[0];
  await client.query("select set_config('app.tenant_id',$1,true)", [tenant.id]);
  const role = (await client.query('insert into app_role(id,tenant_id,name,permissions) values($1,$2,$3,$4) on conflict(tenant_id,name) do update set permissions=excluded.permissions returning id', [uuid(), tenant.id, 'Administrator', JSON.stringify(['*'])])).rows[0];
  await client.query('insert into app_user(id,tenant_id,name,email,password_hash,role_id) values($1,$2,$3,$4,$5,$6) on conflict(tenant_id,lower(email)) do update set password_hash=excluded.password_hash,role_id=excluded.role_id,is_active=true', [uuid(), tenant.id, 'Eureach Administrator', email.toLowerCase(), hashPassword(password), role.id]);
  await client.query('COMMIT');
  console.log(JSON.stringify({ ok:true, tenantSlug:slug, adminEmail:email, industry }));
} catch (e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); await pool.end(); }
