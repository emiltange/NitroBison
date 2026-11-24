import test from 'node:test';
import assert from 'node:assert/strict';
import { updateFolderPreferences, renameFolderPreferences, isFolderHidden } from '../src/folder-preferences.js';
import { openWorkspace } from '../src/workspace.js';
import { EMPTY_VAULT, validateSnapshot } from '../src/core.js';
import { extractNoteTargets, resolveNoteLink } from '../src/markdown-model.js';

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

test('hidden patches preserve directory and banner, and unhiding removes only the hidden flag', () => {
  const current = Object.freeze({ Project: Object.freeze({ directory: 'Device folder', banner }) });
  const hidden = updateFolderPreferences(current, 'Project', { hidden: true });
  assert.deepEqual(hidden, { Project: { directory: 'Device folder', banner, hidden: true } });
  assert.deepEqual(updateFolderPreferences(hidden, 'Project', { directory: 'Another folder', banner: null }), { Project: { directory: 'Another folder', banner: null, hidden: true } });
  assert.deepEqual(updateFolderPreferences(hidden, 'Project', { hidden: false }), current);
  assert.deepEqual(updateFolderPreferences({ Project: { hidden: true } }, 'Project', { hidden: false }), {});
  assert.deepEqual(updateFolderPreferences({}, 'Project', { hidden: false }), {});
  assert.deepEqual(current.Project, { directory: 'Device folder', banner });
});

test('hidden patches reject non-booleans and inherited or unknown fields', () => {
  for (const hidden of [null, undefined, 0, 1, '', 'true', [], {}]) {
    assert.throws(() => updateFolderPreferences({}, 'Project', { hidden }), /hidden|boolean|preference/i);
  }
  for (const patch of [Object.create({ hidden: true }), { hidden: true, unknown: false }]) {
    assert.throws(() => updateFolderPreferences({}, 'Project', patch), /preference/i);
  }
  const patch = Object.assign(Object.create(null), { hidden: true });
  assert.deepEqual(updateFolderPreferences({}, 'Project', patch), { Project: { hidden: true } });
});

test('folder visibility inherits hidden nonempty ancestors but root hiding stays local to Unfiled', () => {
  const preferences = { '': { hidden: true }, Project: { hidden: true }, 'Project/Child': { hidden: false }, Visible: { directory: 'Private label' } };
  for (const [folder, hidden] of [['', true], ['Project', true], ['Project/Child', true], ['Project/Child/Grandchild', true], ['Projects', false], ['Other/Project', false], ['Visible', false], ['Visible/Child', false]]) {
    assert.equal(isFolderHidden(folder, preferences), hidden, folder || 'Unfiled');
  }
  assert.equal(isFolderHidden('', { Project: { hidden: true } }), false);
  assert.equal(isFolderHidden('Visible', {}), false);
});

test('visibility treats prototype-like folder names as isolated own entries', () => {
  const preferences = updateFolderPreferences({}, '__proto__', { hidden: true });
  assert.equal(Object.getPrototypeOf(preferences), Object.prototype);
  assert.equal(isFolderHidden('__proto__', preferences), true);
  assert.equal(isFolderHidden('__proto__/Child', preferences), true);
  assert.equal(isFolderHidden('constructor', preferences), false);
  assert.equal(isFolderHidden('toString', preferences), false);
  assert.equal(isFolderHidden('Project', Object.create({ Project: { hidden: true } })), false);
  assert.equal(isFolderHidden('Project', { Project: Object.create({ hidden: true }) }), false);
  const renamed = renameFolderPreferences(preferences, '__proto__', 'constructor');
  assert.equal(isFolderHidden('__proto__/Child', renamed), false);
  assert.equal(isFolderHidden('constructor/Child', renamed), true);
});

test('preference patches reject unsafe folders, unknown fields and invalid value types', () => {
  for (const folder of [null, 42, '../Project', '/Project', 'Project//Child', 'Project\\Child']) {
    assert.throws(() => updateFolderPreferences({}, folder, { banner: null }), /folder|path/i);
  }
  for (const patch of [null, [], 'directory', { unknown: true }, { [Symbol('hidden')]: true }, { directory: undefined }, { directory: 42 }, { banner: undefined }, { banner: false }, { banner: {} }]) {
    assert.throws(() => updateFolderPreferences({}, 'Project', patch), /preference|directory|banner/i);
  }
});

test('directory metadata keeps labels or absolute local paths, never relative, remote or executable locations', () => {
  for (const directory of ['', '   ', 'x'.repeat(10000), 'folder\nname', 'folder\u0000name', 'folder\u007fname', 'folder\u0085name', 'folder/child', '../private', '\\\\server\\share', 'file:///private', 'https://example.test/private']) {
    assert.throws(() => updateFolderPreferences({}, 'Project', { directory }), /directory|path/i);
  }
  for (const directory of ['Photos — summer 2026', 'C:\\Users\\Private notes', '/home/private/notes']) {
    const saved = updateFolderPreferences({}, 'Project', { directory, banner: null });
    assert.deepEqual(renameFolderPreferences(saved, 'Project', 'Archive'), { Archive: { directory, banner: null } });
    assert.deepEqual(updateFolderPreferences(saved, 'Project', { directory: null }), { Project: { banner: null } });
  }
});

test('private banners reject remote images, executable formats, spoofed bytes and oversized data', () => {
  for (const unsafe of ['https://tracker.example/banner.png', 'data:image/svg+xml;base64,PHN2Zy8+', 'data:image/png;base64,PHN2Zy8+', `data:image/png;base64,${'A'.repeat(800000)}`]) {
    assert.throws(() => updateFolderPreferences({}, 'Project', { banner: unsafe }), /banner/i);
  }
  assert.deepEqual(updateFolderPreferences({}, 'Project', { banner }), { Project: { banner } });
});

test('renames move only exact and descendant keys, preserving root and neighboring prefixes', () => {
  const current = { '': { banner: null, hidden: true }, Project: { directory: 'Local project', hidden: true }, 'Project/Child': { banner, hidden: true }, Projects: { directory: 'Neighbor' }, 'Other/Project': { banner: null } };
  assert.deepEqual(renameFolderPreferences(current, 'Project', 'Archive/Project'), {
    '': { banner: null, hidden: true }, 'Archive/Project': { directory: 'Local project', hidden: true }, 'Archive/Project/Child': { banner, hidden: true }, Projects: { directory: 'Neighbor' }, 'Other/Project': { banner: null },
  });
  assert.deepEqual(current.Project, { directory: 'Local project', hidden: true });
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
  const networkRequests = [];
  replace(t, 'fetch', async url => {
    networkRequests.push(url);
    throw new Error(`Unexpected network request: ${url}`);
  });
  return { records, networkRequests, failNextWrite() { failWrite = true; } };
}

test('a fresh profile gets four locally available linked starter notes in one folder', async t => {
  const device = localWorkspace(t);
  const workspace = await openWorkspace();
  const snapshot = workspace.snapshot;
  assert.deepEqual(snapshot.folders, ['Getting started']);
  assert.equal(snapshot.notes.length, 4);
  assert.equal(new Set(snapshot.notes.map(note => note.id)).size, 4);
  assert.deepEqual(validateSnapshot(snapshot), snapshot);
  for (const note of snapshot.notes) {
    assert.equal(note.folder, 'Getting started');
    assert.equal(Boolean(note.deleted), false);
    assert.equal(note.id.startsWith('10000000-'), false);
    const targets = extractNoteTargets(note.content);
    assert.ok(targets.length > 0);
    for (const target of targets) assert.ok(resolveNoteLink(target, snapshot.notes, note), `Unresolved starter link: ${target}`);
  }
  assert.deepEqual(await workspace.exportSnapshot(), snapshot);
  assert.deepEqual(workspace.folderPreferences, {});
  assert.deepEqual(device.records.get('personal').base, { notes: [], folders: [] });
  assert.deepEqual(EMPTY_VAULT, { notes: [], folders: [] });
  assert.deepEqual((await openWorkspace()).snapshot, snapshot);
  assert.deepEqual(device.networkRequests, []);
});

test('starter notes can be edited and their folder deletion persists without reseeding', async t => {
  const device = localWorkspace(t);
  const workspace = await openWorkspace();
  const original = workspace.snapshot.notes[0];
  await workspace.saveNote({ ...original, content: 'My own introduction' });
  assert.equal((await openWorkspace()).snapshot.notes.find(note => note.id === original.id).content, 'My own introduction');
  await workspace.deleteFolder('Getting started');
  const deleted = workspace.snapshot;
  assert.deepEqual(deleted.folders, []);
  assert.equal(deleted.notes.length, 4);
  assert.ok(deleted.notes.every(note => note.deleted));
  assert.equal(deleted.notes.find(note => note.id === original.id).content, 'My own introduction');
  assert.deepEqual((await openWorkspace()).snapshot, deleted);
  assert.deepEqual(device.networkRequests, []);
});

test('an intentionally empty personal vault is never seeded or rewritten', async t => {
  const device = localWorkspace(t);
  const personal = { snapshot: { notes: [], folders: [] }, base: { notes: [], folders: [] }, revision: 9, dirty: false };
  device.records.set('personal', structuredClone(personal));
  const workspace = await openWorkspace();
  assert.deepEqual(workspace.snapshot, { notes: [], folders: [] });
  assert.deepEqual(device.records.get('personal'), personal);
  assert.deepEqual((await openWorkspace()).snapshot, { notes: [], folders: [] });
});

test('concurrent fresh opens use the same single starter vault', async t => {
  localWorkspace(t);
  const [first, second] = await Promise.all([openWorkspace(), openWorkspace()]);
  assert.equal(first.snapshot.notes.length, 4);
  assert.deepEqual(first.snapshot, second.snapshot);
  assert.deepEqual((await openWorkspace()).snapshot, first.snapshot);
});

test('initializing a personal vault neither migrates nor deletes legacy-only records', async t => {
  const device = localWorkspace(t);
  const legacy = {
    active: { key: 'team:alice', user: { id: 'alice', role: 'viewer' }, workspaceName: 'Old team' },
    'team:alice': { snapshot: { notes: [{ id: 'legacy-note', title: 'Legacy note', folder: 'Team', content: 'Keep legacy content', updatedAt: 1 }], folders: ['Team'] }, revision: 8, dirty: false },
    'folder-preferences:team:alice': { Team: { directory: 'Legacy location' } },
  };
  for (const [key, value] of Object.entries(legacy)) device.records.set(key, structuredClone(value));
  const workspace = await openWorkspace();
  assert.deepEqual(workspace.snapshot.folders, ['Getting started']);
  assert.equal(workspace.snapshot.notes.length, 4);
  assert.equal(workspace.snapshot.notes.some(note => note.id === 'legacy-note'), false);
  assert.deepEqual(workspace.folderPreferences, {});
  for (const [key, value] of Object.entries(legacy)) assert.deepEqual(device.records.get(key), value);
  assert.deepEqual(device.networkRequests, []);
});

test('startup uses personal notes and preferences without touching cached team identities or sessions', async t => {
  const device = localWorkspace(t);
  const personal = { snapshot: { notes: [{ id: 'personal-note', title: 'Private note', folder: 'Project', content: 'Personal content', updatedAt: 1 }, { id: '10000000-0000-4000-8000-000000000001', title: 'Edited old sample', folder: '', content: 'Keep my edited starter note', updatedAt: 2 }], folders: ['Project'] }, base: { notes: [], folders: [] }, revision: 0, dirty: true };
  const legacy = {
    active: { key: 'team:alice', user: { id: 'alice', role: 'viewer' }, workspaceName: 'Old team' },
    'team:alice': { snapshot: { notes: [], folders: ['Team only'] }, revision: 8, dirty: false },
    'folder-preferences:team:alice': { Project: { directory: 'Alice', banner: null } },
  };
  device.records.set('personal', structuredClone(personal));
  device.records.set('folder-preferences:personal', { Project: { directory: 'Personal', banner, hidden: true } });
  for (const [key, value] of Object.entries(legacy)) device.records.set(key, structuredClone(value));
  const workspace = await openWorkspace();
  assert.deepEqual(workspace.snapshot, personal.snapshot);
  assert.deepEqual(workspace.folderPreferences, { Project: { directory: 'Personal', banner, hidden: true } });
  assert.deepEqual(device.records.get('personal'), personal);
  await workspace.saveFolderPreferences('Project', { directory: 'Updated personal' });
  await workspace.saveNote({ ...personal.snapshot.notes[0], content: 'Edited personal content' });
  const reopened = await openWorkspace();
  assert.equal(reopened.snapshot.notes[0].content, 'Edited personal content');
  assert.equal(reopened.folderPreferences.Project.directory, 'Updated personal');
  assert.equal(reopened.folderPreferences.Project.hidden, true);
  assert.deepEqual(reopened.snapshot.notes.find(note => note.id === personal.snapshot.notes[1].id), personal.snapshot.notes[1]);
  for (const [key, value] of Object.entries(legacy)) assert.deepEqual(device.records.get(key), value);
  assert.deepEqual(device.networkRequests, []);
});


test('hidden preference toggles leave notes, export, dirty state and cloud payload unchanged', async t => {
  const device = localWorkspace(t);
  device.records.set('personal', { snapshot: { notes: [{ id: 'private-note', title: 'Private note', folder: 'Project/Child', content: 'Keep this note in backups and cloud', updatedAt: 1 }], folders: ['Project', 'Project/Child'] }, base: { notes: [], folders: [] }, revision: 0, dirty: false });
  const workspace = await openWorkspace();
  const before = workspace.snapshot;
  const storedBefore = structuredClone(device.records.get('personal'));
  await workspace.saveFolderPreferences('Project', { banner, directory: 'Private project label', hidden: true });
  const exposed = workspace.folderPreferences;
  exposed.Project.directory = 'Mutated clone';
  exposed.Project.hidden = false;
  assert.deepEqual(workspace.folderPreferences, { Project: { banner, directory: 'Private project label', hidden: true } });
  assert.equal(isFolderHidden('Project/Child', (await openWorkspace()).folderPreferences), true);
  await workspace.saveFolderPreferences('Project', { hidden: false });
  assert.deepEqual(workspace.folderPreferences, { Project: { banner, directory: 'Private project label' } });
  assert.equal(isFolderHidden('Project/Child', workspace.folderPreferences), false);
  assert.deepEqual(workspace.snapshot, before);
  assert.deepEqual(await workspace.exportSnapshot(), before);
  assert.deepEqual(device.records.get('personal'), storedBefore);
  await workspace.saveFolderPreferences('Project', { hidden: true });
  assert.deepEqual(device.records.get('personal'), storedBefore);
  assert.deepEqual(await workspace.exportSnapshot(), before);
  let uploaded;
  await workspace.syncCloud({ name: 'Test cloud', load: async () => null, save: async snapshot => { uploaded = snapshot; } });
  assert.deepEqual(uploaded, before);
  assert.equal(JSON.stringify(uploaded).includes('Private project label'), false);
  assert.equal(JSON.stringify(uploaded).includes(banner), false);
  assert.equal(JSON.stringify(uploaded).includes('"hidden"'), false);
});

test('workspace enables saving and service labels on an existing private path', async t => {
  localWorkspace(t);
  const workspace = await openWorkspace();
  await workspace.saveFolderPreferences('Project', { directory: 'C:\\Private notes' });
  await workspace.saveFolderPreferences('Project', { directorySync: true });
  await workspace.saveFolderPreferences('Project', { directoryService: 'onedrive-ea' });
  assert.deepEqual((await openWorkspace()).folderPreferences.Project, { directory: 'C:\\Private notes', directorySync: true, directoryService: 'onedrive-ea' });
  await workspace.saveFolderPreferences('Project', { directorySync: false });
  assert.equal((await openWorkspace()).folderPreferences.Project.directorySync, undefined);
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

test('folder rename moves descendant preferences and recursive deletion preserves neighboring prefixes', async t => {
  localWorkspace(t);
  const workspace = await openWorkspace();
  await workspace.replaceSnapshot({ notes: [], folders: ['Project', 'Project/Child', 'Projects'] });
  await workspace.saveFolderPreferences('Project', { directory: 'Local project', hidden: true });
  await workspace.saveFolderPreferences('Project/Child', { banner: null, hidden: true });
  await workspace.saveFolderPreferences('Projects', { directory: 'Unrelated' });
  await workspace.renameFolder('Project', 'Archive');
  assert.deepEqual(workspace.folderPreferences, { Archive: { directory: 'Local project', hidden: true }, 'Archive/Child': { banner: null, hidden: true }, Projects: { directory: 'Unrelated' } });
  assert.equal(isFolderHidden('Archive/Child', workspace.folderPreferences), true);
  assert.equal(isFolderHidden('Project/Child', workspace.folderPreferences), false);
  await workspace.deleteFolder('Archive');
  assert.deepEqual(workspace.folderPreferences, { Projects: { directory: 'Unrelated' } });
  assert.deepEqual(workspace.snapshot.folders, ['Projects']);
});

test('a failed rename preserves both notes and preferences in their original locations', async t => {
  const device = localWorkspace(t);
  const workspace = await openWorkspace();
  await workspace.replaceSnapshot({ notes: [{ id: 'readme', title: 'README', folder: 'Project', content: 'Shared overview', updatedAt: 1 }], folders: ['Project'] });
  await workspace.saveFolderPreferences('Project', { directory: 'Private location', banner, hidden: true });
  const before = workspace.snapshot;
  device.failNextWrite();
  await assert.rejects(workspace.renameFolder('Project', 'Archive'), /save|storage/i);
  assert.deepEqual(workspace.snapshot, before);
  assert.deepEqual(workspace.folderPreferences, { Project: { directory: 'Private location', banner, hidden: true } });
});

test('deleting a personal folder leaves legacy team preferences untouched', async t => {
  const device = localWorkspace(t);
  const legacy = { Project: { directory: 'Alice location' } };
  device.records.set('folder-preferences:team:alice', structuredClone(legacy));
  const workspace = await openWorkspace();
  await workspace.replaceSnapshot({ notes: [], folders: ['Project'] });
  await workspace.saveFolderPreferences('Project', { directory: 'Personal location' });
  await workspace.deleteFolder('Project');
  assert.deepEqual(workspace.folderPreferences, {});
  assert.deepEqual(device.records.get('folder-preferences:team:alice'), legacy);
});

test('independent workspace instances merge private patches against the latest locked local record', async t => {
  localWorkspace(t);
  const first = await openWorkspace();
  const second = await openWorkspace();
  const patch = { banner, hidden: true };
  const directoryWrite = first.saveFolderPreferences('Project', { directory: 'Device folder' });
  const bannerWrite = second.saveFolderPreferences('Project', patch);
  patch.banner = null;
  patch.hidden = false;
  await Promise.all([directoryWrite, bannerWrite]);
  assert.deepEqual(second.folderPreferences, { Project: { directory: 'Device folder', banner, hidden: true } });
});

test('personal mutations remain queued across cloud refresh and preserve later edits', async t => {
  localWorkspace(t);
  const workspace = await openWorkspace();
  await workspace.replaceSnapshot({ notes: [{ id: 'personal-note', title: 'Note', folder: '', content: 'Before', updatedAt: 1 }], folders: [] });
  let release;
  const loading = new Promise(resolve => { release = resolve; });
  const refresh = workspace.syncCloud({ name: 'Read-only cloud', readOnly: true, load: () => loading, save: async () => { throw new Error('Read-only cloud must not upload'); } });
  const edit = workspace.saveNote({ id: 'personal-note', title: 'Note', folder: '', content: 'After' });
  release(null);
  await Promise.all([refresh, edit]);
  assert.equal((await workspace.exportSnapshot()).notes.find(note => note.id === 'personal-note').content, 'After');
});

test('independent personal writers merge notes under the existing cross-tab lock', async t => {
  localWorkspace(t);
  const first = await openWorkspace();
  const second = await openWorkspace();
  await Promise.all([
    first.saveNote({ id: 'first-note', title: 'First', folder: '', content: 'From one tab' }),
    second.saveNote({ id: 'second-note', title: 'Second', folder: '', content: 'From another tab' }),
  ]);
  const reopened = await openWorkspace();
  assert.equal(reopened.snapshot.notes.find(note => note.id === 'first-note').content, 'From one tab');
  assert.equal(reopened.snapshot.notes.find(note => note.id === 'second-note').content, 'From another tab');
});

test('read-only cloud refresh merges remote notes without uploading or exposing private preferences', async t => {
  const device = localWorkspace(t);
  device.records.set('personal', { snapshot: { notes: [{ id: 'local-note', title: 'Local', folder: 'Project', content: 'Keep local content', updatedAt: 1 }], folders: ['Project'] }, base: { notes: [], folders: [] }, revision: 0, dirty: false });
  const workspace = await openWorkspace();
  await workspace.saveFolderPreferences('Project', { directory: 'Private directory', banner, hidden: true });
  const before = workspace.snapshot;
  await workspace.syncCloud({
    name: 'Read-only cloud', readOnly: true,
    load: async () => ({ snapshot: { notes: [{ id: 'remote-note', title: 'Remote', folder: '', content: 'Remote content', updatedAt: 1 }], folders: [] }, revision: 'remote-revision' }),
    save: async () => { throw new Error('Read-only cloud must not upload'); },
  });
  assert.equal(workspace.snapshot.notes.find(note => note.id === 'remote-note').content, 'Remote content');
  for (const note of before.notes) assert.deepEqual(workspace.snapshot.notes.find(item => item.id === note.id), note);
  assert.deepEqual(device.records.get('personal:recovery').snapshot, before);
  assert.deepEqual(workspace.folderPreferences, { Project: { directory: 'Private directory', banner, hidden: true } });
  assert.match(workspace.status, /read-only/);
});

test('failed cloud uploads retain merged notes and reject invalid or unavailable remote snapshots without losing them', async t => {
  const device = localWorkspace(t);
  device.records.set('personal', { snapshot: { notes: [{ id: 'local-note', title: 'Local', folder: '', content: 'Keep local content', updatedAt: 1 }], folders: [] }, base: { notes: [], folders: [] }, revision: 0, dirty: false });
  const workspace = await openWorkspace();
  const before = workspace.snapshot;
  await assert.rejects(workspace.syncCloud({
    name: 'Failing cloud',
    load: async () => ({ snapshot: { notes: [{ id: 'remote-note', title: 'Remote', folder: '', content: 'Retain me', updatedAt: 1 }], folders: [] }, revision: 'r1' }),
    save: async () => { throw new Error('Upload refused'); },
  }), /Upload refused/);
  const merged = workspace.snapshot;
  assert.equal(merged.notes.find(note => note.id === 'remote-note').content, 'Retain me');
  for (const note of before.notes) assert.deepEqual(merged.notes.find(item => item.id === note.id), note);
  assert.match(workspace.status, /Local notes retained/);
  await assert.rejects(workspace.syncCloud({ name: 'Invalid cloud', load: async () => ({ snapshot: { notes: 'invalid', folders: [] } }) }));
  assert.deepEqual(workspace.snapshot, merged);
  await assert.rejects(workspace.syncCloud({ name: 'Offline cloud', load: async () => { throw new Error('Offline'); } }), /Offline/);
  assert.deepEqual(workspace.snapshot, merged);
});

test('recursive folder deletion tombstones exact and descendant notes without erasing content', async t => {
  const device = localWorkspace(t);
  const notes = [
    { id: 'parent', title: 'Parent', folder: 'Project', content: 'Keep parent bytes', updatedAt: 1 },
    { id: 'child', title: 'Child', folder: 'Project/Child/Deep', content: 'Keep child bytes', updatedAt: 1 },
    { id: 'neighbor', title: 'Neighbor', folder: 'Projects', content: 'Stay active', updatedAt: 1 },
    { id: 'root', title: 'Root', folder: '', content: 'Stay unfiled', updatedAt: 1 },
    { id: 'deleted', title: 'Deleted', folder: 'Project/Old', content: 'Old tombstone', updatedAt: 1, deleted: true },
  ];
  device.records.set('personal', { snapshot: { notes, folders: ['Project', 'Project/Child', 'Project/Child/Deep', 'Project/Empty', 'Projects'] }, base: { notes: [], folders: [] }, revision: 0, dirty: false });
  const workspace = await openWorkspace();
  await workspace.saveFolderPreferences('Project', { directory: 'C:\\Private notes', directorySync: true });
  await workspace.saveFolderPreferences('Project/Child/Deep', { banner: null, hidden: true });
  await workspace.saveFolderPreferences('Project/Unlisted', { directory: 'C:\\Private unlisted' });
  await workspace.saveFolderPreferences('Projects', { directory: 'Unrelated' });
  await workspace.saveFolderPreferences('', { banner: null });
  await workspace.deleteFolder('Project');
  assert.deepEqual(workspace.snapshot.folders, ['Projects']);
  for (const id of ['parent', 'child']) {
    const note = workspace.snapshot.notes.find(note => note.id === id);
    assert.equal(note.deleted, true);
    assert.equal(note.content, notes.find(note => note.id === id).content);
    assert.ok(note.updatedAt > 1);
  }
  for (const id of ['neighbor', 'root', 'deleted']) assert.deepEqual(workspace.snapshot.notes.find(note => note.id === id), notes.find(note => note.id === id));
  assert.deepEqual(workspace.folderPreferences, { Projects: { directory: 'Unrelated' }, '': { banner: null } });
  assert.deepEqual((await openWorkspace()).snapshot, workspace.snapshot);
  assert.deepEqual((await openWorkspace()).folderPreferences, workspace.folderPreferences);
  assert.deepEqual(device.networkRequests, []);
});

test('failed recursive deletion preserves both the vault and private folder references', async t => {
  const device = localWorkspace(t);
  const workspace = await openWorkspace();
  await workspace.saveFolderPreferences('Getting started', { directory: 'C:\\Keep these files', directorySync: true });
  const before = workspace.snapshot;
  const preferences = workspace.folderPreferences;
  let emissions = 0;
  workspace.subscribe(() => emissions++);
  device.failNextWrite();
  await assert.rejects(workspace.deleteFolder('Getting started'), /save|storage/i);
  assert.deepEqual(workspace.snapshot, before);
  assert.deepEqual(workspace.folderPreferences, preferences);
  assert.deepEqual((await openWorkspace()).snapshot, before);
  assert.equal(emissions, 0);
});

test('folder deletion includes notes created by another workspace after this instance opened', async t => {
  localWorkspace(t);
  const first = await openWorkspace();
  const second = await openWorkspace();
  await first.saveNote({ id: 'new-child', title: 'New child', folder: 'Project/Child', content: 'Retain as tombstone' });
  await second.deleteFolder('Project');
  const reopened = await openWorkspace();
  assert.equal(reopened.snapshot.notes.find(note => note.id === 'new-child').deleted, true);
  assert.equal(reopened.snapshot.folders.some(folder => folder === 'Project' || folder.startsWith('Project/')), false);
});

test('AI revision updates only the content of the latest active note', async t => {
  const device = localWorkspace(t);
  const original = { id: 'revision-note', title: 'Original title', folder: 'Project', content: 'Expected body', updatedAt: 1 };
  device.records.set('personal', { snapshot: { notes: [original], folders: ['Project'] }, base: { notes: [], folders: [] }, revision: 0, dirty: false });
  const first = await openWorkspace();
  const second = await openWorkspace();
  await first.saveNote({ ...original, title: 'Renamed elsewhere', folder: 'Archive' });
  const changed = await second.applyAIRevision(original.id, 'Expected body', '# Revised body');
  assert.equal(changed.id, original.id);
  assert.equal(changed.title, 'Renamed elsewhere');
  assert.equal(changed.folder, 'Archive');
  assert.equal(changed.content, '# Revised body');
  assert.ok(changed.updatedAt > 1);
  assert.deepEqual((await openWorkspace()).snapshot.notes.find(note => note.id === original.id), changed);
});

test('AI revision rejects a newer cross-instance edit without writing or emitting', async t => {
  const device = localWorkspace(t);
  const original = { id: 'revision-note', title: 'Note', folder: '', content: 'Expected body', updatedAt: 1 };
  device.records.set('personal', { snapshot: { notes: [original], folders: [] }, base: { notes: [], folders: [] }, revision: 0, dirty: false });
  const first = await openWorkspace();
  const second = await openWorkspace();
  let emissions = 0;
  second.subscribe(() => emissions++);
  await first.saveNote({ ...original, content: 'Newer body' });
  const before = structuredClone(device.records.get('personal'));
  await assert.rejects(second.applyAIRevision(original.id, 'Expected body', 'AI body'), /changed/i);
  assert.deepEqual(device.records.get('personal'), before);
  assert.equal((await openWorkspace()).snapshot.notes[0].content, 'Newer body');
  assert.equal(emissions, 0);
});

test('AI revision rejects cross-instance deletion and missing notes without resurrection', async t => {
  const device = localWorkspace(t);
  const original = { id: 'revision-note', title: 'Note', folder: '', content: 'Expected body', updatedAt: 1 };
  device.records.set('personal', { snapshot: { notes: [original], folders: [] }, base: { notes: [], folders: [] }, revision: 0, dirty: false });
  const first = await openWorkspace();
  const second = await openWorkspace();
  await first.deleteNote(original.id);
  const before = structuredClone(device.records.get('personal'));
  await assert.rejects(second.applyAIRevision(original.id, 'Expected body', 'AI body'), /deleted|available/i);
  await assert.rejects(second.applyAIRevision('missing', 'Expected body', 'AI body'), /deleted|available/i);
  assert.deepEqual(device.records.get('personal'), before);
});

test('simultaneous AI revisions compare expected content inside the cross-tab write lock', async t => {
  const device = localWorkspace(t);
  const original = { id: 'revision-note', title: 'Note', folder: '', content: 'Expected body', updatedAt: 1 };
  device.records.set('personal', { snapshot: { notes: [original], folders: [] }, base: { notes: [], folders: [] }, revision: 0, dirty: false });
  const first = await openWorkspace();
  const second = await openWorkspace();
  const results = await Promise.allSettled([
    first.applyAIRevision(original.id, 'Expected body', 'First revision'),
    second.applyAIRevision(original.id, 'Expected body', 'Second revision'),
  ]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.match(results.find(result => result.status === 'rejected').reason.message, /changed/i);
  const snapshot = (await openWorkspace()).snapshot;
  assert.equal(snapshot.notes.length, 1);
  assert.equal(snapshot.notes[0].content, results.find(result => result.status === 'fulfilled').value.content);
});

test('AI revision validation and failed persistence leave the original note unchanged', async t => {
  const device = localWorkspace(t);
  const original = { id: 'revision-note', title: 'Note', folder: '', content: 'Expected body', updatedAt: 1 };
  device.records.set('personal', { snapshot: { notes: [original], folders: [] }, base: { notes: [], folders: [] }, revision: 0, dirty: false });
  const workspace = await openWorkspace();
  await assert.rejects(workspace.applyAIRevision(original.id, 'Expected body', null), /content/i);
  device.failNextWrite();
  await assert.rejects(workspace.applyAIRevision(original.id, 'Expected body', 'AI body'), /save|storage/i);
  assert.deepEqual(workspace.snapshot.notes[0], original);
  assert.deepEqual((await openWorkspace()).snapshot.notes[0], original);
});

test('ordinary concurrent note edits still retain a recoverable conflict copy', async t => {
  const device = localWorkspace(t);
  const original = { id: 'shared-note', title: 'Shared', folder: '', content: 'Original body', updatedAt: 1 };
  device.records.set('personal', { snapshot: { notes: [original], folders: [] }, base: { notes: [], folders: [] }, revision: 0, dirty: false });
  const first = await openWorkspace();
  const second = await openWorkspace();
  await Promise.all([
    first.saveNote({ ...original, content: 'First writer' }),
    second.saveNote({ ...original, content: 'Second writer' }),
  ]);
  const snapshot = (await openWorkspace()).snapshot;
  assert.equal(snapshot.notes.filter(note => !note.deleted).length, 2);
  assert.deepEqual(snapshot.notes.map(note => note.content).sort(), ['First writer', 'Second writer']);
});

test('workspaces isolate notes and folder preferences and persist active selection across reloads', async t => {
  localWorkspace(t);
  const workspace = await openWorkspace();
  assert.equal(workspace.id, 'personal');
  assert.equal(workspace.name, 'Personal workspace');
  const created = await workspace.createWorkspace('Client Alpha');
  assert.equal(workspace.id, created.id);
  assert.equal(workspace.name, 'Client Alpha');
  assert.deepEqual(workspace.snapshot, { notes: [], folders: [] });
  await workspace.addFolder('Specs');
  await workspace.saveNote({ id: 'alpha-1', title: 'Architecture', folder: 'Specs', content: '# Spec' });
  await workspace.saveFolderPreferences('Specs', { hidden: true });
  await assert.rejects(workspace.createWorkspace('client alpha'), /already exists/i);
  const reopened = await openWorkspace();
  assert.equal(reopened.id, created.id);
  assert.equal(reopened.snapshot.notes[0].title, 'Architecture');
  assert.equal(reopened.folderPreferences.Specs.hidden, true);
  await reopened.switchWorkspace('personal');
  assert.equal(reopened.id, 'personal');
  assert.equal(reopened.snapshot.notes.some(n => n.id === 'alpha-1'), false);
  assert.equal(reopened.folderPreferences.Specs, undefined);
  await reopened.renameWorkspace('personal', 'Main garden');
  assert.equal(reopened.name, 'Main garden');
  const allSnapshots = await reopened.listWorkspaceSnapshots();
  assert.equal(allSnapshots.length, 2);
  assert.deepEqual(allSnapshots.map(w => ({ name: w.name, active: w.active })), [
    { name: 'Main garden', active: true },
    { name: 'Client Alpha', active: false },
  ]);
  assert.equal(allSnapshots[1].snapshot.notes[0].title, 'Architecture');
});
