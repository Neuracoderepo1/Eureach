import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { URL } from 'node:url';
import { pool, withTenant, health as dbHealth } from './db.mjs';
import { verifyJwt, signJwt, verifyPassword, hashPassword, randomToken, hashToken, uuid } from './security.mjs';
import { json, sendError, readJson, getBearer, corsHeaders } from './http.mjs';
import { rateLimit } from './rate-limit.mjs';
import { configurationRegistry } from '../dist/config/registry.js';
import { validateIndustryConfiguration } from '../dist/config/validate.js';
import { assertStateTransition } from '../dist/config/workflow.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const STATIC_INDEX = path.join(__dirname, '..', 'app', 'index.html');
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) throw new Error('JWT_SECRET must be set and at least 32 characters');
const ACCESS_TTL = Number(process.env.ACCESS_TTL_SECONDS || 900);
const REFRESH_TTL_DAYS = Number(process.env.REFRESH_TTL_DAYS || 30);
const PORT = Number(process.env.PORT || 8080);
const METRICS_TOKEN = process.env.METRICS_TOKEN;

function requireAuth(req) {
  const token = getBearer(req);
  if (!token) throw Object.assign(new Error('Authentication required'), { status: 401, code: 'AUTH_REQUIRED' });
  try { return verifyJwt(token, JWT_SECRET); }
  catch { throw Object.assign(new Error('Invalid or expired access token'), { status: 401, code: 'AUTH_INVALID' }); }
}

function refreshCookie(value, maxAgeSeconds) {
  // `Secure` is a valueless cookie attribute — writing `Secure=false` does not
  // clear it. Browsers key off the presence of the "Secure" attribute name
  // alone and ignore anything after "=", so a literal `Secure=${bool}` string
  // marks the cookie Secure regardless of environment. That silently breaks
  // the refresh cookie on local/staging HTTP, since Secure cookies are
  // dropped by the browser over a non-HTTPS connection. Only append the
  // attribute at all when it should apply.
  const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
  return `eureach_refresh=${value}; HttpOnly${secure}; SameSite=Strict; Path=/api/v1/auth; Max-Age=${maxAgeSeconds}`;
}

function requirePermission(claims, permission) {
  if (!permission || claims.permissions?.includes('*') || claims.permissions?.includes(permission)) return;
  throw Object.assign(new Error('Insufficient permission'), { status: 403, code: 'FORBIDDEN' });
}

function validateFields(config, customFields) {
  if (!customFields || typeof customFields !== 'object' || Array.isArray(customFields)) throw Object.assign(new Error('customFields must be an object'), { status: 400, code: 'INVALID_FIELDS' });
  const definitions = new Map(config.fieldDefinitions.map(f => [f.key, f]));
  for (const [key, value] of Object.entries(customFields)) if (!definitions.has(key)) throw Object.assign(new Error(`Unknown field: ${key}`), { status: 400, code: 'UNKNOWN_FIELD' });
  for (const field of config.fieldDefinitions) {
    const value = customFields[field.key];
    if (field.required && (value === undefined || value === null || value === '')) throw Object.assign(new Error(`Required field "${field.label}" is missing`), { status: 400, code: 'REQUIRED_FIELD' });
    if (value !== undefined && value !== null) {
      if (field.type === 'number' && (typeof value !== 'number' || !Number.isFinite(value))) throw Object.assign(new Error(`Field "${field.label}" must be a finite number`), { status: 400, code: 'INVALID_FIELD_TYPE' });
      if (['text','phone','email','date'].includes(field.type) && typeof value !== 'string') throw Object.assign(new Error(`Field "${field.label}" must be text`), { status: 400, code: 'INVALID_FIELD_TYPE' });
      if (field.type === 'boolean' && typeof value !== 'boolean') throw Object.assign(new Error(`Field "${field.label}" must be boolean`), { status: 400, code: 'INVALID_FIELD_TYPE' });
      if (field.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) throw Object.assign(new Error(`Field "${field.label}" must be a valid email`), { status: 400, code: 'INVALID_FIELD_FORMAT' });
      if (field.type === 'date' && Number.isNaN(Date.parse(value))) throw Object.assign(new Error(`Field "${field.label}" must be a valid date`), { status: 400, code: 'INVALID_FIELD_FORMAT' });
      if (field.type === 'select' && field.options && !field.options.includes(value)) throw Object.assign(new Error(`Invalid option for "${field.label}"`), { status: 400, code: 'INVALID_FIELD_OPTION' });
      if (typeof value === 'string' && value.length > 5000) throw Object.assign(new Error(`Field "${field.label}" is too long`), { status: 400, code: 'INVALID_FIELD_LENGTH' });
    }
  }
}

function auditQuery(client, claims, action, entityType, entityId, metadata = {}) {
  return client.query('insert into audit_event (id, tenant_id, actor_id, action, entity_type, entity_id, metadata) values ($1,$2,$3,$4,$5,$6,$7)', [uuid(), claims.tid, claims.sub, action, entityType, entityId, JSON.stringify(metadata)]);
}

async function login(body) {
  const { tenantSlug, email, password } = body;
  if (!tenantSlug || !email || !password) throw Object.assign(new Error('tenantSlug, email and password are required'), { status: 400, code: 'VALIDATION_ERROR' });
  const result = await pool.query('select * from eureach_auth_user($1,$2)', [tenantSlug, email]);
  const user = result.rows[0];
  if (!user || !user.is_active || !verifyPassword(password, user.password_hash)) throw Object.assign(new Error('Invalid credentials'), { status: 401, code: 'AUTH_INVALID' });
  const permissions = Array.isArray(user.permissions) ? user.permissions : [];
  const accessToken = signJwt({ sub: user.user_id, tid: user.tenant_id, role: user.role_name, permissions, tenant: user.tenant_name }, JWT_SECRET, ACCESS_TTL);
  const refresh = randomToken(48);
  await pool.query('select eureach_create_refresh_token($1,$2,$3,$4,$5)', [uuid(), user.tenant_id, user.user_id, hashToken(refresh), REFRESH_TTL_DAYS]);
  return { accessToken, refreshToken: refresh, expiresIn: ACCESS_TTL, user: { id: user.user_id, name: user.name, email: user.email, role: user.role_name }, tenant: { id: user.tenant_id, name: user.tenant_name, industry: user.industry_key, configurationVersion: user.configuration_version } };
}

async function refreshToken(body, req) {
  const cookie = String(req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith('eureach_refresh='));
  const supplied = body.refreshToken || (cookie ? decodeURIComponent(cookie.slice('eureach_refresh='.length)) : null);
  if (!supplied) throw Object.assign(new Error('refreshToken is required'), { status: 400, code: 'VALIDATION_ERROR' });
  const result = await pool.query('select * from eureach_refresh_user($1)', [hashToken(supplied)]);
  const row = result.rows[0];
  if (!row) throw Object.assign(new Error('Invalid refresh token'), { status: 401, code: 'AUTH_INVALID' });
  await pool.query('select eureach_revoke_refresh_token($1)', [row.token_id]);
  const replacement = randomToken(48);
  await pool.query('select eureach_create_refresh_token($1,$2,$3,$4,$5)', [uuid(), row.tenant_id, row.user_id, hashToken(replacement), REFRESH_TTL_DAYS]);
  const permissions = Array.isArray(row.permissions) ? row.permissions : [];
  return { accessToken: signJwt({ sub: row.user_id, tid: row.tenant_id, role: row.role_name, permissions, tenant: row.tenant_name }, JWT_SECRET, ACCESS_TTL), refreshToken: replacement, expiresIn: ACCESS_TTL };
}

async function api(req, res, claims, method, pathname, body) {
  if (pathname === '/api/v1/config' && method === 'GET') {
    const result = await withTenant(claims.tid, client => client.query('select id,name,industry_key,configuration_version from tenant where id=$1', [claims.tid]));
    const tenant = result.rows[0]; if (!tenant) throw Object.assign(new Error('Tenant not found'), { status: 404, code: 'TENANT_NOT_FOUND' });
    const config = configurationRegistry.resolveTenant({ tenantId: tenant.id, industry: tenant.industry_key, version: tenant.configuration_version });
    validateIndustryConfiguration(config);
    return json(res, 200, { tenant: { id: tenant.id, name: tenant.name, industry: tenant.industry_key, configurationVersion: tenant.configuration_version }, configuration: config });
  }

  if (pathname === '/api/v1/audit' && method === 'GET') {
    requirePermission(claims, 'audit.read');
    const rows = await withTenant(claims.tid, client => client.query('select id,actor_id,action,entity_type,entity_id,metadata,occurred_at from audit_event order by occurred_at desc limit 200'));
    return json(res, 200, { events: rows.rows });
  }

  if (pathname === '/api/v1/analytics' && method === 'GET') {
    requirePermission(claims, 'analytics.read');
    const rows = await withTenant(claims.tid, client => client.query(`select name,count(*)::int count from analytics_event where occurred_at >= now()-interval '30 days' group by name order by count desc`));
    return json(res, 200, { window: '30d', events: rows.rows });
  }

  if (pathname === '/api/v1/dashboard' && method === 'GET') {
    requirePermission(claims, 'records.read');
    const configRow = await withTenant(claims.tid, client => client.query('select industry_key,configuration_version from tenant where id=$1', [claims.tid]));
    const config = configurationRegistry.resolveTenant({ tenantId: claims.tid, industry: configRow.rows[0].industry_key, version: configRow.rows[0].configuration_version });
    const pendingStates = [...new Set(config.workflow.outcomes.filter(o => o.createsFollowUp).map(o => o.resultingState))];
    const result = await withTenant(claims.tid, async client => { const metrics = await client.query(`select count(*)::int total_records, count(*) filter(where status = any($1::text[]))::int pending_records, count(*) filter(where status <> $2)::int contacted_records from record`, [pendingStates, config.workflow.initialState]); const campaigns = await client.query('select count(*)::int total from campaign'); return { ...metrics.rows[0], campaigns: campaigns.rows[0].total }; });
    const r = result;
    return json(res, 200, { labels: config.dashboardLabels, metrics: { totalRecords: r.total_records, pending: r.pending_records, contacted: r.contacted_records, campaigns: r.campaigns, reachRate: r.total_records ? Number((r.contacted_records / r.total_records * 100).toFixed(1)) : 0 } });
  }

  const recordMatch = pathname.match(/^\/api\/v1\/records\/([^/]+)$/);
  if (pathname === '/api/v1/records' && method === 'GET') {
    requirePermission(claims, 'records.read');
    const url = new URL(req.url, `http://${req.headers.host}`);
    const rawLimit = Number(url.searchParams.get('limit') || 25);
    const rawOffset = Number(url.searchParams.get('offset') || 0);
    if (!Number.isInteger(rawLimit) || rawLimit < 1 || rawLimit > 100) throw Object.assign(new Error('limit must be an integer between 1 and 100'), { status: 400, code: 'INVALID_PAGINATION' });
    if (!Number.isInteger(rawOffset) || rawOffset < 0) throw Object.assign(new Error('offset must be a non-negative integer'), { status: 400, code: 'INVALID_PAGINATION' });
    const limit = rawLimit;
    const offset = rawOffset;
    const q = url.searchParams.get('q');
    const status = url.searchParams.get('status');
    const rows = await withTenant(claims.tid, async client => {
      const params = [limit, offset]; let where = '';
      if (q) { params.push(`%${q}%`); where += ` and custom_fields::text ilike $${params.length}`; }
      if (status) { params.push(status); where += ` and status=$${params.length}`; }
      const data = await client.query(`select id,campaign_id,territory_id,assigned_to,status,custom_fields,created_at,updated_at from record where tenant_id=current_setting('app.tenant_id')::uuid${where} order by updated_at desc limit $1 offset $2`, params);
      const countParams = q ? [params[2]] : [];
      const count = await client.query(`select count(*)::int total from record where tenant_id=current_setting('app.tenant_id')::uuid${q ? ' and custom_fields::text ilike $1' : ''}${status ? ` and status=${q ? '$2' : '$1'}` : ''}`, status ? (q ? [params[2], params[3]] : [params[2]]) : countParams);
      return { data: data.rows, total: count.rows[0].total };
    });
    return json(res, 200, rows);
  }

  if (pathname === '/api/v1/records' && method === 'POST') {
    requirePermission(claims, 'records.update');
    const tenantResult = await withTenant(claims.tid, client => client.query('select industry_key,configuration_version from tenant where id=$1', [claims.tid]));
    const config = configurationRegistry.resolveTenant({ tenantId: claims.tid, industry: tenantResult.rows[0].industry_key, version: tenantResult.rows[0].configuration_version });
    validateFields(config, body.customFields || {});
    if (!body.id) body.id = uuid();
    if (body.status && body.status !== config.workflow.initialState) throw Object.assign(new Error('New records must start in the configured initial state'), { status: 400, code: 'INVALID_INITIAL_STATE' });
    const status = config.workflow.initialState;
    const record = await withTenant(claims.tid, async client => {
      const r = await client.query('insert into record(id,tenant_id,campaign_id,territory_id,assigned_to,status,custom_fields) values($1,$2,$3,$4,$5,$6,$7) returning *', [body.id, claims.tid, body.campaignId || null, body.territoryId || null, body.assignedTo || null, status, JSON.stringify(body.customFields || {})]);
      await auditQuery(client, claims, 'record.created', 'record', body.id);
      return r.rows[0];
    });
    return json(res, 201, { record });
  }

  if (recordMatch && method === 'GET') {
    requirePermission(claims, 'records.read');
    const id = recordMatch[1];
    const record = await withTenant(claims.tid, async client => (await client.query('select * from record where id=$1 and tenant_id=current_setting(\'app.tenant_id\')::uuid', [id])).rows[0]);
    if (!record) throw Object.assign(new Error('Record not found'), { status: 404, code: 'NOT_FOUND' });
    return json(res, 200, { record });
  }

  if (recordMatch && method === 'PATCH') {
    requirePermission(claims, 'records.update');
    const id = recordMatch[1];
    const tenantResult = await withTenant(claims.tid, client => client.query('select industry_key,configuration_version from tenant where id=$1', [claims.tid]));
    const config = configurationRegistry.resolveTenant({ tenantId: claims.tid, industry: tenantResult.rows[0].industry_key, version: tenantResult.rows[0].configuration_version });
    if (body.customFields) validateFields(config, body.customFields);
    const record = await withTenant(claims.tid, async client => {
      const current = (await client.query('select * from record where id=$1', [id])).rows[0]; if (!current) return null;
      if (body.expectedUpdatedAt && new Date(body.expectedUpdatedAt).toISOString() !== new Date(current.updated_at).toISOString()) throw Object.assign(new Error('Record has changed since it was read'), { status: 409, code: 'STALE_RECORD' });
      if (body.status) { try { assertStateTransition(config, current.status, body.status); } catch (e) { throw Object.assign(e, { status: 400, code: 'INVALID_TRANSITION' }); } }
      const merged = body.customFields ? { ...current.custom_fields, ...body.customFields } : current.custom_fields;
      validateFields(config, merged);
      const r = await client.query('update record set status=coalesce($2,status), assigned_to=coalesce($3,assigned_to), campaign_id=coalesce($4,campaign_id), territory_id=coalesce($5,territory_id), custom_fields=$6, updated_at=now() where id=$1 and ($7::timestamptz is null or updated_at=$7::timestamptz) returning *', [id, body.status || null, body.assignedTo || null, body.campaignId || null, body.territoryId || null, JSON.stringify(merged), body.expectedUpdatedAt || null]);
      if (!r.rowCount) throw Object.assign(new Error('Record has changed since it was read'), { status: 409, code: 'STALE_RECORD' });
      await auditQuery(client, claims, 'record.updated', 'record', id, { changed: Object.keys(body) }); return r.rows[0];
    });
    if (!record) throw Object.assign(new Error('Record not found'), { status: 404, code: 'NOT_FOUND' });
    return json(res, 200, { record });
  }

  const outreachMatch = pathname.match(/^\/api\/v1\/records\/([^/]+)\/outreach$/);
  if (outreachMatch && method === 'POST') {
    requirePermission(claims, 'outreach.log');
    const recordId = outreachMatch[1];
    const tenantResult = await withTenant(claims.tid, client => client.query('select industry_key,configuration_version from tenant where id=$1', [claims.tid]));
    const config = configurationRegistry.resolveTenant({ tenantId: claims.tid, industry: tenantResult.rows[0].industry_key, version: tenantResult.rows[0].configuration_version });
    const outcome = config.workflow.outcomes.find(x => x.key === body.outcomeKey || x.label === body.outcomeType);
    if (!outcome) throw Object.assign(new Error('Outcome is not configured for this tenant'), { status: 400, code: 'INVALID_OUTCOME' });
    const channel = ['phone','sms','whatsapp','email','in_person','other'].includes(body.channel) ? body.channel : null;
    if (!channel) throw Object.assign(new Error('Invalid outreach channel'), { status: 400, code: 'INVALID_CHANNEL' });
    const followUpDueAt = body.followUpDueAt ? new Date(body.followUpDueAt) : new Date(Date.now() + 24*3600*1000);
    if (Number.isNaN(followUpDueAt.getTime())) throw Object.assign(new Error('Invalid followUpDueAt'), { status: 400, code: 'INVALID_DATE' });
    if (followUpDueAt.getTime() < Date.now() - 60000) throw Object.assign(new Error('followUpDueAt must be in the future'), { status: 400, code: 'INVALID_DATE' });
    const idempotencyKey = String(req.headers['idempotency-key'] || '').trim();
    if (idempotencyKey && (idempotencyKey.length < 8 || idempotencyKey.length > 200)) throw Object.assign(new Error('Idempotency-Key must be 8-200 characters'), { status: 400, code: 'INVALID_IDEMPOTENCY_KEY' });
    const result = await withTenant(claims.tid, async client => {
      const record = (await client.query('select * from record where id=$1')).rows[0]; if (!record) throw Object.assign(new Error('Record not found'), { status: 404, code: 'NOT_FOUND' });
      if (config.workflow.outcomes.some(o=>o.terminal && o.resultingState===record.status)) throw Object.assign(new Error('Cannot log outreach against a terminal record'), { status: 409, code: 'RECORD_TERMINAL' });
      if (idempotencyKey) { const prior = (await client.query("select id from outreach_attempt where idempotency_key=$1 and tenant_id=current_setting('app.tenant_id')::uuid", [idempotencyKey])).rows[0]; if (prior) return { attempt: { id: prior.id }, idempotent: true }; }
      const attemptId = uuid(); const outcomeId = uuid();
      await client.query('insert into outreach_attempt(id,tenant_id,record_id,agent_id,channel,attempted_at,notes,idempotency_key) values($1,$2,$3,$4,$5,now(),$6,$7)', [attemptId, claims.tid, recordId, claims.sub, channel, body.notes || null, idempotencyKey || null]);
      await client.query('insert into outcome(id,record_id,attempt_id,type,notes,occurred_at) values($1,$2,$3,$4,$5,now())', [outcomeId, recordId, attemptId, outcome.key, body.notes || null]);
      await client.query('update record set status=$2,updated_at=now() where id=$1', [recordId, outcome.resultingState]);
      let followUp = null;
      if (outcome.createsFollowUp) {
        followUp = (await client.query('insert into follow_up(id,tenant_id,record_id,owner_id,due_at,status) values($1,$2,$3,$4,$5,\'open\') returning *', [uuid(), claims.tid, recordId, claims.sub, body.followUpDueAt || new Date(Date.now() + 24*3600*1000).toISOString()])).rows[0];
      }
      await auditQuery(client, claims, 'outreach.logged', 'record', recordId, { outcome: outcome.key, channel });
      await client.query('insert into analytics_event(id,tenant_id,name,properties) values($1,$2,$3,$4)', [uuid(), claims.tid, 'outreach.completed', JSON.stringify({ outcome: outcome.key, channel, followUp: Boolean(followUp) })]);
      return { attempt: { id: attemptId }, outcome: { id: outcomeId, key: outcome.key, resultingState: outcome.resultingState }, followUp, status: outcome.resultingState };
    });
    return json(res, result.idempotent ? 200 : 201, result);
  }

  const followMatch = pathname.match(/^\/api\/v1\/follow-ups\/([^/]+)$/);
  if (followMatch && method === 'PATCH') {
    requirePermission(claims, 'followups.manage');
    const id = followMatch[1];
    if (!['open','completed','cancelled'].includes(body.status)) throw Object.assign(new Error('Invalid follow-up status'), { status: 400, code: 'INVALID_STATUS' });
    const result = await withTenant(claims.tid, async client => {
      const r = await client.query('update follow_up set status=$2 where id=$1 returning *', [id, body.status]); if (!r.rowCount) return null;
      await auditQuery(client, claims, 'followup.updated', 'follow_up', id, { status: body.status }); return r.rows[0];
    });
    if (!result) throw Object.assign(new Error('Follow-up not found'), { status: 404, code: 'NOT_FOUND' });
    return json(res, 200, { followUp: result });
  }

  if (pathname === '/api/v1/campaigns' && method === 'GET') {
    requirePermission(claims, 'campaigns.read');
    const rows = await withTenant(claims.tid, client => client.query('select id,name,type,status,created_at from campaign order by created_at desc'));
    return json(res, 200, { campaigns: rows.rows });
  }

  if (pathname === '/api/v1/campaigns' && method === 'POST') {
    requirePermission(claims, 'campaigns.manage');
    const tenantResult = await withTenant(claims.tid, client => client.query('select industry_key,configuration_version from tenant where id=$1', [claims.tid]));
    const config = configurationRegistry.resolveTenant({ tenantId: claims.tid, industry: tenantResult.rows[0].industry_key, version: tenantResult.rows[0].configuration_version });
    if (!body.name || !body.type || !config.campaignTypes.includes(body.type)) throw Object.assign(new Error('Campaign type is not configured for this tenant'), { status: 400, code: 'INVALID_CAMPAIGN_TYPE' });
    if (body.name.length > 200) throw Object.assign(new Error('Campaign name is too long'), { status: 400, code: 'INVALID_NAME' });
    if (body.status && !['draft','active','paused','completed'].includes(body.status)) throw Object.assign(new Error('Invalid campaign status'), { status: 400, code: 'INVALID_STATUS' });
    const campaign = await withTenant(claims.tid, async client => {
      const r = await client.query('insert into campaign(id,tenant_id,name,type,status) values($1,$2,$3,$4,$5) returning *', [uuid(),claims.tid,body.name,body.type,body.status || 'draft']);
      await auditQuery(client, claims, 'campaign.created', 'campaign', r.rows[0].id); return r.rows[0];
    });
    return json(res, 201, { campaign });
  }

  if (pathname === '/api/v1/queues' && method === 'GET') {
    requirePermission(claims, 'records.read');
    const rows = await withTenant(claims.tid, client => client.query('select id,name,campaign_id,created_at from queue order by created_at desc'));
    return json(res, 200, { queues: rows.rows });
  }

  if (pathname === '/api/v1/queues' && method === 'POST') {
    requirePermission(claims, 'queues.manage');
    if (!body.name || typeof body.name !== 'string' || body.name.length > 200) throw Object.assign(new Error('A queue name is required'), { status: 400, code: 'VALIDATION_ERROR' });
    const queue = await withTenant(claims.tid, async client => {
      const r = await client.query('insert into queue(id,tenant_id,name,campaign_id) values($1,$2,$3,$4) returning *', [uuid(),claims.tid,body.name,body.campaignId || null]);
      await auditQuery(client, claims, 'queue.created', 'queue', r.rows[0].id); return r.rows[0];
    });
    return json(res, 201, { queue });
  }

  const queueMatch = pathname.match(/^\/api\/v1\/queues\/([^/]+)\/assign$/);
  if (queueMatch && method === 'POST') {
    requirePermission(claims, 'records.update');
    const queueId = queueMatch[1];
    if (!body.recordId || !body.assigneeId) throw Object.assign(new Error('recordId and assigneeId are required'), { status: 400, code: 'VALIDATION_ERROR' });
    const priority = Number(body.priority ?? 1);
    if (!Number.isInteger(priority) || priority < 1 || priority > 1000) throw Object.assign(new Error('priority must be an integer between 1 and 1000'), { status: 400, code: 'INVALID_PRIORITY' });
    const assignment = await withTenant(claims.tid, async client => {
      const tenantRow = (await client.query('select industry_key,configuration_version from tenant where id=$1',[claims.tid])).rows[0];
      const cfg = configurationRegistry.resolveTenant({tenantId:claims.tid,industry:tenantRow.industry_key,version:tenantRow.configuration_version});
      const r = await client.query('insert into assignment(id,tenant_id,record_id,assignee_id,queue_id,priority) values($1,$2,$3,$4,$5,$6) returning *', [uuid(),claims.tid,body.recordId,body.assigneeId,queueId,priority]);
      await client.query('update record set assigned_to=$2,status=case when status=$3 then $4 else status end,updated_at=now() where id=$1', [body.recordId,body.assigneeId,cfg.workflow.initialState,cfg.workflow.assignmentState]);
      await auditQuery(client, claims, 'record.assigned', 'record', body.recordId, { queueId, assigneeId: body.assigneeId }); return r.rows[0];
    });
    return json(res, 201, { assignment });
  }

  if (pathname === '/api/v1/follow-ups' && method === 'GET') {
    requirePermission(claims, 'followups.manage');
    const rows = await withTenant(claims.tid, client => client.query('select id,record_id,owner_id,due_at,status,created_at from follow_up where status=$1 order by due_at asc limit 100', [new URL(req.url, `http://${req.headers.host}`).searchParams.get('status') || 'open']));
    return json(res, 200, { followUps: rows.rows });
  }

  if (pathname === '/api/v1/roles' && method === 'GET') {
    requirePermission(claims, 'users.manage');
    const rows = await withTenant(claims.tid, client => client.query('select id,name,permissions from app_role order by name'));
    return json(res, 200, { roles: rows.rows });
  }

  if (pathname === '/api/v1/roles' && method === 'POST') {
    requirePermission(claims, 'users.manage');
    if (!body.name || !Array.isArray(body.permissions)) throw Object.assign(new Error('name and permissions are required'), { status: 400, code: 'VALIDATION_ERROR' });
    const tenantRow = await withTenant(claims.tid, client => client.query('select industry_key,configuration_version from tenant where id=$1',[claims.tid]));
    const cfg = configurationRegistry.resolveTenant({tenantId:claims.tid,industry:tenantRow.rows[0].industry_key,version:tenantRow.rows[0].configuration_version});
    if (body.permissions.includes('*')) throw Object.assign(new Error('Wildcard permissions cannot be assigned through the API'), { status: 400, code: 'INVALID_PERMISSION' });
    const invalid = body.permissions.filter(p => !cfg.permissions.includes(p));
    if (invalid.length) throw Object.assign(new Error(`Unsupported permissions: ${invalid.join(', ')}`), { status: 400, code: 'INVALID_PERMISSION' });
    const role = await withTenant(claims.tid, async client => { const r=await client.query('insert into app_role(id,tenant_id,name,permissions) values($1,$2,$3,$4) returning id,name,permissions',[uuid(),claims.tid,body.name,JSON.stringify(body.permissions)]); await auditQuery(client,claims,'role.created','app_role',r.rows[0].id); return r.rows[0]; });
    return json(res, 201, { role });
  }

  const usersPath = '/api/v1/users';
  if (pathname === usersPath && method === 'GET') {
    requirePermission(claims, 'users.manage');
    const rows = await withTenant(claims.tid, client => client.query('select u.id,u.name,u.email,u.is_active,u.created_at,r.id role_id,r.name role_name from app_user u join app_role r on r.id=u.role_id where u.tenant_id=current_setting(\'app.tenant_id\')::uuid order by u.created_at desc'));
    return json(res, 200, { users: rows.rows });
  }

  if (pathname === usersPath && method === 'POST') {
    requirePermission(claims, 'users.manage');
    const { name, email, password, roleId } = body;
    if (!name || !email || !password || !roleId) throw Object.assign(new Error('name, email, password and roleId are required'), { status: 400, code: 'VALIDATION_ERROR' });
    const user = await withTenant(claims.tid, async client => {
      const role = (await client.query('select id from app_role where id=$1', [roleId])).rows[0]; if (!role) throw Object.assign(new Error('Role not found'), { status: 400, code: 'ROLE_NOT_FOUND' });
      const r = await client.query('insert into app_user(id,tenant_id,name,email,password_hash,role_id) values($1,$2,$3,$4,$5,$6) returning id,name,email,role_id,is_active,created_at', [uuid(), claims.tid, name, email.toLowerCase(), hashPassword(password), roleId]);
      await auditQuery(client, claims, 'user.created', 'app_user', r.rows[0].id); return r.rows[0];
    });
    return json(res, 201, { user });
  }

  throw Object.assign(new Error('Route not found'), { status: 404, code: 'NOT_FOUND' });
}

export function createServer() {
  const server = http.createServer(async (req, res) => {
    const requestId = uuid();
    Object.assign(res, { requestId });
    const cors = corsHeaders(req);
    for (const [k,v] of Object.entries(cors)) res.setHeader(k,v);
    res.setHeader('x-request-id', requestId);
    res.setHeader('x-content-type-options', 'nosniff');
    res.setHeader('x-frame-options', 'DENY');
    res.setHeader('referrer-policy', 'no-referrer');
    res.setHeader('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('strict-transport-security', 'max-age=31536000; includeSubDomains');
    res.setHeader('content-security-policy', "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'");
    if (req.method === 'OPTIONS') { res.writeHead(204, { ...cors, 'access-control-allow-methods': 'GET,POST,PATCH,OPTIONS', 'access-control-allow-headers': 'Authorization,Content-Type', 'access-control-max-age': '600' }); return res.end(); }
    const url = new URL(req.url, `http://${req.headers.host}`);
    const limit = rateLimit(`${req.socket.remoteAddress || 'unknown'}:${url.pathname}`, url.pathname === '/api/v1/auth/login' ? 10 : 120);
    if (!limit.allowed) return sendError(res, 429, 'RATE_LIMITED', 'Too many requests', requestId);
    res.setHeader('x-ratelimit-remaining', String(limit.remaining));
    try {
      if (url.pathname === '/health/live') return json(res, 200, { ok: true, requestId });
      if (url.pathname === '/health/ready') { const db = await dbHealth(); return json(res, 200, { ok: true, database: db, requestId }); }
      if (url.pathname === '/metrics' && process.env.ENABLE_METRICS === 'true') {
        if (!METRICS_TOKEN || getBearer(req) !== METRICS_TOKEN) return sendError(res, 401, 'METRICS_UNAUTHORIZED', 'Metrics authentication required', requestId);
        return json(res, 200, { processUptimeSeconds: process.uptime(), memory: process.memoryUsage(), requestId });
      }
      if (url.pathname === '/api/v1/auth/login' && req.method === 'POST') { const result = await login(await readJson(req)); const safe = { ...result }; delete safe.refreshToken; return json(res, 200, safe, { 'set-cookie': refreshCookie(result.refreshToken, REFRESH_TTL_DAYS*86400) }); }
      if (url.pathname === '/api/v1/auth/refresh' && req.method === 'POST') { const result = await refreshToken(await readJson(req), req); const safe = { ...result }; delete safe.refreshToken; return json(res, 200, safe, { 'set-cookie': refreshCookie(result.refreshToken, REFRESH_TTL_DAYS*86400) }); }
      if (url.pathname === '/api/v1/auth/logout' && req.method === 'POST') { const cookie = String(req.headers.cookie || '').split(';').map(x=>x.trim()).find(x=>x.startsWith('eureach_refresh=')); if (cookie) { const token = decodeURIComponent(cookie.slice('eureach_refresh='.length)); await pool.query('select eureach_revoke_refresh_token_by_hash($1)', [hashToken(token)]); } return json(res, 200, { ok:true }, { 'set-cookie': refreshCookie('', 0) }); }
      if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/app')) { const html = fs.readFileSync(STATIC_INDEX); res.writeHead(200, {'content-type':'text/html; charset=utf-8','cache-control':'no-cache'}); return res.end(html); }
      if (req.method === 'GET' && url.pathname === '/marketing') { const html = fs.readFileSync(path.join(__dirname,'..','app','marketing.html')); res.writeHead(200, {'content-type':'text/html; charset=utf-8','cache-control':'public,max-age=3600'}); return res.end(html); }
      if (req.method === 'GET' && url.pathname === '/robots.txt') { const text = fs.readFileSync(path.join(__dirname,'..','app','robots.txt')); res.writeHead(200, {'content-type':'text/plain; charset=utf-8'}); return res.end(text); }
      if (req.method === 'GET' && url.pathname === '/sitemap.xml') { const xml = fs.readFileSync(path.join(__dirname,'..','app','sitemap.xml')); res.writeHead(200, {'content-type':'application/xml; charset=utf-8'}); return res.end(xml); }
      if (!url.pathname.startsWith('/api/v1/')) return sendError(res, 404, 'NOT_FOUND', 'Route not found', requestId);
      const claims = requireAuth(req);
      const body = ['POST','PATCH','PUT'].includes(req.method) ? await readJson(req) : {};
      return await api(req, res, claims, req.method, url.pathname, body);
    } catch (error) {
      const status = Number(error.status || 500); const code = error.code || 'INTERNAL_ERROR';
      if (status >= 500) console.error(JSON.stringify({ level:'error', requestId, message:error.message, stack:error.stack }));
      else console.warn(JSON.stringify({ level:'warn', requestId, status, code, message:error.message }));
      return sendError(res, status, code, status >= 500 ? 'Internal server error' : error.message, requestId);
    }
  });
  server.requestTimeout = Number(process.env.REQUEST_TIMEOUT_MS || 30000);
  server.headersTimeout = Number(process.env.HEADERS_TIMEOUT_MS || 10000);
  server.keepAliveTimeout = Number(process.env.KEEP_ALIVE_TIMEOUT_MS || 5000);
  return server;
}

if (process.argv[1]?.endsWith('/server/app.mjs')) createServer().listen(PORT, () => console.log(`Eureach API listening on :${PORT}`));
