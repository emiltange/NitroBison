import test from 'node:test';
import assert from 'node:assert/strict';
import { updateFolderPreferences, renameFolderPreferences } from '../src/folder-preferences.js';
import { openWorkspace } from '../src/workspace.js';

const banner = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6rXsAAAAASUVORK5CYII=';

test('directory and banner patches preserve each other and never mutate the input', () => {
  const current = Object.freeze({ Project: Object.freeze({ directory: 'Device folder', banner }), Other: Object.freeze({ banner: null }) });
  const relocated = updateFolderPreferences(current, 'Project', { directory: 'Another folder' });
  assert.deepEqual(relocated, { Project: { directory: 'Another folder', banner }, Other: { banner: null } });
  assert.deepEqual(updateFolderPreferences(relocated, 'Project', { banner: null }), { Project: { directory: 'Another folder', banner: null }, Other: { banner: null } });
  assert.deepEqual(current.Project, { directory: 'Device folder', banner });
});

test('clearing a directory removes only its field while null banner remains an explicit override', () => {
  assert.deepEqual(updateFolderPreferences({ Project: { directory: 'Device folder', banner: null } }, 'Project', { directory: null }), { Project: { banner: null } });
  assert.deepEqual(updateFolderPreferences({ Project: { directory: 'Device folder' } }, 'Project', { directory: null }), {});
  assert.deepEqual(updateFolderPreferences({}, '', { banner: null }), { '': { banner: null } });
  assert.deepEqual(updateFolderPreferences({}, 'Project', {}), {});
});

test('preference patches reject unsafe folders, unknown fields and invalid value types', () => {
  for (const folder of [null, 42, '../Project', '/Project', 'Project//Child', 'Project\\Child']) {
    assert.throws(() => updateFolderPreferences({}, folder, { banner: null }), /folder|path/i);
  }
  for (const patch of [null, [], 'directory', { unknown: true }, { [Symbol('hidden')]: true }, { directory: undefined }, { directory: 42 }, { banner: undefined }, { banner: false }, { banner: {} }]) {
    assert.throws(() => updateFolderPreferences({}, 'Project', patch), /preference|directory|banner/i);
  }
});

test('directory metadata accepts only a bounded nonempty label without paths or control characters', () => {
  for (const directory of ['', '   ', 'x'.repeat(10000), 'folder\nname', 'folder\u0000name', 'folder\u007fname', 'folder\u0085name', 'C:\\Users\\Private', '/home/private']) {
    assert.throws(() => updateFolderPreferences({}, 'Project', { directory }), /directory/i);
  }
  assert.deepEqual(updateFolderPreferences({}, 'Project', { directory: 'Photos — summer 2026' }), { Project: { directory: 'Photos — summer 2026' } });
});

test('private banners reject remote images, executable formats, spoofed bytes and oversized data', () => {
  for (const unsafe of ['https://tracker.example/banner.png', 'data:image/svg+xml;base64,PHN2Zy8+', 'data:image/png;base64,PHN2Zy8+', `data:image/png;base64,${'A'.repeat(800000)}`]) {
    assert.throws(() => updateFolderPreferences({}, 'Project', { banner: unsafe }), /banner/i);
  }
  assert.deepEqual(updateFolderPreferences({}, 'Project', { banner }), { Project: { banner } });
});

test('renames move only exact and descendant keys, preserving root and neighboring prefixes', () => {
  const current = { '': { banner: null }, Project: { directory: 'Local project' }, 'Project/Child': { banner }, Projects: { directory: 'Neighbor' }, 'Other/Project': { banner: null } };
  assert.deepEqual(renameFolderPreferences(current, 'Project', 'Archive/Project'), {
    '': { banner: null }, 'Archive/Project': { directory: 'Local project' }, 'Archive/Project/Child': { banner }, Projects: { directory: 'Neighbor' }, 'Other/Project': { banner: null },
  });
  assert.deepEqual(current.Project, { directory: 'Local project' });
  assert.deepEqual(renameFolderPreferences(current, 'Project', 'Project'), current);
});

test('rename collisions and self-descendant moves do not overwrite private preferences', () => {
  const current = { Project: { banner }, Archive: { directory: 'Keep me' }, 'Archive/Child': { banner: null } };
  assert.throws(() => renameFolderPreferences(current, 'Project', 'Archive'), /preference|exists/i);
  assert.throws(() => renameFolderPreferences(current, 'Project', 'Project/Child'), /itself/i);
  assert.throws(() => renameFolderPreferences(current, '', 'Archive'), /folder|path/i);
  assert.deepEqual(current.Archive, { directory: 'Keep me' });
});

test('valid folder names matching object prototype properties remain ordinary isolated map entries', () => {
  const current = updateFolderPreferences({}, '__proto__', { directory: 'Private' });
  assert.equal(Object.getPrototypeOf(current), Object.prototype);
  assert.equal(Object.hasOwn(current, '__proto__'), true);
  assert.deepEqual(current.__proto__, { directory: 'Private' });
  const renamed = renameFolderPreferences(current, '__proto__', 'constructor');
  assert.equal(Object.hasOwn(renamed, '__proto__'), false);
  assert.deepEqual(renamed.constructor, { directory: 'Private' });
});

function replace(t, key, value) {
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, key);
  Object.defineProperty(globalThis, key, { configurable: true, writable: true, value });
  t.after(() => descriptor ? Object.defineProperty(globalThis, key, descriptor) : delete globalThis[key]);
}

function localWorkspace(t) {
  const records = new Map();
  let failWrite = false;
  const db = {
    transaction(_store, mode) {
      const writes = [];
      const tx = { objectStore: () => ({
        get(key) {
          const request = {};
          queueMicrotask(() => { request.result = structuredClone(records.get(key)); request.onsuccess(); });
          return request;
        },
        put(value, key) { writes.push([key, structuredClone(value)]); },
      }) };
      if (mode === 'readwrite') queueMicrotask(() => {
        if (failWrite) { failWrite = false; tx.error = new Error('device full'); tx.onabort(); }
        else { for (const [key, value] of writes) records.set(key, value); tx.oncomplete(); }
      });
      return tx;
    },
  };
  replace(t, 'indexedDB', { open() {
    const request = { result: db };
    queueMicrotask(() => request.onsuccess());
    return request;
  } });
  const locks = new Map();
  replace(t, 'navigator', { locks: { request(name, action) {
    const result = (locks.get(name) || Promise.resolve()).then(action);
    locks.set(name, result.catch(() => {}));
    return result;
  } } });
  let session = null;
  let offline = false;
  replace(t, 'fetch', async (url, options) => {
    if (offline) throw new Error('offline');
    let value;
    if (url === '/api/session' && options.method === 'POST') {
      session = { id: JSON.parse(options.body).id, role: 'viewer' };
      value = { user: session, workspaceName: 'Shared team' };
    } else if (url === '/api/session') value = { user: session };
    else if (url === '/api/workspace') value = { notes: [], folders: ['Project'], revision: 1 };
    else if (url === '/api/logout') { session = null; value = {}; }
    else throw new Error(`Unexpected API request: ${url}`);
    return { ok: true, json: async () => value };
  });
  return { records, failNextWrite() { failWrite = true; }, goOffline() { offline = true; } };
}

test('private preferences isolate personal and team identities, including cached offline boot', async t => {
  const device = localWorkspace(t);
  const workspace = await openWorkspace();
  await workspace.saveFolderPreferences('Project', { directory: 'Personal', banner });
  await workspace.login({ id: 'alice' });
  assert.deepEqual(workspace.folderPreferences, {});
  await workspace.saveFolderPreferences('Project', { directory: 'Alice', banner: null });
  await workspace.login({ id: 'bob' });
  assert.deepEqual(workspace.folderPreferences, {});
  await workspace.saveFolderPreferences('Project', { directory: 'Bob' });
  await workspace.login({ id: 'alice' });
  assert.deepEqual(workspace.folderPreferences, { Project: { directory: 'Alice', banner: null } });
  await workspace.login({ id: 'bob' });
  assert.deepEqual(workspace.folderPreferences, { Project: { directory: 'Bob' } });
  await workspace.login({ id: 'alice' });
  device.goOffline();
  const cached = await openWorkspace();
  assert.equal(cached.user.id, 'alice');
  assert.deepEqual(cached.folderPreferences, { Project: { directory: 'Alice', banner: null } });
});

test('late queued preference saves persist to their captured identity without leaking through transition emits', async t => {
  localWorkspace(t);
  const workspace = await openWorkspace();
  await workspace.saveFolderPreferences('Project', { directory: 'Personal' });
  await workspace.login({ id: 'alice' });
  const seen = [];
  workspace.subscribe(() => seen.push({ user: workspace.user?.id, preferences: workspace.folderPreferences }));
  const login = workspace.login({ id: 'bob' });
  const save = workspace.saveFolderPreferences('Project', { directory: 'Still Alice' });
  await Promise.all([login, save]);
  assert.deepEqual(workspace.folderPreferences, {});
  assert.deepEqual(seen, [{ user: 'bob', preferences: {} }]);
  await workspace.login({ id: 'alice' });
  assert.deepEqual(workspace.folderPreferences, { Project: { directory: 'Still Alice' } });
  await workspace.leaveTeam();
  assert.deepEqual(workspace.folderPreferences, { Project: { directory: 'Personal' } });
});

test('local preference writes leave notes, export, dirty state and cloud payload unchanged', async t => {
  const device = localWorkspace(t);
  const workspace = await openWorkspace();
  const before = workspace.snapshot;
  const storedBefore = structuredClone(device.records.get('personal'));
  await workspace.saveFolderPreferences('', { banner, directory: 'Private root label' });
  const exposed = workspace.folderPreferences;
  exposed[''].directory = 'Mutated clone';
  assert.equal(workspace.folderPreferences[''].directory, 'Private root label');
  assert.deepEqual(workspace.snapshot, before);
  assert.deepEqual(await workspace.exportSnapshot(), before);
  assert.deepEqual(device.records.get('personal'), storedBefore);
  let uploaded;
  await workspace.syncCloud({ name: 'Test cloud', load: async () => null, save: async snapshot => { uploaded = snapshot; } });
  assert.deepEqual(uploaded, before);
  assert.equal(JSON.stringify(uploaded).includes('Private root label'), false);
  assert.equal(JSON.stringify(uploaded).includes(banner), false);
});

test('failed local persistence rejects without changing private preferences or emitting', async t => {
  const device = localWorkspace(t);
  const workspace = await openWorkspace();
  let emissions = 0;
  workspace.subscribe(() => emissions++);
  device.failNextWrite();
  await assert.rejects(workspace.saveFolderPreferences('Project', { directory: 'Unsaved' }), /save|storage/i);
  assert.deepEqual(workspace.folderPreferences, {});
  assert.equal(emissions, 0);
});

test('folder rename moves descendant preferences and safe deletion clears only the exact current-user entry', async t => {
  localWorkspace(t);
  const workspace = await openWorkspace();
  await workspace.replaceSnapshot({ notes: [], folders: ['Project', 'Project/Child', 'Projects'] });
  await workspace.saveFolderPreferences('Project', { directory: 'Local project' });
  await workspace.saveFolderPreferences('Project/Child', { banner: null });
  await workspace.saveFolderPreferences('Projects', { directory: 'Unrelated' });
  await workspace.renameFolder('Project', 'Archive');
  assert.deepEqual(workspace.folderPreferences, { Archive: { directory: 'Local project' }, 'Archive/Child': { banner: null }, Projects: { directory: 'Unrelated' } });
  await assert.rejects(workspace.deleteFolder('Archive'), /contents/i);
  assert.deepEqual(workspace.folderPreferences.Archive, { directory: 'Local project' });
  await workspace.deleteFolder('Archive/Child');
  await workspace.deleteFolder('Archive');
  assert.deepEqual(workspace.folderPreferences, { Projects: { directory: 'Unrelated' } });
});

test('a failed rename preserves both notes and preferences in their original locations', async t => {
  const device = localWorkspace(t);
  const workspace = await openWorkspace();
  await workspace.replaceSnapshot({ notes: [{ id: 'readme', title: 'README', folder: 'Project', content: 'Shared overview', updatedAt: 1 }], folders: ['Project'] });
  await workspace.saveFolderPreferences('Project', { directory: 'Private location', banner });
  const before = workspace.snapshot;
  device.failNextWrite();
  await assert.rejects(workspace.renameFolder('Project', 'Archive'), /save|storage/i);
  assert.deepEqual(workspace.snapshot, before);
  assert.deepEqual(workspace.folderPreferences, { Project: { directory: 'Private location', banner } });
});

test('deleting a personal folder does not delete another identity’s preference for the same path', async t => {
  localWorkspace(t);
  const workspace = await openWorkspace();
  await workspace.replaceSnapshot({ notes: [], folders: ['Project'] });
  await workspace.saveFolderPreferences('Project', { directory: 'Personal location' });
  await workspace.login({ id: 'alice' });
  await workspace.saveFolderPreferences('Project', { directory: 'Alice location' });
  await workspace.leaveTeam();
  await workspace.deleteFolder('Project');
  assert.deepEqual(workspace.folderPreferences, {});
  await workspace.login({ id: 'alice' });
  assert.deepEqual(workspace.folderPreferences, { Project: { directory: 'Alice location' } });
});

test('independent workspace instances merge private patches against the latest locked local record', async t => {
  localWorkspace(t);
  const first = await openWorkspace();
  const second = await openWorkspace();
  const patch = { banner };
  const directoryWrite = first.saveFolderPreferences('Project', { directory: 'Device folder' });
  const bannerWrite = second.saveFolderPreferences('Project', patch);
  patch.banner = null;
  await Promise.all([directoryWrite, bannerWrite]);
  assert.deepEqual(second.folderPreferences, { Project: { directory: 'Device folder', banner } });
});

test('queued folder mutations cannot rename a newly active identity’s notes or preferences', async t => {
  localWorkspace(t);
  const workspace = await openWorkspace();
  await workspace.replaceSnapshot({ notes: [], folders: ['Project'] });
  await workspace.saveFolderPreferences('Project', { directory: 'Personal location' });
  await workspace.login({ id: 'alice' });
  const leaving = workspace.leaveTeam();
  const renaming = workspace.renameFolder('Project', 'Archive');
  const results = await Promise.allSettled([leaving, renaming]);
  assert.equal(results[0].status, 'fulfilled');
  assert.equal(results[1].status, 'rejected');
  assert.match(results[1].reason.message, /vault changed/i);
  assert.deepEqual(workspace.snapshot.folders, ['Project']);
  assert.deepEqual(workspace.folderPreferences, { Project: { directory: 'Personal location' } });
});
