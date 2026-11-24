import { createServer } from 'node:http';
import { open, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep, extname, join } from 'node:path';
import { pipeline } from 'node:stream/promises';

const CSP = [
  "default-src 'self'",
  "script-src 'self' https://accounts.google.com/gsi/client",
  "style-src 'self' 'unsafe-inline' https://accounts.google.com/gsi/style",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  "connect-src 'self' https: http://localhost:* http://127.0.0.1:* http://[::1]:*",
  'frame-src https://accounts.google.com https://login.microsoftonline.com',
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.map': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png',
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.avif': 'image/avif',
  '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.otf': 'font/otf',
  '.wasm': 'application/wasm', '.txt': 'text/plain; charset=utf-8', '.pdf': 'application/pdf',
};

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
function fail(status, message) { throw new HttpError(status, message); }
function inside(root, path) {
  const pathFromRoot = relative(root, path);
  return !isAbsolute(pathFromRoot) && pathFromRoot !== '..' && !pathFromRoot.startsWith(`..${sep}`);
}
function json(req, res, status, value) {
  const body = JSON.stringify(value);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(body), 'Cache-Control': 'no-store' });
  res.end(req.method === 'HEAD' ? undefined : body);
}
function publicPath(url) {
  if (url.length > 8192) fail(414, 'The requested URL is too long.');
  let pathname;
  try { pathname = decodeURIComponent(url.split('?')[0]); } catch { fail(400, 'Invalid URL encoding.'); }
  if (!pathname.startsWith('/') || pathname.startsWith('//') || /[\\\x00-\x1f\x7f]/.test(pathname)) fail(403, 'This path is not public.');
  const segments = pathname.split('/').filter(Boolean);
  if (segments.some(part => part.startsWith('.') || /[:<>"|?*]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(part))) fail(403, 'This path is not public.');
  return { pathname, segments };
}

async function serveStatic(req, res, staticRoot, pathname, segments) {
  const root = await realpath(staticRoot).catch(error => {
    if (error.code === 'ENOENT') fail(404, 'The application has not been built.');
    throw error;
  });
  async function findFile(path) {
    let actual;
    try { actual = await realpath(path); } catch (error) {
      if (['ENOENT', 'ENOTDIR'].includes(error.code)) return null;
      throw error;
    }
    if (!inside(root, actual)) fail(403, 'This path is not public.');
    const metadata = await stat(actual);
    if (!metadata.isFile()) return null;
    return { file: await open(actual, 'r'), metadata, actual };
  }
  let found = await findFile(join(root, ...segments, ...(segments.length ? [] : ['index.html'])));
  const navigation = (req.headers.accept || '').includes('text/html') && (!req.headers['sec-fetch-mode'] || req.headers['sec-fetch-mode'] === 'navigate');
  if (!found && navigation && !extname(pathname)) found = await findFile(join(root, 'index.html'));
  if (!found) fail(404, 'Not found.');
  const { file, metadata, actual } = found;
  res.setHeader('Content-Type', MIME[extname(actual).toLowerCase()] || 'application/octet-stream');
  res.setHeader('Content-Length', metadata.size);
  const fingerprinted = segments[0] === 'assets' && /-[A-Za-z0-9_-]{8,}\.[A-Za-z0-9]+$/.test(segments.at(-1));
  const callback = pathname === '/oauth-callback.html' || pathname === '/oauth-callback.js';
  res.setHeader('Cache-Control', callback ? 'no-store' : fingerprinted ? 'public, max-age=31536000, immutable' : 'no-cache');
  if (pathname === '/sw.js') res.setHeader('Service-Worker-Allowed', '/');
  if (req.method === 'HEAD') { await file.close(); res.end(); return; }
  try { await pipeline(file.createReadStream(), res); } finally { await file.close(); }
}

export function createApp({ staticDir }) {
  if (typeof staticDir !== 'string' || !staticDir.trim()) throw new Error('staticDir is required.');
  const staticRoot = resolve(staticDir);
  const server = createServer({ maxHeaderSize: 16 * 1024, requestTimeout: 30_000, headersTimeout: 15_000, keepAliveTimeout: 5000 }, (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
    res.setHeader('Content-Security-Policy', CSP);
    const handle = async () => {
      const { pathname, segments } = publicPath(req.url);
      if ((pathname === '/api' || pathname.startsWith('/api/')) && pathname !== '/api/health') fail(404, 'Not found.');
      if (!['GET', 'HEAD'].includes(req.method)) { res.setHeader('Allow', 'GET, HEAD'); fail(405, 'Method not allowed.'); }
      if (pathname === '/api/health') return json(req, res, 200, { ok: true });
      return serveStatic(req, res, staticRoot, pathname, segments);
    };
    handle().catch(error => {
      if (res.destroyed || res.writableEnded) return;
      if (res.headersSent) { res.destroy(); return; }
      const status = error.status || 500;
      if (status === 500) console.error('NitroBison request failed:', error);
      if ([400, 414].includes(status)) res.setHeader('Connection', 'close');
      req.resume();
      json(req, res, status, { error: error.status ? error.message : 'The server could not complete this request.' });
    });
  });
  server.maxRequestsPerSocket = 100;
  return { server };
}
