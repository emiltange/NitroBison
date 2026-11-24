import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, rm, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { request as httpRequest } from 'node:http';

let createApp;
try { ({ createApp } = await import('../server/app.js')); } catch {}

const password = 'correct horse battery staple';
const setupToken = 'test-setup-token-with-strong-entropy';
const ownerDetails = { setupToken, email: 'owner@example.test', password, name: 'Owner', workspaceName: 'Team vault' };
const note = { id: '75ed7b3b-c309-48f8-a66c-a3a53d71c889', title: 'Welcome', folder: '', content: '# Hello', updatedAt: 1735689600000 };

async function fixture(t, options = {}) {
  assert.equal(typeof createApp, 'function', 'the backend exports an HTTP application factory');
  const root = await mkdtemp(join(tmpdir(), 'herd-server-'));
  const dataDir = join(root, 'data');
  const staticDir = join(root, 'dist');
  await mkdir(staticDir);
  await writeFile(join(staticDir, 'index.html'), '<!doctype html><title>Herd</title>');
  await writeFile(join(staticDir, 'app.js'), 'console.log("Herd");');
  await writeFile(join(staticDir, 'sw.js'), 'self.addEventListener("fetch", () => {});');
  await writeFile(join(root, 'secret.txt'), 'not public');
  let app;
  let origin;
  async function start() {
    app = await createApp({ dataDir, staticDir, setupToken, ...options });
    app.server.listen(0, '127.0.0.1');
    await once(app.server, 'listening');
    origin = `http://127.0.0.1:${app.server.address().port}`;
  }
  async function stop() {
    if (!app) return;
    await new Promise((resolve, reject) => app.server.close(error => error ? reject(error) : resolve()));
    await app.close();
    app = null;
  }
  await start();
  t.after(async () => { await stop(); await rm(root, { recursive: true, force: true }); });
  function client(initialCookie = '') {
    let cookie = initialCookie;
    return {
      get cookie() { return cookie; },
      async request(path, { method = 'GET', body, headers = {}, raw } = {}) {
        const requestHeaders = { ...headers };
        if (cookie) requestHeaders.Cookie = cookie;
        if (method !== 'GET' && method !== 'HEAD' && !Object.hasOwn(requestHeaders, 'Origin')) requestHeaders.Origin = origin;
        if (body !== undefined) requestHeaders['Content-Type'] = 'application/json';
        const payload = raw ?? (body === undefined ? undefined : JSON.stringify(body));
        if (payload !== undefined) requestHeaders['Content-Length'] = Buffer.byteLength(payload);
        const response = await new Promise((resolveResponse, reject) => {
          const request = httpRequest(origin + path, { method, headers: requestHeaders }, incoming => {
            const chunks = [];
            incoming.on('data', chunk => chunks.push(chunk));
            incoming.on('error', reject);
            incoming.on('end', () => {
              const responseHeaders = new Headers();
              for (let i = 0; i < incoming.rawHeaders.length; i += 2) responseHeaders.append(incoming.rawHeaders[i], incoming.rawHeaders[i + 1]);
              resolveResponse({ status: incoming.statusCode, headers: responseHeaders, text: Buffer.concat(chunks).toString('utf8') });
            });
          });
          request.on('error', reject);
          request.end(payload);
        });
        const setCookie = response.headers.get('set-cookie');
        if (setCookie) cookie = setCookie.split(';')[0];
        const text = response.text;
        let data;
        try { data = JSON.parse(text); } catch { data = text; }
        return { status: response.status, headers: response.headers, data };
      },
    };
  }
  return { client, root, dataDir, staticDir, get origin() { return origin; }, get server() { return app.server; }, restart: async () => { await stop(); await start(); } };
}

async function owner(f) {
  const client = f.client();
  const result = await client.request('/api/setup', { method: 'POST', body: ownerDetails });
  assert.equal(result.status, 201);
  assert.equal(result.data.user.role, 'owner');
  return client;
}

async function inviteMember(f, ownerClient, email, role = 'editor') {
  const invitation = await ownerClient.request('/api/invites', { method: 'POST', body: { email, role } });
  assert.equal(invitation.status, 201);
  assert.equal(typeof invitation.data.token, 'string');
  assert.ok(invitation.data.expiresAt > Date.now());
  const member = f.client();
  const accepted = await member.request('/api/invites/accept', { method: 'POST', body: { token: invitation.data.token, email, password, name: role } });
  assert.equal(accepted.status, 201);
  return { client: member, user: accepted.data.user, token: invitation.data.token };
}

test('setup requires the installation secret and can create only one owner', async t => {
  const f = await fixture(t);
  const anonymous = f.client();
  const { user, setupRequired } = (await anonymous.request('/api/session')).data;
  assert.deepEqual({ user, setupRequired }, { user: null, setupRequired: true });
  assert.equal((await anonymous.request('/api/workspace')).status, 401);
  assert.equal((await anonymous.request('/api/setup', { method: 'POST', body: { ...ownerDetails, setupToken: 'wrong' } })).status, 403);
  const results = await Promise.all([f.client(), f.client()].map(client => client.request('/api/setup', { method: 'POST', body: ownerDetails })));
  assert.deepEqual(results.map(result => result.status).sort(), [201, 409]);
  const success = results.find(result => result.status === 201);
  assert.equal(success.data.workspaceName, 'Team vault');
  assert.equal(success.data.user.email, 'owner@example.test');
  assert.equal(success.data.user.password, undefined);
  assert.match(success.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(success.headers.get('set-cookie'), /SameSite=Strict/i);
  assert.match(success.headers.get('set-cookie'), /Path=\//i);
  assert.match(success.headers.get('cache-control'), /no-store/i);
  assert.equal((await anonymous.request('/api/session')).data.setupRequired, false);
});

test('login validates passwords, rotates sessions and logout invalidates the cookie', async t => {
  const f = await fixture(t);
  const ownerClient = await owner(f);
  const oldCookie = ownerClient.cookie;
  assert.equal((await f.client().request('/api/session', { method: 'POST', body: { email: ownerDetails.email, password: 'wrong password' } })).status, 401);
  const loggedIn = await ownerClient.request('/api/session', { method: 'POST', body: { email: 'OWNER@example.test', password } });
  assert.equal(loggedIn.status, 200);
  assert.notEqual(ownerClient.cookie, oldCookie);
  assert.equal((await f.client(oldCookie).request('/api/workspace')).status, 401);
  const activeCookie = ownerClient.cookie;
  assert.equal((await ownerClient.request('/api/logout', { method: 'POST', body: {} })).status, 200);
  assert.equal((await f.client(activeCookie).request('/api/workspace')).status, 401);
  assert.equal((await ownerClient.request('/api/session')).data.user, null);
});

test('viewer and editor authorization is enforced on every privileged route', async t => {
  const f = await fixture(t);
  const ownerClient = await owner(f);
  const viewer = await inviteMember(f, ownerClient, 'viewer@example.test', 'viewer');
  const editor = await inviteMember(f, ownerClient, 'editor@example.test');
  assert.equal((await viewer.client.request('/api/workspace')).status, 200);
  assert.equal((await viewer.client.request('/api/workspace', { method: 'PUT', body: { revision: 0, notes: [note], folders: [] } })).status, 403);
  assert.equal((await editor.client.request('/api/workspace', { method: 'PUT', body: { revision: 0, notes: [note], folders: [] } })).status, 200);
  for (const member of [viewer, editor]) {
    assert.equal((await member.client.request('/api/invites', { method: 'POST', body: { email: 'other@example.test', role: 'editor' } })).status, 403);
    assert.equal((await member.client.request('/api/members')).status, 403);
    assert.equal((await member.client.request(`/api/members/${ownerDetails.email}`, { method: 'DELETE' })).status, 403);
  }
  const members = await ownerClient.request('/api/members');
  assert.equal(members.data.members.length, 3);
  assert.ok(members.data.members.every(member => Object.keys(member).sort().join(',') === 'email,id,name,role'));
  const ownerId = members.data.members.find(member => member.role === 'owner').id;
  assert.equal((await ownerClient.request(`/api/members/${ownerId}`, { method: 'DELETE' })).status, 403);
  assert.equal((await ownerClient.request(`/api/members/${editor.user.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await editor.client.request('/api/workspace')).status, 401);
  assert.equal((await f.client().request('/api/session', { method: 'POST', body: { email: 'editor@example.test', password } })).status, 401);
  assert.equal((await viewer.client.request('/api/workspace')).status, 200);
});

test('invitations bind normalized email and role, expire, and cannot be replayed', async t => {
  const f = await fixture(t);
  const ownerClient = await owner(f);
  assert.equal((await ownerClient.request('/api/invites', { method: 'POST', body: { email: 'bad email', role: 'viewer' } })).status, 400);
  assert.equal((await ownerClient.request('/api/invites', { method: 'POST', body: { email: 'new@example.test', role: 'owner' } })).status, 400);
  const invitation = (await ownerClient.request('/api/invites', { method: 'POST', body: { email: ' New@Example.test ', role: 'viewer' } })).data;
  const payload = { token: invitation.token, email: 'another@example.test', password, name: 'New member' };
  assert.equal((await f.client().request('/api/invites/accept', { method: 'POST', body: payload })).status, 400);
  const accepted = await f.client().request('/api/invites/accept', { method: 'POST', body: { ...payload, email: 'NEW@example.test' } });
  assert.equal(accepted.status, 201);
  assert.equal(accepted.data.user.email, 'new@example.test');
  assert.equal(accepted.data.user.role, 'viewer');
  assert.equal((await f.client().request('/api/invites/accept', { method: 'POST', body: { ...payload, email: 'new@example.test' } })).status, 400);
  const expiring = (await ownerClient.request('/api/invites', { method: 'POST', body: { email: 'late@example.test', role: 'editor' } })).data;
  t.mock.method(Date, 'now', () => expiring.expiresAt + 1);
  assert.equal((await f.client().request('/api/invites/accept', { method: 'POST', body: { token: expiring.token, email: 'late@example.test', password, name: 'Late' } })).status, 400);
});

test('accepting an invitation concurrently creates only one account and consumed invitations stay revoked', async t => {
  const f = await fixture(t);
  const ownerClient = await owner(f);
  const invitation = (await ownerClient.request('/api/invites', { method: 'POST', body: { email: 'racing@example.test', role: 'editor' } })).data;
  const payload = { token: invitation.token, email: 'racing@example.test', password, name: 'Racing' };
  const results = await Promise.all([f.client(), f.client()].map(client => client.request('/api/invites/accept', { method: 'POST', body: payload })));
  assert.deepEqual(results.map(result => result.status).sort(), [201, 400]);
  const member = results.find(result => result.status === 201).data.user;
  assert.equal((await ownerClient.request(`/api/members/${member.id}`, { method: 'DELETE' })).status, 200);
  assert.equal((await f.client().request('/api/invites/accept', { method: 'POST', body: payload })).status, 400);
});

test('optimistic revisions reject stale and concurrent writes without losing tombstones', async t => {
  const f = await fixture(t);
  const ownerClient = await owner(f);
  assert.deepEqual((await ownerClient.request('/api/workspace')).data, { revision: 0, notes: [], folders: [] });
  const initial = await ownerClient.request('/api/workspace', { method: 'PUT', body: { revision: 0, notes: [note], folders: ['Projects'] } });
  assert.equal(initial.status, 200);
  assert.equal(initial.data.revision, 1);
  const stale = await ownerClient.request('/api/workspace', { method: 'PUT', body: { revision: 0, notes: [], folders: [] } });
  assert.equal(stale.status, 409);
  assert.deepEqual(stale.data.workspace, initial.data);
  const deleted = { ...note, updatedAt: note.updatedAt + 1, deleted: true };
  const writes = await Promise.all(['One', 'Two'].map(title => ownerClient.request('/api/workspace', { method: 'PUT', body: { revision: 1, notes: [deleted, { ...note, id: '522735a0-45b0-48d3-83d6-7dc5ec67428f', title }], folders: ['Projects'] } })));
  assert.deepEqual(writes.map(result => result.status).sort(), [200, 409]);
  const snapshot = (await ownerClient.request('/api/workspace')).data;
  assert.equal(snapshot.revision, 2);
  assert.equal(snapshot.notes[0].deleted, true);
  const omission = await ownerClient.request('/api/workspace', { method: 'PUT', body: { revision: 2, notes: [], folders: [] } });
  assert.equal(omission.status, 400, 'existing notes must be retained, using tombstones for deletion');
  assert.deepEqual((await ownerClient.request('/api/workspace')).data, snapshot);
});

test('snapshots reject malformed trust-boundary data without modifying the workspace', async t => {
  const f = await fixture(t);
  const ownerClient = await owner(f);
  const invalid = [
    { revision: -1, notes: [], folders: [] },
    { revision: 0, notes: [note, note], folders: [] },
    { revision: 0, notes: [{ ...note, id: '' }], folders: [] },
    { revision: 0, notes: [{ ...note, content: {} }], folders: [] },
    { revision: 0, notes: [{ ...note, updatedAt: null }], folders: [] },
    { revision: 0, notes: [{ ...note, deleted: 'yes' }], folders: [] },
    { revision: 0, notes: [{ ...note, folder: '../secret' }], folders: [] },
    { revision: 0, notes: [null], folders: [] },
    { revision: 0, notes: [], folders: [null] },
    { revision: 0, notes: [], folders: ['A/../B'] },
    { revision: 0, notes: [], folders: ['A\\B'] },
  ];
  for (const body of invalid) assert.equal((await ownerClient.request('/api/workspace', { method: 'PUT', body })).status, 400, JSON.stringify(body));
  assert.deepEqual((await ownerClient.request('/api/workspace')).data, { revision: 0, notes: [], folders: [] });
});

test('accounts, sessions, invitations and workspace revisions survive application restart', async t => {
  const f = await fixture(t);
  const ownerClient = await owner(f);
  const invitation = (await ownerClient.request('/api/invites', { method: 'POST', body: { email: 'later@example.test', role: 'viewer' } })).data;
  await ownerClient.request('/api/workspace', { method: 'PUT', body: { revision: 0, notes: [note], folders: [] } });
  const cookie = ownerClient.cookie;
  await f.restart();
  const restored = f.client(cookie);
  assert.equal((await restored.request('/api/session')).data.user.role, 'owner');
  assert.deepEqual((await restored.request('/api/workspace')).data, { revision: 1, notes: [note], folders: [] });
  assert.equal((await f.client().request('/api/session', { method: 'POST', body: { email: ownerDetails.email, password } })).status, 200);
  assert.equal((await f.client().request('/api/invites/accept', { method: 'POST', body: { token: invitation.token, email: 'later@example.test', password, name: 'Later' } })).status, 201);
  const files = await import('node:fs/promises').then(fs => fs.readdir(f.dataDir));
  assert.ok(files.some(file => /\.sqlite$/.test(file)), 'workspace uses a durable SQLite database');
  for (const file of files) {
    const bytes = await readFile(join(f.dataDir, file));
    assert.equal(bytes.includes(Buffer.from(password)), false, 'plaintext passwords are never persisted');
    assert.equal(bytes.includes(Buffer.from(invitation.token)), false, 'raw invitation tokens are not persisted');
    assert.equal(bytes.includes(Buffer.from(cookie.split('=')[1])), false, 'raw session cookies are not persisted');
  }
});

test('mutations reject cross-origin requests, unsupported media and oversized bodies', async t => {
  const f = await fixture(t);
  const ownerClient = await owner(f);
  assert.equal((await ownerClient.request('/api/logout', { method: 'POST', headers: { Origin: 'https://evil.example' }, body: {} })).status, 403);
  assert.equal((await ownerClient.request('/api/logout', { method: 'POST', headers: { Origin: 'null' }, body: {} })).status, 403);
  assert.equal((await ownerClient.request('/api/logout', { method: 'POST', headers: { 'Sec-Fetch-Site': 'cross-site' }, body: {} })).status, 403);
  assert.equal((await ownerClient.request('/api/workspace', { method: 'PUT', raw: '{}' })).status, 415);
  assert.equal((await ownerClient.request('/api/workspace', { method: 'PUT', raw: '{', headers: { 'Content-Type': 'application/json' } })).status, 400);
  assert.equal((await ownerClient.request('/api/setup', { method: 'POST', body: { ...ownerDetails, name: 'x'.repeat(70_000) } })).status, 413);
  assert.equal((await ownerClient.request('/api/workspace')).status, 200);
  assert.equal((await ownerClient.request('/api/health')).headers.get('access-control-allow-origin'), null);
});

test('static serving protects private paths and only falls back for HTML navigation', async t => {
  const f = await fixture(t, { secureCookies: true });
  const client = f.client();
  const page = await client.request('/');
  assert.equal(page.status, 200);
  assert.match(page.headers.get('content-type'), /text\/html/);
  assert.match(page.headers.get('content-security-policy'), /object-src 'none'/);
  assert.equal(page.headers.get('x-content-type-options'), 'nosniff');
  const script = await client.request('/app.js');
  assert.equal(script.status, 200);
  assert.match(script.headers.get('content-type'), /javascript/);
  assert.equal((await client.request('/app.js', { method: 'HEAD' })).data, '');
  assert.equal((await client.request('/missing.js', { headers: { Accept: 'text/html' } })).status, 404);
  assert.equal((await client.request('/notes/welcome', { headers: { Accept: 'text/html', 'Sec-Fetch-Mode': 'navigate' } })).status, 200);
  assert.equal((await client.request('/notes/welcome')).status, 404);
  assert.equal((await client.request('/%2e%2e%2fsecret.txt')).status, 403);
  assert.equal((await client.request('/.env')).status, 403);
  assert.equal((await client.request('/api/missing', { headers: { Accept: 'text/html' } })).status, 404);
  assert.match((await client.request('/sw.js')).headers.get('cache-control'), /no-cache|no-store/);
  const setup = await client.request('/api/setup', { method: 'POST', body: ownerDetails });
  assert.match(setup.headers.get('set-cookie'), /; Secure/i);
});

test('revocation while a workspace upload is pending cannot commit a final write', async t => {
  const f = await fixture(t);
  const ownerClient = await owner(f);
  const editor = await inviteMember(f, ownerClient, 'uploading@example.test');
  const payload = JSON.stringify({ revision: 0, notes: [note], folders: [] });
  let pending;
  const received = once(f.server, 'request');
  const result = new Promise((resolveResponse, reject) => {
    pending = httpRequest(f.origin + '/api/workspace', {
      method: 'PUT',
      headers: { Cookie: editor.client.cookie, Origin: f.origin, 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
    }, response => {
      response.resume();
      response.on('end', () => resolveResponse(response.statusCode));
      response.on('error', reject);
    });
    pending.on('error', reject);
    pending.write(payload.slice(0, 10));
  });
  await received;
  assert.equal((await ownerClient.request(`/api/members/${editor.user.id}`, { method: 'DELETE' })).status, 200);
  pending.end(payload.slice(10));
  assert.equal(await result, 401);
  assert.deepEqual((await ownerClient.request('/api/workspace')).data, { revision: 0, notes: [], folders: [] });
});

test('reissuing an invitation invalidates the old token and records the new role', async t => {
  const f = await fixture(t);
  const ownerClient = await owner(f);
  const first = (await ownerClient.request('/api/invites', { method: 'POST', body: { email: 'replace@example.test', role: 'editor' } })).data;
  const replacement = (await ownerClient.request('/api/invites', { method: 'POST', body: { email: 'replace@example.test', role: 'viewer' } })).data;
  const member = f.client();
  const payload = { email: 'replace@example.test', name: 'Replacement', password };
  assert.equal((await member.request('/api/invites/accept', { method: 'POST', body: { ...payload, token: first.token } })).status, 400);
  const accepted = await member.request('/api/invites/accept', { method: 'POST', body: { ...payload, token: replacement.token } });
  assert.equal(accepted.status, 201);
  assert.equal(accepted.data.user.role, 'viewer');
  await ownerClient.request(`/api/members/${accepted.data.user.id}`, { method: 'DELETE' });
  const revokedCookie = member.cookie;
  await f.restart();
  assert.equal((await f.client(revokedCookie).request('/api/workspace')).status, 401);
  assert.equal((await member.request('/api/invites/accept', { method: 'POST', body: { ...payload, token: replacement.token } })).status, 400);
});

test('expired sessions cannot access notes but a password login creates a fresh session', async t => {
  const f = await fixture(t);
  const ownerClient = await owner(f);
  const expiredAt = Date.now() + 31 * 24 * 60 * 60 * 1000;
  t.mock.method(Date, 'now', () => expiredAt);
  assert.equal((await ownerClient.request('/api/workspace')).status, 401);
  assert.equal((await ownerClient.request('/api/session')).data.user, null);
  assert.equal((await ownerClient.request('/api/session', { method: 'POST', body: { email: ownerDetails.email, password } })).status, 200);
  assert.equal((await ownerClient.request('/api/workspace')).status, 200);
});

test('safe imported note identifiers and normalized folders are preserved', async t => {
  const f = await fixture(t);
  const ownerClient = await owner(f);
  const imported = { ...note, id: 'sample-welcome', folder: 'Projects/Research' };
  const result = await ownerClient.request('/api/workspace', { method: 'PUT', body: { revision: 0, notes: [imported], folders: [] } });
  assert.equal(result.status, 200);
  assert.deepEqual(result.data, { revision: 1, notes: [imported], folders: ['Projects', 'Projects/Research'] });
});

test('authentication attempts are bounded before expensive password work', async t => {
  const f = await fixture(t);
  const client = f.client();
  for (let attempt = 0; attempt < 30; attempt++) {
    assert.equal((await client.request('/api/setup', { method: 'POST', body: { ...ownerDetails, setupToken: 'incorrect' } })).status, 403);
  }
  const throttled = await client.request('/api/setup', { method: 'POST', body: ownerDetails });
  assert.equal(throttled.status, 429);
  assert.ok(Number(throttled.headers.get('retry-after')) > 0);
  assert.equal((await client.request('/api/session')).data.setupRequired, true);
});
