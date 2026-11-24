import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';

import * as cloud from '../src/cloud.js';
const note = (overrides = {}) => ({ id: 'b6bf1fc1-c777-4e31-b342-1ab4c870e6f4', title: 'Welcome', folder: '', content: '# Hello', updatedAt: 1000, ...overrides });
const snapshot = () => ({ notes: [note()], folders: [] });
const file = (name, content, path = '') => ({ name, webkitRelativePath: path, lastModified: 1000, text: async () => content });
const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });

function replace(t, key, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  t.after(() => descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]);
}

function browser(t) {
  replace(t, 'window', { location: { origin: 'https://herd.example', protocol: 'https:' } });
  replace(t, 'navigator', { onLine: true });
}

function google(t, response = {}) {
  browser(t);
  replace(t, 'google', { accounts: { oauth2: { initTokenClient(config) {
    return { requestAccessToken() { queueMicrotask(() => config.callback({ access_token: 'memory-only-token', expires_in: 3600, token_type: 'Bearer', scope: 'https://www.googleapis.com/auth/drive.file openid https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email', state: config.state, ...response })); } };
  } } } });
}

function directory(initial = {}) {
  const files = new Map(Object.entries(initial));
  const folders = new Map();
  const writes = [];
  return {
    files, folders, writes,
    async getDirectoryHandle(name, { create } = {}) {
      if (!folders.has(name)) {
        if (!create) throw new DOMException('Missing directory', 'NotFoundError');
        folders.set(name, directory());
      }
      return folders.get(name);
    },
    async getFileHandle(name, { create } = {}) {
      if (!files.has(name)) {
        if (!create) throw new DOMException('Missing file', 'NotFoundError');
        files.set(name, '');
      }
      return {
        getFile: async () => ({ size: new TextEncoder().encode(files.get(name)).byteLength, text: async () => files.get(name) }),
        createWritable: async () => ({ write: async value => { writes.push(name); files.set(name, value); }, close: async () => {} }),
      };
    },
  };
}

function microsoft(t, { badState = false } = {}) {
  browser(t);
  const listeners = new Set();
  const popup = { closed: false, close() { this.closed = true; }, location: {} };
  let authorize;
  Object.defineProperty(popup.location, 'href', { set(value) {
    authorize = new URL(value);
    queueMicrotask(() => {
      for (const listener of listeners) listener({ origin: 'https://herd.example', source: popup, data: { type: 'herd-oauth-callback', code: 'one-use-code', state: badState ? 'attacker' : authorize.searchParams.get('state') } });
    });
  } });
  window.open = () => popup;
  window.addEventListener = (name, listener) => { if (name === 'message') listeners.add(listener); };
  window.removeEventListener = (name, listener) => listeners.delete(listener);
  return { popup, authorize: () => authorize, listeners };
}

test('Markdown imports preserve selected folder paths and ignore non-Markdown files', async () => {
  const result = await cloud.importMarkdownFiles([
    file('Start.md', '# Start', 'Vault/Start.md'),
    file('Design.MD', 'Content', 'Vault/Projects/Design.MD'),
    file('image.png', 'not markdown', 'Vault/image.png'),
  ]);
  assert.deepEqual(result.folders, ['Vault', 'Vault/Projects']);
  assert.deepEqual(result.notes.map(({ title, folder, content }) => ({ title, folder, content })), [
    { title: 'Start', folder: 'Vault', content: '# Start' },
    { title: 'Design', folder: 'Vault/Projects', content: 'Content' },
  ]);
  assert.equal(new Set(result.notes.map(value => value.id)).size, 2);
});

test('Markdown import rejects traversal, unsafe and portable duplicate names before reading', async () => {
  for (const path of ['../oops.md', '/oops.md', 'Vault/../oops.md', 'Vault\\oops.md', 'Vault/CON.md', 'Vault/ends./x.md', 'Vault//x.md', 'Vault/x?.md']) {
    await assert.rejects(cloud.importMarkdownFiles([file('oops.md', '', path)]), /path|name|unsafe/i, path);
  }
  await assert.rejects(cloud.importMarkdownFiles([file('A.md', 'first'), file('a.MD', 'second')]), /duplicate|collision/i);
  await assert.rejects(cloud.importMarkdownFiles([file('a.md', 'one'), file('b.md', 'two', 'a.md/b.md')]), /collision|file.*folder/i);
});

test('folder export preserves hierarchy and skips tombstones', async t => {
  const root = directory();
  replace(t, 'showDirectoryPicker', async () => root);
  const result = await cloud.exportMarkdownFolder({ notes: [note({ folder: 'Projects' }), note({ id: '7c584986-6bd5-4db4-b540-ffaf59c849c6', title: 'Deleted', deleted: true })], folders: ['Projects', 'Empty/Nested'] });
  assert.equal(root.folders.get('Projects').files.get('Welcome.md'), '# Hello');
  assert.ok(root.folders.get('Empty').folders.has('Nested'));
  assert.equal(root.files.size, 0);
  assert.equal(result, 1);
});

test('folder export never overwrites differing existing files and skips identical files', async t => {
  const root = directory({ 'Welcome.md': 'precious local edit' });
  replace(t, 'showDirectoryPicker', async () => root);
  await assert.rejects(cloud.exportMarkdownFolder(snapshot()), /exist|conflict|overwrite/i);
  assert.equal(root.files.get('Welcome.md'), 'precious local edit');
  assert.deepEqual(root.writes, []);
  root.files.set('Welcome.md', '# Hello');
  assert.equal(await cloud.exportMarkdownFolder(snapshot()), 1);
  assert.deepEqual(root.writes, []);
});

test('folder export preflights all collisions before writing and validates duplicate paths', async t => {
  const root = directory({ 'Z.md': 'keep me' });
  replace(t, 'showDirectoryPicker', async () => root);
  await assert.rejects(cloud.exportMarkdownFolder({ notes: [note({ title: 'A' }), note({ id: '7c584986-6bd5-4db4-b540-ffaf59c849c6', title: 'Z' })], folders: [] }), /exist|conflict|overwrite/i);
  assert.deepEqual(root.writes, []);
  await assert.rejects(cloud.exportMarkdownFolder({ notes: [note(), note({ id: '7c584986-6bd5-4db4-b540-ffaf59c849c6', title: 'welcome' })], folders: [] }), /duplicate|collision/i);
});

test('folder export explains unsupported browsers instead of pretending success', async t => {
  replace(t, 'showDirectoryPicker', undefined);
  await assert.rejects(cloud.exportMarkdownFolder(snapshot()), /support|Chrom|folder/i);
});

test('Google rejects CSRF state mismatch', async t => {
  google(t, { state: 'attacker' });
  await assert.rejects(cloud.connectCloud({ provider: 'google', clientId: 'public-client' }), /state|security/i);
});

test('Google requires granted drive.file scope', async t => {
  google(t, { scope: 'email' });
  await assert.rejects(cloud.connectCloud({ provider: 'google', clientId: 'public-client' }), /scope|permission|consent/i);
});

test('Google rejects tokens missing requested identity consent before metadata requests', async t => {
  google(t, { scope: 'https://www.googleapis.com/auth/drive.file' });
  replace(t, 'fetch', async () => { assert.fail('Incomplete identity consent must not request account metadata'); });
  await assert.rejects(cloud.connectCloud({ provider: 'google', clientId: 'public-client' }), { code: 'CLOUD_CONSENT' });
});

for (const [identity, accountType] of [
  [{ id: 'account-id', email: 'person@custom.example' }, 'personal'],
  [{ id: 'account-id', email: 'person@gmail.com', hd: 'workspace.example' }, 'business'],
  [{ id: 'account-id', email: 'person@workspace.example', hd: null }, 'unknown'],
  [{ id: 'account-id', hd: 'workspace.example' }, 'unknown'],
  [{ email: 'person@workspace.example' }, 'unknown'],
  [{ id: 'account-id', email: 'person@gmail.com', hd: '' }, 'unknown'],
  [{ id: 'account-id', email: [] }, 'unknown'],
  [{}, 'unknown'],
  [null, 'unknown'],
]) {
  test(`Google verifies ${JSON.stringify(identity)} as ${accountType} without creating or uploading files`, async t => {
    google(t);
    const calls = [];
    replace(t, 'fetch', async (input, options = {}) => {
      const url = new URL(input);
      calls.push(url.pathname);
      assert.equal(options.method || 'GET', 'GET', 'Verification must not upload notes or create folders');
      assert.equal(url.origin, 'https://www.googleapis.com');
      assert.equal(new Headers(options.headers).get('Authorization'), 'Bearer memory-only-token');
      if (url.pathname === '/oauth2/v2/userinfo') return json(identity);
      assert.equal(url.pathname, '/drive/v2/files');
      return json({ items: [] });
    });
    const connection = await cloud.connectCloud({ provider: 'google', clientId: 'public-client' });
    assert.deepEqual(calls, [], 'Connecting alone must not request metadata');
    assert.equal(connection.connected, true);
    assert.deepEqual(connection.info, { accountType: 'unknown', folder: null });
    await connection.verify();
    assert.deepEqual(connection.info, { accountType, folder: null });
    assert.deepEqual(calls, ['/oauth2/v2/userinfo', '/drive/v2/files']);
  });
}

test('Google verification reports only the real marked Herd folder and safe references', async t => {
  google(t);
  let metadata = { id: 'folder-id', title: 'Herd', mimeType: 'application/vnd.google-apps.folder', alternateLink: 'https://drive.google.com/drive/folders/folder-id' };
  let missing = false;
  replace(t, 'fetch', async (input, options = {}) => {
    const url = new URL(input);
    assert.equal(options.method || 'GET', 'GET');
    if (url.pathname === '/oauth2/v2/userinfo') return json({ id: 'account-id', email: 'person@gmail.com' });
    if (url.pathname.endsWith('/files')) {
      assert.match(url.searchParams.get('q'), /visibility='PRIVATE'/);
      return json({ items: [{ id: 'folder-id' }] });
    }
    assert.equal(url.pathname, '/drive/v2/files/folder-id');
    return missing ? json({}, 404) : json(metadata);
  });
  const connection = await cloud.connectCloud({ provider: 'google', clientId: 'public-client' });
  await connection.verify();
  assert.deepEqual(connection.info.folder, { id: 'folder-id', name: 'Herd', path: 'Herd', webUrl: 'https://drive.google.com/drive/folders/folder-id' });
  connection.info.folder.name = 'mutated';
  assert.equal(connection.info.folder.name, 'Herd');
  metadata = { ...metadata, alternateLink: 'javascript:alert(1)' };
  await connection.verify();
  assert.equal(connection.info.folder.webUrl, null);
  missing = true;
  await connection.verify();
  assert.equal(connection.info.folder, null, 'A deleted folder is not an authentication failure');
  assert.equal(connection.connected, true);
  missing = false;
  metadata = { ...metadata, id: 'different-folder' };
  await assert.rejects(connection.verify(), { code: 'CLOUD_DATA' });
  assert.equal(connection.info.folder, null);
  metadata = null;
  await assert.rejects(connection.verify(), { code: 'CLOUD_DATA' });
});

for (const [driveType, accountType] of [['personal', 'personal'], ['business', 'business'], ['documentLibrary', 'business'], ['future-type', 'unknown'], [null, 'unknown']]) {
  test(`OneDrive classifies verified ${driveType} approot as ${accountType} without broad requests or uploads`, async t => {
    microsoft(t);
    const calls = [];
    replace(t, 'fetch', async (input, options = {}) => {
      const url = new URL(input);
      if (url.pathname.endsWith('/token')) return json({ access_token: 'token', token_type: 'Bearer', expires_in: 3600, scope: 'Files.ReadWrite.AppFolder' });
      calls.push(url.pathname);
      assert.equal(options.method || 'GET', 'GET');
      assert.equal(url.origin, 'https://graph.microsoft.com');
      assert.equal(url.pathname, '/v1.0/me/drive/special/approot');
      assert.equal(url.searchParams.get('$select'), 'id,name,folder,parentReference,webUrl');
      return json({ id: 'folder-id', name: 'My App', folder: { childCount: 0 }, parentReference: { driveType, path: '/drive/root:/Apps' }, webUrl: 'https://example-my.sharepoint.com/personal/user/Documents/Apps/My%20App' });
    });
    const connection = await cloud.connectCloud({ provider: 'onedrive', clientId: 'public-client', tenant: 'common' });
    assert.deepEqual(calls, []);
    await connection.verify();
    assert.deepEqual(connection.info, { accountType, folder: { id: 'folder-id', name: 'My App', path: 'Apps/My App', webUrl: 'https://example-my.sharepoint.com/personal/user/Documents/Apps/My%20App' } });
    assert.deepEqual(calls, ['/v1.0/me/drive/special/approot']);
  });
}

test('OneDrive rejects malformed folder metadata and omits unsafe optional references', async t => {
  microsoft(t);
  let metadata = { id: 'folder-id', name: 'My App', folder: {}, parentReference: { driveType: 'business', path: '/drive/root:/Apps%20%26%20Tools' }, webUrl: 'https://onedrive.live.com/?id=folder-id&cid=drive-id' };
  replace(t, 'fetch', async input => new URL(input).pathname.endsWith('/token')
    ? json({ access_token: 'token', token_type: 'Bearer', expires_in: 3600, scope: 'Files.ReadWrite.AppFolder' }) : json(metadata));
  const connection = await cloud.connectCloud({ provider: 'onedrive', clientId: 'public-client', tenant: 'consumers' });
  await connection.verify();
  assert.equal(connection.info.accountType, 'business', 'Tenant audience is not account classification');
  assert.equal(connection.info.folder.path, 'Apps & Tools/My App');
  assert.equal(connection.info.folder.webUrl, 'https://onedrive.live.com/?id=folder-id&cid=drive-id');
  for (const webUrl of ['javascript:alert(1)', 'https://example.sharepoint.com.attacker.test/folder', 'https://user:secret@example.sharepoint.com/folder', 'https://example.sharepoint.com/folder?access_token=secret']) {
    metadata = { ...metadata, webUrl, parentReference: { driveType: {}, path: '/drive/root:/Apps/%2e%2e/private' } };
    await connection.verify();
    assert.deepEqual(connection.info, { accountType: 'unknown', folder: { id: 'folder-id', name: 'My App', path: null, webUrl: null } });
  }
  for (const value of [null, {}, { ...metadata, folder: null }, { ...metadata, name: '../escape' }, { ...metadata, id: 'bad/id' }]) {
    metadata = value;
    await assert.rejects(connection.verify(), { code: 'CLOUD_DATA' });
    assert.deepEqual(connection.info, { accountType: 'unknown', folder: null });
  }
});

test('connection state expires and disconnects without sending stale tokens', async t => {
  google(t);
  const clock = t.mock.method(Date, 'now', () => 1000);
  let requests = 0;
  replace(t, 'fetch', async input => {
    requests++;
    return new URL(input).pathname === '/oauth2/v2/userinfo' ? json({ id: 'account-id', email: 'person@gmail.com' }) : json({ items: [] });
  });
  const connection = await cloud.connectCloud({ provider: 'google', clientId: 'public-client' });
  await connection.verify();
  assert.equal(connection.connected, true);
  clock.mock.mockImplementation(() => 3601000);
  assert.equal(connection.connected, false);
  assert.deepEqual(connection.info, { accountType: 'unknown', folder: null });
  await assert.rejects(connection.verify(), { code: 'CLOUD_AUTH' });
  assert.equal(requests, 2);
  clock.mock.mockImplementation(() => 1000);
  connection.disconnect();
  assert.equal(connection.connected, false);
  await assert.rejects(connection.load(), { code: 'CLOUD_AUTH' });
  await assert.rejects(connection.verify(), { code: 'CLOUD_AUTH' });
  assert.equal(requests, 2);
});

test('verification invalidates provider-rejected sessions instead of retaining connected state', async t => {
  microsoft(t);
  let requests = 0;
  replace(t, 'fetch', async input => {
    if (new URL(input).pathname.endsWith('/token')) return json({ access_token: 'token', token_type: 'Bearer', expires_in: 3600, scope: 'Files.ReadWrite.AppFolder' });
    requests++;
    return json({}, 401);
  });
  const connection = await cloud.connectCloud({ provider: 'onedrive', clientId: 'public-client' });
  await assert.rejects(connection.verify(), { code: 'CLOUD_AUTH' });
  assert.equal(connection.connected, false);
  assert.deepEqual(connection.info, { accountType: 'unknown', folder: null });
  await assert.rejects(connection.verify(), { code: 'CLOUD_AUTH' });
  assert.equal(requests, 1);
});

test('Google load validates cloud snapshots and save uses the loaded etag atomically', async t => {
  google(t);
  const writes = [];
  replace(t, 'fetch', async (input, options = {}) => {
    const url = new URL(input);
    if (options.method === 'PUT') { writes.push(options); return json({ id: 'snapshot-id', etag: '"next"' }); }
    if (url.searchParams.get('alt') === 'media') return json(snapshot(), 200, { ETag: '"base"' });
    if (url.pathname.endsWith('/files')) return json({ items: url.searchParams.get('q').includes('mimeType') ? [{ id: 'folder-id' }] : [{ id: 'snapshot-id' }] });
    return json({ id: 'snapshot-id', etag: '"base"', capabilities: { canModifyContent: true } });
  });
  const connection = await cloud.connectCloud({ provider: 'google', clientId: 'public-client' });
  const loaded = await connection.load();
  assert.deepEqual(loaded.snapshot, snapshot());
  assert.equal(connection.readOnly, false);
  assert.equal(typeof await connection.save(snapshot(), loaded.revision), 'string');
  assert.equal(new Headers(writes[0].headers).get('If-Match'), '"base"');
  assert.deepEqual(JSON.parse(writes[0].body), snapshot());
  connection.disconnect();
  await assert.rejects(connection.load(), /connect|expired|sign.in/i);
});

test('Google refuses blind overwrite, missing etags, and corrupt snapshots', async t => {
  google(t);
  let body = snapshot();
  let metadata = { id: 'snapshot-id' };
  replace(t, 'fetch', async input => {
    const url = new URL(input);
    if (url.searchParams.get('alt') === 'media') return json(body);
    if (url.pathname.endsWith('/files')) return json({ items: url.searchParams.get('q')?.includes('mimeType') ? [{ id: 'folder-id' }] : [{ id: 'snapshot-id' }] });
    return json(metadata);
  });
  const connection = await cloud.connectCloud({ provider: 'google', clientId: 'public-client' });
  await assert.rejects(connection.load(), /etag|revision|concurren/i);
  await assert.rejects(connection.save(snapshot(), null), /conflict|exist|changed/i);
  metadata = { id: 'snapshot-id', etag: '"base"' };
  body = { notes: [{ content: 'invalid' }], folders: [] };
  await assert.rejects(connection.load());
});

test('Google maps precondition failures to a conflict without retrying writes', async t => {
  google(t);
  let writes = 0;
  replace(t, 'fetch', async (input, options = {}) => {
    if (options.method === 'PUT') { writes++; return json({}, 412); }
    const url = new URL(input);
    if (url.searchParams.get('alt') === 'media') return json(snapshot(), 200, { ETag: '"base"' });
    if (url.pathname.endsWith('/files')) return json({ items: url.searchParams.get('q').includes('mimeType') ? [{ id: 'folder-id' }] : [{ id: 'snapshot-id' }] });
    return json({ id: 'snapshot-id', etag: '"base"', capabilities: { canModifyContent: true } });
  });
  const connection = await cloud.connectCloud({ provider: 'google', clientId: 'public-client' });
  const loaded = await connection.load();
  await assert.rejects(connection.save(snapshot(), loaded.revision), /conflict|changed|sync/i);
  assert.equal(writes, 1);
});

test('Google loads authoritative read-only content and refuses replacement even without a prior load', async t => {
  google(t);
  const writes = [];
  replace(t, 'fetch', async (input, options = {}) => {
    const url = new URL(input);
    if (options.method === 'PUT') { writes.push(options); return json({ id: 'snapshot-id', etag: '"next"' }); }
    if (url.searchParams.get('alt') === 'media') return json(snapshot());
    if (url.pathname.endsWith('/files')) return json({ items: url.searchParams.get('q').includes('mimeType') ? [{ id: 'folder-id' }] : [{ id: 'snapshot-id' }] });
    const fields = url.searchParams.get('fields');
    return json({ id: 'snapshot-id', etag: '"base"', ...(fields.includes('canModifyContent') ? { capabilities: { canEdit: true, canModifyContent: false } } : {}) });
  });
  const connection = await cloud.connectCloud({ provider: 'google', clientId: 'public-client' });
  const loaded = await connection.load();
  assert.deepEqual(loaded, { snapshot: snapshot(), revision: JSON.stringify({ id: 'snapshot-id', etag: '"base"' }) });
  assert.equal(connection.readOnly, true);
  await assert.rejects(connection.save(snapshot(), loaded.revision), { code: 'CLOUD_READ_ONLY' });
  const direct = await cloud.connectCloud({ provider: 'google', clientId: 'public-client' });
  await assert.rejects(direct.save(snapshot(), loaded.revision), { code: 'CLOUD_READ_ONLY' });
  assert.equal(direct.readOnly, true);
  assert.deepEqual(writes, []);
});

test('Google refreshes content capability before saving and permission restoration preserves ETag checks', async t => {
  google(t);
  let canModifyContent = true;
  let etag = '"base"';
  const writes = [];
  replace(t, 'fetch', async (input, options = {}) => {
    const url = new URL(input);
    if (options.method === 'PUT') { writes.push(options); return json({ id: 'snapshot-id', etag: '"saved"' }); }
    if (url.searchParams.get('alt') === 'media') return json(snapshot());
    if (url.pathname.endsWith('/files')) return json({ items: url.searchParams.get('q').includes('mimeType') ? [{ id: 'folder-id' }] : [{ id: 'snapshot-id' }] });
    return json({ id: 'snapshot-id', etag, capabilities: { canModifyContent } });
  });
  const connection = await cloud.connectCloud({ provider: 'google', clientId: 'public-client' });
  const loaded = await connection.load();
  assert.equal(connection.readOnly, false);
  canModifyContent = false;
  await assert.rejects(connection.save(snapshot(), loaded.revision), { code: 'CLOUD_READ_ONLY' });
  assert.equal(connection.readOnly, true);
  assert.deepEqual(writes, []);
  canModifyContent = true;
  etag = '"newer"';
  await assert.rejects(connection.save(snapshot(), loaded.revision), { code: 'CLOUD_CONFLICT' });
  assert.equal(connection.readOnly, false);
  assert.deepEqual(writes, []);
  const refreshed = await connection.load();
  assert.equal(await connection.save(snapshot(), refreshed.revision), JSON.stringify({ id: 'snapshot-id', etag: '"saved"' }));
  assert.equal(writes.length, 1);
  assert.equal(new Headers(writes[0].headers).get('If-Match'), '"newer"');
});

test('Google treats missing content capability as unknown rather than inferring permission', async t => {
  google(t);
  let denied = false;
  const writes = [];
  replace(t, 'fetch', async (input, options = {}) => {
    const url = new URL(input);
    if (options.method === 'PUT') { writes.push(options); return json({ id: 'snapshot-id', etag: '"next"' }); }
    if (denied) return json({}, 403);
    if (url.searchParams.get('alt') === 'media') return json(snapshot());
    if (url.pathname.endsWith('/files')) return json({ items: url.searchParams.get('q').includes('mimeType') ? [{ id: 'folder-id' }] : [{ id: 'snapshot-id' }] });
    return json({ id: 'snapshot-id', etag: '"base"', ownedByMe: false, editable: false, userPermission: { role: 'reader' } });
  });
  const connection = await cloud.connectCloud({ provider: 'google', clientId: 'public-client' });
  const loaded = await connection.load();
  assert.equal(connection.readOnly, false);
  await assert.rejects(connection.save(snapshot(), loaded.revision), { code: 'CLOUD_PERMISSION_UNKNOWN' });
  assert.deepEqual(writes, []);
  denied = true;
  await assert.rejects(connection.load(), { code: 'CLOUD_PERMISSION' });
  assert.equal(connection.readOnly, false);
});

test('OneDrive uses code PKCE, validates popup identity, and sends no client secret', async t => {
  const auth = microsoft(t);
  let tokenBody;
  replace(t, 'fetch', async (input, options = {}) => {
    assert.match(String(input), /\/token$/);
    tokenBody = new URLSearchParams(options.body);
    return json({ access_token: 'memory-only-token', token_type: 'Bearer', expires_in: 3600, scope: 'Files.ReadWrite.AppFolder' });
  });
  const connection = await cloud.connectCloud({ provider: 'onedrive', clientId: 'public-client' });
  assert.equal(auth.authorize().searchParams.get('response_type'), 'code');
  assert.equal(auth.authorize().searchParams.get('code_challenge_method'), 'S256');
  assert.equal(auth.authorize().searchParams.get('code_challenge'), createHash('sha256').update(tokenBody.get('code_verifier')).digest('base64url'));
  assert.equal(tokenBody.get('client_secret'), null);
  assert.equal(tokenBody.get('redirect_uri'), 'https://herd.example/oauth-callback.html');
  assert.equal(auth.popup.closed, true);
  assert.equal(auth.listeners.size, 0);
  connection.disconnect();
});

test('OneDrive rejects matching-popup CSRF errors before exchanging a code', async t => {
  microsoft(t, { badState: true });
  replace(t, 'fetch', async () => { assert.fail('A CSRF mismatch must not exchange a code'); });
  await assert.rejects(cloud.connectCloud({ provider: 'onedrive', clientId: 'public-client' }), /state|security/i);
});

test('OneDrive downloads without leaking tokens and pairs content with an unchanged etag', async t => {
  microsoft(t);
  const requests = [];
  replace(t, 'fetch', async (input, options = {}) => {
    const url = new URL(input);
    requests.push({ url, options });
    if (url.pathname.endsWith('/token')) return json({ access_token: 'token', token_type: 'Bearer', expires_in: 3600, scope: 'Files.ReadWrite.AppFolder' });
    if (url.origin === 'https://download.files.1drv.com') {
      assert.equal(new Headers(options.headers).get('Authorization'), null);
      return json(snapshot());
    }
    return json({ id: 'snapshot-id', eTag: '"base"', file: {}, name: 'vault.json', '@microsoft.graph.downloadUrl': 'https://download.files.1drv.com/vault' });
  });
  const connection = await cloud.connectCloud({ provider: 'onedrive', clientId: 'public-client' });
  const loaded = await connection.load();
  assert.deepEqual(loaded.snapshot, snapshot());
  assert.equal(typeof loaded.revision, 'string');
  assert.equal(requests.filter(value => value.url.origin === 'https://download.files.1drv.com').length, 1);
  assert.equal(requests.filter(value => value.url.hostname === 'graph.microsoft.com').length, 2);
});

test('connectors reject missing configuration and do not authenticate while offline', async t => {
  browser(t);
  await assert.rejects(cloud.connectCloud({ provider: 'google', clientId: '' }), /client/i);
  await assert.rejects(cloud.connectCloud({ provider: 'other', clientId: 'x' }), /provider/i);
  replace(t, 'navigator', { onLine: false });
  await assert.rejects(cloud.connectCloud({ provider: 'onedrive', clientId: 'public-client' }), /online|offline/i);
});

test('OneDrive preserves a submitted recovery snapshot before conditional replacement and verifies publication', async t => {
  microsoft(t);
  const submitted = snapshot();
  let published = false;
  let recovery = false;
  let session = false;
  replace(t, 'fetch', async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/token')) return json({ access_token: 'token', token_type: 'Bearer', expires_in: 3600, scope: 'Files.ReadWrite.AppFolder' });
    if (url.pathname.includes('/herd-recovery-')) {
      assert.equal(options.method, 'PUT');
      assert.equal(url.searchParams.get('@microsoft.graph.conflictBehavior'), 'fail');
      assert.deepEqual(JSON.parse(options.body), submitted);
      recovery = true;
      return json({ id: 'recovery-id', eTag: '"recovery"' }, 201);
    }
    if (url.pathname.endsWith('/createUploadSession')) {
      assert.ok(recovery, 'Recovery must be durable before starting replacement');
      assert.equal(new Headers(options.headers).get('If-Match'), '"base"');
      session = true;
      return json({ uploadUrl: 'https://upload.up.1drv.com/session' });
    }
    if (url.hostname === 'upload.up.1drv.com') {
      assert.ok(session);
      assert.equal(new Headers(options.headers).get('Authorization'), null);
      assert.match(new Headers(options.headers).get('Content-Range'), /^bytes 0-\d+\/\d+$/);
      published = true;
      return json({ id: 'snapshot-id', eTag: '"next"' });
    }
    if (url.hostname === 'download.files.1drv.com') return json(submitted);
    return json({ id: 'snapshot-id', eTag: published ? '"next"' : '"base"', name: 'vault.json', file: {}, '@microsoft.graph.downloadUrl': 'https://download.files.1drv.com/vault' });
  });
  const connection = await cloud.connectCloud({ provider: 'onedrive', clientId: 'public-client' });
  const revision = JSON.stringify({ id: 'snapshot-id', etag: '"base"' });
  assert.equal(await connection.save(submitted, revision), JSON.stringify({ id: 'snapshot-id', etag: '"next"' }));
  assert.ok(recovery);
  assert.ok(published);
});

test('OneDrive refuses canonical replacement when recovery creation fails', async t => {
  microsoft(t);
  replace(t, 'fetch', async (input, options = {}) => {
    const url = new URL(input);
    if (url.pathname.endsWith('/token')) return json({ access_token: 'token', token_type: 'Bearer', expires_in: 3600, scope: 'Files.ReadWrite.AppFolder' });
    if (options.method === 'PUT' && url.pathname.includes('/herd-recovery-')) return json({}, 507);
    assert.notEqual(options.method, 'PUT', 'Canonical content must not change without durable recovery');
    assert.notEqual(options.method, 'POST', 'Do not begin replacement without durable recovery');
    return json({ id: 'snapshot-id', eTag: '"base"', name: 'vault.json', file: {} });
  });
  const connection = await cloud.connectCloud({ provider: 'onedrive', clientId: 'public-client' });
  await assert.rejects(connection.save(snapshot(), JSON.stringify({ id: 'snapshot-id', etag: '"base"' })), /507|recovery/i);
});

test('OneDrive refuses a snapshot that changes during download', async t => {
  microsoft(t);
  let reads = 0;
  replace(t, 'fetch', async input => {
    const url = new URL(input);
    if (url.pathname.endsWith('/token')) return json({ access_token: 'token', token_type: 'Bearer', expires_in: 3600, scope: 'Files.ReadWrite.AppFolder' });
    if (url.hostname === 'download.files.1drv.com') return json(snapshot());
    reads++;
    return json({ id: 'snapshot-id', eTag: reads === 1 ? '"base"' : '"changed"', name: 'vault.json', file: {}, '@microsoft.graph.downloadUrl': 'https://download.files.1drv.com/vault' });
  });
  const connection = await cloud.connectCloud({ provider: 'onedrive', clientId: 'public-client' });
  await assert.rejects(connection.load(), /changed|conflict/i);
});

test('OneDrive refuses untrusted transfer hosts without sending a token or requesting them', async t => {
  microsoft(t);
  replace(t, 'fetch', async input => {
    const url = new URL(input);
    if (url.pathname.endsWith('/token')) return json({ access_token: 'token', token_type: 'Bearer', expires_in: 3600, scope: 'Files.ReadWrite.AppFolder' });
    assert.equal(url.hostname, 'graph.microsoft.com', 'Never fetch an untrusted transfer URL');
    return json({ id: 'snapshot-id', eTag: '"base"', name: 'vault.json', file: {}, '@microsoft.graph.downloadUrl': 'https://files.1drv.com.attacker.example/steal' });
  });
  const connection = await cloud.connectCloud({ provider: 'onedrive', clientId: 'public-client' });
  await assert.rejects(connection.load(), /host|transfer|unexpected/i);
});

test('OneDrive maps missing files to null and invalid tokens to actionable reconnect errors', async t => {
  microsoft(t);
  let status = 404;
  let calls = 0;
  replace(t, 'fetch', async input => {
    if (new URL(input).pathname.endsWith('/token')) return json({ access_token: 'token', token_type: 'Bearer', expires_in: 3600, scope: 'Files.ReadWrite.AppFolder' });
    calls++;
    return json({}, status);
  });
  const connection = await cloud.connectCloud({ provider: 'onedrive', clientId: 'public-client' });
  assert.equal(await connection.load(), null);
  status = 401;
  await assert.rejects(connection.load(), /connect|expired/i);
  await assert.rejects(connection.load(), /connect|expired/i);
  assert.equal(calls, 2, 'An invalid token must not be sent again');
});

test('cloud authentication rejects insecure non-local origins before opening a provider', async t => {
  browser(t);
  window.location = { origin: 'http://herd.example', protocol: 'http:' };
  await assert.rejects(cloud.connectCloud({ provider: 'onedrive', clientId: 'public-client' }), /HTTPS|secure/i);
});

test('cloud downloads enforce the byte limit even without a content-length header', async t => {
  microsoft(t);
  let cancelled = false;
  let chunks = 0;
  replace(t, 'fetch', async input => {
    const url = new URL(input);
    if (url.pathname.endsWith('/token')) return json({ access_token: 'token', token_type: 'Bearer', expires_in: 3600, scope: 'Files.ReadWrite.AppFolder' });
    if (url.hostname === 'download.files.1drv.com') return new Response(new ReadableStream({
      pull(controller) { if (chunks++ < 12) controller.enqueue(new Uint8Array(1024 * 1024)); else controller.close(); },
      cancel() { cancelled = true; },
    }));
    return json({ id: 'snapshot-id', eTag: '"base"', name: 'vault.json', file: {}, '@microsoft.graph.downloadUrl': 'https://download.files.1drv.com/vault' });
  });
  const connection = await cloud.connectCloud({ provider: 'onedrive', clientId: 'public-client' });
  await assert.rejects(connection.load(), /10 MiB|limit|large/i);
  assert.equal(cancelled, true);
});

test('native Google creation cancellation cannot send provider writes or reveal an invisible web vault', async t => {
  replace(t, 'window', {
    location: { origin: 'app://bundle', protocol: 'app:' },
    nitrobisonDesktop: {
      isDesktop: true,
      authorize: async () => ({ access_token: 'native-token', token_type: 'Bearer', expires_in: 3600, scope: 'https://www.googleapis.com/auth/drive.file openid profile email' }),
      confirmGoogleVaultCreation: async () => false,
    },
  });
  replace(t, 'navigator', { onLine: true });
  const writes = [];
  replace(t, 'fetch', async (_url, options) => {
    if (options.method && options.method !== 'GET') writes.push(options.method);
    return json({ items: [] });
  });
  const connection = await cloud.connectCloud({ provider: 'google', clientId: 'native-public-client' });
  assert.equal(await connection.load(), null);
  await assert.rejects(connection.save(snapshot(), null), error => error.code === 'CLOUD_CREATION_CANCELLED');
  assert.deepEqual(writes, []);
});
