import { randomBytes } from 'node:crypto';
import { resolve } from 'node:path';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535.');
if (process.env.SECURE_COOKIES && !['true', 'false'].includes(process.env.SECURE_COOKIES)) {
  throw new Error('SECURE_COOKIES must be true or false.');
}
const setupToken = process.env.SETUP_TOKEN || randomBytes(32).toString('base64url');
const { server, close } = createApp({
  dataDir: resolve(process.env.DATA_DIR || './data'),
  staticDir: resolve(process.env.STATIC_DIR || './dist'),
  setupToken,
  secureCookies: process.env.SECURE_COOKIES === 'true',
});

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => server.closeAllConnections(), 10_000);
  deadline.unref();
  server.close(() => {
    clearTimeout(deadline);
    close();
  });
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
server.on('error', error => {
  console.error(`NitroBison could not listen: ${error.message}`);
  close();
  process.exitCode = 1;
});
server.listen(port, process.env.HOST || '0.0.0.0', () => {
  console.log(`NitroBison listening on ${process.env.HOST || '0.0.0.0'}:${server.address().port}`);
  if (!process.env.SETUP_TOKEN) console.log(`First-run setup token: ${setupToken}`);
});
