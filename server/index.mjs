import { createServer } from './app.mjs';
import { pool } from './db.mjs';
const port = Number(process.env.PORT || 8080);
const server = createServer();
server.listen(port, '0.0.0.0', () => console.log(JSON.stringify({ service:'eureach-api', status:'started', port })));

let shuttingDown = false;
async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(JSON.stringify({ service:'eureach-api', status:'shutting_down', signal }));
  const force = setTimeout(() => process.exit(1), Number(process.env.SHUTDOWN_TIMEOUT_MS || 10000));
  force.unref();
  server.close(async () => {
    try { await pool.end(); } finally { clearTimeout(force); process.exit(0); }
  });
}
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
