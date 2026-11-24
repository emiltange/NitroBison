import test, { before, after } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { runInNewContext } from 'node:vm';

let directory;
let worker;
before(async () => {
  directory = await mkdtemp(join(tmpdir(), 'nitrobison-offline-'));
  await mkdir(join(directory, 'dist'));
  await Promise.all([
    writeFile(join(directory, 'dist/index.html'), 'Cached offline app'),
    writeFile(join(directory, 'dist/manifest.webmanifest'), '{}'),
  ]);
  execFileSync(process.execPath, [fileURLToPath(new URL('../scripts/build-sw.js', import.meta.url))], { cwd: directory });
  worker = await readFile(join(directory, 'dist/sw.js'), 'utf8');
});
after(async () => { if (directory) await rm(directory, { recursive: true, force: true }); });

function navigate(path, fetch) {
  const listeners = new Map();
  runInNewContext(worker, {
    URL,
    self: { location: { origin: 'https://vault.test' }, addEventListener: (name, handler) => listeners.set(name, handler) },
    caches: { open: async () => ({ match: async request => {
      const url = typeof request === 'string' ? request : new URL(request.url).pathname;
      return ['/', '/index.html'].includes(url) ? new Response('Cached offline app') : undefined;
    } }) },
    fetch,
  });
  let response;
  listeners.get('fetch')({
    request: { url: `https://vault.test${path}`, method: 'GET', mode: 'navigate' },
    respondWith: promise => { response = promise; },
  });
  return response;
}

test('online navigation uses the deployed app instead of an older cached shell', async () => {
  const response = await navigate('/', async () => new Response('Current deployed app'));
  assert.equal(await response.text(), 'Current deployed app');
});

test('offline navigation and deep links still open the cached app', async () => {
  for (const path of ['/', '/projects/work']) {
    const response = await navigate(path, async () => { throw new TypeError('Network unavailable'); });
    assert.equal(await response.text(), 'Cached offline app');
  }
});

test('a server failure falls back to the offline app rather than replacing it with an error page', async () => {
  const response = await navigate('/', async () => new Response('Upstream unavailable', { status: 503 }));
  assert.equal(await response.text(), 'Cached offline app');
});
