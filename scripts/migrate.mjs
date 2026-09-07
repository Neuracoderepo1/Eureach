import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.ADMIN_DATABASE_URL || process.env.DATABASE_URL, max: 2 });
const root = path.resolve(new URL('..', import.meta.url).pathname, 'database');
const files = [path.join(root,'001_core_schema.sql'), ...fs.readdirSync(path.join(root,'migrations')).filter(f=>f.endsWith('.sql')).sort().map(f=>path.join(root,'migrations',f))];
const client = await pool.connect();
try {
  await client.query('select pg_advisory_lock(hashtext($1))', ['eureach-schema-migrations-v1']);
  await client.query(`create table if not exists schema_migration (filename text primary key, applied_at timestamptz not null default now(), checksum text)`);
  await client.query(`alter table schema_migration add column if not exists checksum text`);
  for (const file of files) {
    const filename = path.basename(file);
    const sql = fs.readFileSync(file, 'utf8');
    const checksum = crypto.createHash('sha256').update(sql).digest('hex');
    const existing = await client.query('select checksum from schema_migration where filename=$1', [filename]);
    if (existing.rowCount) {
      if (existing.rows[0].checksum && existing.rows[0].checksum !== checksum) throw new Error(`Migration checksum mismatch: ${filename}`);
      if (!existing.rows[0].checksum) await client.query('update schema_migration set checksum=$2 where filename=$1', [filename, checksum]);
      continue;
    }
    await client.query('begin');
    try {
      await client.query(sql);
      await client.query('insert into schema_migration(filename,checksum) values($1,$2)', [filename, checksum]);
      await client.query('commit');
      console.log(`applied ${filename}`);
    } catch (e) { await client.query('rollback'); throw e; }
  }
} finally {
  try { await client.query('select pg_advisory_unlock(hashtext($1))', ['eureach-schema-migrations-v1']); } catch {}
  client.release();
  await pool.end();
}
