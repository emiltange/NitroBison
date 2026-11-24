import { resolve } from 'node:path';
import { createApp } from './app.js';

const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 0 || port > 65535) throw new Error('PORT must be an integer from 0 to 65535.');
const { server } = createApp({ staticDir: resolve(process.env.STATIC_DIR || './dist') });

let stopping = false;
function shutdown() {
  if (stopping) return;
  stopping = true;
  const deadline = setTimeout(() => server.closeAllConnections(), 10_000);
  deadline.unref();
  server.close(() => clearTimeout(deadline));
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
server.on('error', error => {
  console.error(`NitroBison could not listen: ${error.message}`);
  process.exitCode = 1;
});
server.listen(port, process.env.HOST || '0.0.0.0', () => {
  console.log(`NitroBison listening on ${process.env.HOST || '0.0.0.0'}:${server.address().port}`);
});
