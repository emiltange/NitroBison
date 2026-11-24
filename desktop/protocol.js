import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve, relative, isAbsolute, sep, extname } from 'node:path';

export const APP_URL = 'app://bundle/';
const CSP = [
  "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:", "font-src 'self' data:",
  "connect-src 'self' https://www.googleapis.com https://graph.microsoft.com https://*.1drv.com https://*.sharepoint.com",
  "worker-src 'self' blob:", "object-src 'none'", "frame-src 'none'", "base-uri 'none'", "form-action 'none'", "frame-ancestors 'none'",
].join('; ');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.ico': 'image/x-icon',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wasm': 'application/wasm',
};

export function isAppPage(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'app:' && url.host === 'bundle' && !url.username && !url.password && ['/', '/index.html'].includes(url.pathname);
  } catch { return false; }
}

export async function serveApp(request, root) {
  const headers = { 'Content-Security-Policy': CSP, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store' };
  const reject = status => new Response(request.method === 'HEAD' ? null : 'This resource is not available in the desktop app.', { status, headers });
  if (!['GET', 'HEAD'].includes(request.method)) return reject(405);
  let url, pathname;
  try { url = new URL(request.url); pathname = decodeURIComponent(url.pathname); } catch { return reject(400); }
  if (url.protocol !== 'app:' || url.host !== 'bundle' || url.username || url.password) return reject(403);
  const parts = pathname.split('/').filter(Boolean);
  if (pathname.length > 8192 || /[\\\x00-\x1f\x7f]/.test(pathname) || parts.some(part => part.startsWith('.') || /[:<>"|?*]/.test(part)) || pathname.startsWith('//')) return reject(403);
  if (parts[0] === 'api' || ['sw.js', 'oauth-callback.html', 'oauth-callback.js'].includes(parts[0])) return reject(404);
  try {
    const actualRoot = await realpath(root);
    const path = await realpath(resolve(actualRoot, ...parts, ...(parts.length ? [] : ['index.html'])));
    const within = relative(actualRoot, path);
    if (isAbsolute(within) || within === '..' || within.startsWith(`..${sep}`)) return reject(403);
    const type = MIME[extname(path).toLowerCase()];
    if (!type || !(await stat(path)).isFile()) return reject(404);
    return new Response(request.method === 'HEAD' ? null : await readFile(path), { headers: { ...headers, 'Content-Type': type } });
  } catch (error) {
    if (['ENOENT', 'ENOTDIR'].includes(error.code)) return reject(404);
    return reject(500);
  }
}
