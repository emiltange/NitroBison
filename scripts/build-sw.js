import assert from 'node:assert/strict';
import { readdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

async function files(dir, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const groups = await Promise.all(entries.map(entry => entry.isDirectory()
    ? files(join(dir, entry.name), `${prefix}${entry.name}/`)
    : [`/${prefix}${entry.name}`]));
  return groups.flat();
}
const assets = (await files('dist')).filter(path => path !== '/sw.js' && path !== '/oauth-callback.html');
assert(assets.includes('/index.html') && assets.includes('/manifest.webmanifest'), 'Build the complete application before generating its offline cache.');
const hash = createHash('sha256');
for (const path of assets) hash.update(await readFile(`dist${path}`));
const version = `herd-${hash.digest('hex').slice(0, 16)}`;
await writeFile('dist/sw.js', `const CACHE = ${JSON.stringify(version)};
const ASSETS = ${JSON.stringify(['/', ...assets])};
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(cache => cache.addAll(ASSETS)));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(key => key.startsWith('herd-') && key !== CACHE).map(key => caches.delete(key)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname === '/oauth-callback.html') return;
  event.respondWith(caches.open(CACHE).then(async cache => {
    const cached = await cache.match(event.request, {ignoreSearch: true});
    if (event.request.mode === 'navigate') {
      try {
        const response = await fetch(event.request);
        if (response.ok) return response;
        return cached || await cache.match('/') || response;
      } catch (error) {
        const fallback = cached || await cache.match('/');
        if (fallback) return fallback;
        throw error;
      }
    }
    if (cached) return cached;
    return fetch(event.request);
  }));
});
`);
console.log(`Offline cache: ${assets.length} bundled resources (${version})`);
