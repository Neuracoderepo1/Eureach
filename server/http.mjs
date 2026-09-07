export function json(res, status, body, headers = {}) {
  const payload = JSON.stringify(body);
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers });
  res.end(payload);
}

export function noContent(res) { res.writeHead(204); res.end(); }

export function sendError(res, status, code, message, requestId) {
  json(res, status, { error: { code, message, requestId } });
}

export async function readJson(req, maxBytes = 1_000_000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw Object.assign(new Error('Request body too large'), { status: 413, code: 'PAYLOAD_TOO_LARGE' });
    chunks.push(chunk);
  }
  if (!size) return {};
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw Object.assign(new Error('Invalid JSON body'), { status: 400, code: 'INVALID_JSON' }); }
}

export function getBearer(req) {
  const value = req.headers.authorization || '';
  return value.startsWith('Bearer ') ? value.slice(7) : null;
}

export function corsHeaders(req) {
  const origin = req.headers.origin;
  const allowed = (process.env.CORS_ORIGINS || '').split(',').map(x => x.trim()).filter(Boolean);
  return origin && (allowed.includes(origin) || allowed.includes('*')) ? { 'access-control-allow-origin': origin, vary: 'Origin', 'access-control-allow-credentials': 'true' } : {};
}
