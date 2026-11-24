import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readdir, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';
import { createApp } from '../server/app.js';

async function fixture(t) {
  const root = await mkdtemp(join(tmpdir(), 'nitrobison-static-'));
  const staticDir = join(root, 'dist');
  await mkdir(join(staticDir, 'assets'), { recursive: true });
  for (const [path, content] of [
    ['index.html', '<!doctype html><title>NitroBison</title>'],
    ['app.js', 'console.log("NitroBison");'],
    ['assets/app-AbCd1234.js', 'export const app = true;'],
    ['assets/diagram-XyZ98765.js', 'export const diagram = true;'],
    ['assets/draft.js', 'export const draft = true;'],
    ['sw.js', 'self.addEventListener("fetch", () => {});'],
    ['oauth-callback.html', '<!doctype html><script src="/oauth-callback.js"></script>'],
    ['oauth-callback.js', 'window.opener.postMessage({}, location.origin);'],
  ]) await writeFile(join(staticDir, path), content);
  await writeFile(join(root, 'secret.txt'), 'not public');
  const { server } = createApp({ staticDir });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await rm(root, { recursive: true, force: true });
  });
  const origin = `http://127.0.0.1:${server.address().port}`;
  const request = (path, { method = 'GET', headers = {}, body } = {}) => new Promise((resolve, reject) => {
    const req = httpRequest({ hostname: '127.0.0.1', port: server.address().port, path, method, headers }, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('error', reject);
      res.on('end', () => resolve({ status: res.statusCode, headers: new Headers(res.headers), text: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    req.end(body);
  });
  return { root, staticDir, origin, request };
}

test('personal static hosting starts without team secrets or creating a database', async t => {
  const f = await fixture(t);
  const health = await f.request('/api/health');
  assert.equal(health.status, 200);
  assert.deepEqual(JSON.parse(health.text), { ok: true });
  assert.equal(health.headers.get('cache-control'), 'no-store');
  assert.deepEqual((await readdir(f.root)).sort(), ['dist', 'secret.txt']);
});

test('retired API routes never expose sessions, invitations, members or team notes', async t => {
  const f = await fixture(t);
  await mkdir(join(f.staticDir, 'api'));
  await writeFile(join(f.staticDir, 'api', 'session'), 'must not be public');
  for (const path of ['/api', '/api/session', '/api/setup', '/api/logout', '/api/invites', '/api/invites/accept', '/api/members', '/api/members/alice', '/api/workspace', '/api/missing', '/%61pi/session']) {
    for (const method of ['GET', 'POST', 'PUT', 'DELETE']) {
      const response = await f.request(path, { method, headers: { Accept: 'text/html' }, body: method === 'POST' ? '{}' : undefined });
      assert.equal(response.status, 404, `${method} ${path}`);
      assert.equal(response.headers.get('cache-control'), 'no-store');
      assert.equal(response.headers.get('set-cookie'), null);
      assert.notEqual(response.text, 'must not be public');
    }
  }
  const wrongMethod = await f.request('/api/health', { method: 'POST' });
  assert.equal(wrongMethod.status, 405);
  assert.equal(wrongMethod.headers.get('allow'), 'GET, HEAD');
  const head = await f.request('/api/health', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.text, '');
});

test('static files and navigation retain security headers and the OAuth and diagram permissions', async t => {
  const f = await fixture(t);
  const page = await f.request('/');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(page.headers.get('x-frame-options'), 'DENY');
  assert.equal(page.headers.get('referrer-policy'), 'no-referrer');
  assert.equal(page.headers.get('cross-origin-resource-policy'), 'same-origin');
  assert.equal(page.headers.get('cross-origin-opener-policy'), 'same-origin-allow-popups');
  const csp = page.headers.get('content-security-policy');
  assert.match(csp, /object-src 'none'/);
  assert.match(csp, /frame-ancestors 'none'/);
  assert.match(csp, /worker-src 'self' blob:/);
  assert.match(csp, /https:\/\/accounts\.google\.com/);
  assert.match(csp, /https:\/\/login\.microsoftonline\.com/);
  for (const path of ['/app.js', '/assets/diagram-XyZ98765.js', '/oauth-callback.js']) {
    const script = await f.request(path);
    assert.equal(script.status, 200);
    assert.match(script.headers.get('content-type'), /javascript/);
  }
  assert.equal((await f.request('/oauth-callback.html')).status, 200);
  assert.equal((await f.request('/app.js', { method: 'HEAD' })).text, '');
  assert.equal((await f.request('/missing.js', { headers: { Accept: 'text/html' } })).status, 404);
  assert.equal((await f.request('/notes/welcome', { headers: { Accept: 'text/html', 'Sec-Fetch-Mode': 'navigate' } })).status, 200);
  assert.equal((await f.request('/notes/welcome')).status, 404);
  assert.equal((await f.request('/notes/welcome', { headers: { Accept: 'text/html', 'Sec-Fetch-Mode': 'cors' } })).status, 404);
  const post = await f.request('/', { method: 'POST', body: '{}' });
  assert.equal(post.status, 405);
  assert.equal(post.headers.get('allow'), 'GET, HEAD');
});

test('only fingerprinted assets are immutable while navigation, service worker and callback stay fresh', async t => {
  const f = await fixture(t);
  for (const path of ['/', '/app.js', '/assets/draft.js', '/sw.js', '/notes/welcome']) {
    const response = await f.request(path, { headers: { Accept: 'text/html' } });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-cache');
  }
  assert.equal((await f.request('/assets/app-AbCd1234.js')).headers.get('cache-control'), 'public, max-age=31536000, immutable');
  assert.equal((await f.request('/sw.js')).headers.get('service-worker-allowed'), '/');
  for (const path of ['/oauth-callback.html?code=private-code', '/oauth-callback.js']) {
    assert.equal((await f.request(path)).headers.get('cache-control'), 'no-store');
  }
  assert.equal((await f.request('/missing.js')).headers.get('cache-control'), 'no-store');
});

test('public paths reject traversal, invalid encodings, platform aliases and oversized URLs', async t => {
  const f = await fixture(t);
  for (const path of ['/%2e%2e%2fsecret.txt', '/.env', '/%2Egit/config', '//secret.txt', '/%5csecret.txt', '/app.js%00', '/app.js%0a', '/app.js:secret', '/app.js.', '/app.js%20', '/CON', '/nul.txt']) {
    assert.equal((await f.request(path)).status, 403, path);
  }
  assert.equal((await f.request('/%zz')).status, 400);
  assert.equal((await f.request(`/${'a'.repeat(8200)}`)).status, 414);
});

test('static hosting refuses symlinks escaping the public directory', async t => {
  const f = await fixture(t);
  try { await symlink(f.root, join(f.staticDir, 'escape'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) { if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip('Creating directory links is not permitted on this host.'); return; } throw error; }
  assert.equal((await f.request('/escape/secret.txt')).status, 403);
});
