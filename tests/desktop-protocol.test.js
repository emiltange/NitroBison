import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import * as desktop from '../desktop/protocol.js';

async function bundle(t) {
  const root = await mkdtemp(join(tmpdir(), 'nitrobison-protocol-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'index.html'), '<h1>Local notes</h1>');
  await writeFile(join(root, 'assets/diagram.js'), 'export const diagram = true;');
  return root;
}

test('desktop serves only its bundled frontend with script MIME, CSP and HEAD semantics', async t => {
  const root = await bundle(t);
  const page = await desktop.serveApp(new Request('app://bundle/'), root);
  assert.equal(page.status, 200);
  assert.equal(await page.text(), '<h1>Local notes</h1>');
  assert.match(page.headers.get('content-security-policy'), /script-src 'self'/);
  assert.match(page.headers.get('content-security-policy'), /object-src 'none'/);
  const script = await desktop.serveApp(new Request('app://bundle/assets/diagram.js'), root);
  assert.match(script.headers.get('content-type'), /javascript/);
  assert.equal(await script.text(), 'export const diagram = true;');
  const head = await desktop.serveApp(new Request('app://bundle/assets/diagram.js', { method: 'HEAD' }), root);
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('desktop refuses other origins, encoded escapes, non-GET methods and unavailable APIs', async t => {
  const root = await bundle(t);
  for (const url of ['app://attacker/index.html', 'https://bundle/index.html', 'app://bundle/assets/%2e%2e%2f%2e%2e%2fsecret.txt', 'app://bundle/assets/%5csecret', 'app://bundle/api/workspace', 'app://bundle/sw.js', 'app://bundle/oauth-callback.html']) {
    const response = await desktop.serveApp(new Request(url), root);
    assert(response.status >= 400, url);
    assert.doesNotMatch(await response.text(), /Local notes/);
  }
  const response = await desktop.serveApp(new Request('app://bundle/', { method: 'POST', body: 'untrusted' }), root);
  assert.equal(response.status, 405);
});

test('desktop does not follow a bundled directory link outside its asset root', async t => {
  const root = await bundle(t);
  const outside = await mkdtemp(join(tmpdir(), 'nitrobison-private-'));
  t.after(() => rm(outside, { recursive: true, force: true }));
  await writeFile(join(outside, 'secret.txt'), 'Private vault backup');
  await symlink(outside, join(root, 'linked'), process.platform === 'win32' ? 'junction' : 'dir');
  const response = await desktop.serveApp(new Request('app://bundle/linked/secret.txt'), root);
  assert.equal(response.status, 403);
  assert.doesNotMatch(await response.text(), /Private vault backup/);
});

test('native entry trust rejects lookalike origins, credentials and non-document paths', () => {
  assert.equal(desktop.isAppPage('app://bundle/#note=abc'), true);
  assert.equal(desktop.isAppPage('app://bundle/index.html'), true);
  for (const url of ['app://bundle.attacker/', 'app://user@bundle/', 'app://bundle:99/', 'app://bundle/assets/diagram.js', 'https://bundle/', 'file:///index.html', 'not a url']) assert.equal(desktop.isAppPage(url), false, url);
});
