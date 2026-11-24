import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { exportMarkdown } from '../desktop/files.js';
import { chooseDirectory } from '../src/directory.js';

const note = (overrides = {}) => ({ id: 'one', title: 'Welcome', folder: '', content: '# Hello 🐄\n', updatedAt: 1, ...overrides });
const snapshot = (notes = [note()], folders = []) => ({ notes, folders });

async function temporaryDirectory(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'nitrobison-export-'));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

async function directoryLink(t, target, link) {
  try { await fs.symlink(target, link, process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES' || error.code === 'ENOTSUP') {
      t.skip(`Directory links unavailable: ${error.code}`);
      return false;
    }
    throw error;
  }
  return true;
}

test('native export preserves nested Markdown, empty folders, and unrelated destination entries', async t => {
  const root = await temporaryDirectory(t);
  await fs.writeFile(path.join(root, 'unrelated.txt'), 'keep me');
  assert.equal(await exportMarkdown(snapshot([
    note({ folder: 'Projects/Nested' }),
    note({ id: 'two', title: 'Empty', content: '' }),
  ], ['Empty/Nested', 'Projects/Nested']), root), 2);
  assert.equal(await fs.readFile(path.join(root, 'Projects/Nested/Welcome.md'), 'utf8'), '# Hello 🐄\n');
  assert.equal(await fs.readFile(path.join(root, 'Empty.md'), 'utf8'), '');
  assert.equal((await fs.stat(path.join(root, 'Empty/Nested'))).isDirectory(), true);
  assert.equal(await fs.readFile(path.join(root, 'unrelated.txt'), 'utf8'), 'keep me');
});

test('identical files are skipped rather than rewritten and still count as surviving notes', async t => {
  const root = await temporaryDirectory(t);
  const file = path.join(root, 'Welcome.md');
  await fs.writeFile(file, '# Hello 🐄\n');
  await fs.utimes(file, new Date('2000-01-01'), new Date('2000-01-01'));
  const before = await fs.stat(file);
  assert.equal(await exportMarkdown(snapshot(), root), 1);
  const after = await fs.stat(file);
  assert.equal(after.mtimeMs, before.mtimeMs);
  assert.equal(after.ino, before.ino);
});

test('a later content conflict rejects before creating earlier notes or empty folders', async t => {
  const root = await temporaryDirectory(t);
  await fs.writeFile(path.join(root, 'Z.md'), 'precious local edit');
  await assert.rejects(exportMarkdown(snapshot([
    note({ title: 'A', folder: 'New/Nested' }),
    note({ id: 'two', title: 'Z' }),
  ], ['Empty']), root), /conflict|exist|overwrite/i);
  assert.deepEqual(await fs.readdir(root), ['Z.md']);
  assert.equal(await fs.readFile(path.join(root, 'Z.md'), 'utf8'), 'precious local edit');
});

test('every explicit empty directory is preflighted for file mismatches before creating anything', async t => {
  const root = await temporaryDirectory(t);
  await fs.writeFile(path.join(root, 'Z'), 'not a directory');
  await assert.rejects(exportMarkdown(snapshot([], ['A/Nested', 'Z/Nested']), root), /conflict|directory|folder/i);
  assert.deepEqual(await fs.readdir(root), ['Z']);
});

test('a directory where a Markdown file belongs is a preflight conflict', async t => {
  const root = await temporaryDirectory(t);
  await fs.mkdir(path.join(root, 'Welcome.md'));
  await assert.rejects(exportMarkdown(snapshot([note({ id: 'early', title: 'Earlier' }), note()], ['Empty']), root), /conflict|file|directory/i);
  assert.deepEqual(await fs.readdir(root), ['Welcome.md']);
});

test('unsafe snapshots never create files or folders', async t => {
  const root = await temporaryDirectory(t);
  const invalid = [
    snapshot([note({ title: '../outside' })]),
    snapshot([note({ folder: '../outside' })]),
    snapshot([note({ title: 'CON' })]),
    snapshot([note({ title: 'com1.log' })]),
    snapshot([note({ title: 'LPT9' })]),
    snapshot([note({ title: 'bad\\name' })]),
    snapshot([note({ title: 'bad:name' })]),
    snapshot([note({ title: 'COM¹' })]),
    snapshot([note({ title: 'LPT².log' })]),
    snapshot([note({ title: 'CONIN$' })]),
    snapshot([note({ title: 'CONOUT$' })]),
    snapshot([note({ title: 'bad\u007fname' })]),
    snapshot([note({ title: 'trailing.' })]),
    snapshot([], ['A//B']),
    snapshot([], ['NUL/Nested']),
    snapshot([], ['a'.repeat(241)]),
    snapshot([note({ id: 'duplicate' }), note({ id: 'duplicate', title: 'Another' })]),
    snapshot([note({ content: 3 })]),
  ];
  for (const value of invalid) {
    await assert.rejects(exportMarkdown(value, root));
    assert.deepEqual(await fs.readdir(root), []);
  }
});

test('case, Unicode normalization, and file-versus-folder snapshot collisions reject before creation', async t => {
  const root = await temporaryDirectory(t);
  for (const value of [
    snapshot([note(), note({ id: 'two', title: 'welcome' })]),
    snapshot([note({ title: 'é' }), note({ id: 'two', title: 'e\u0301' })]),
    snapshot([note({ folder: 'Projects' }), note({ id: 'two', title: 'Another', folder: 'projects' })]),
    snapshot([note()], ['Welcome.md/Nested']),
    snapshot([], ['Projects', 'projects/Nested']),
  ]) {
    await assert.rejects(exportMarkdown(value, root), /collision|duplicate/i);
    assert.deepEqual(await fs.readdir(root), []);
  }
});

test('existing differently cased destination files and directories are never silently reused', async t => {
  const root = await temporaryDirectory(t);
  await fs.writeFile(path.join(root, 'welcome.md'), '# Hello 🐄\n');
  await assert.rejects(exportMarkdown(snapshot(), root), /collision|conflict/i);
  await fs.mkdir(path.join(root, 'projects'));
  await assert.rejects(exportMarkdown(snapshot([note({ folder: 'Projects' })]), root), /collision|conflict/i);
  assert.deepEqual((await fs.readdir(root)).sort(), ['projects', 'welcome.md']);
});

test('tombstones neither create Markdown nor implicitly recreate their folders', async t => {
  const root = await temporaryDirectory(t);
  await fs.writeFile(path.join(root, 'Deleted.md'), 'keep historical export');
  assert.equal(await exportMarkdown(snapshot([
    note(),
    note({ id: 'two', title: 'Deleted', folder: 'Gone/Nested', deleted: true }),
    note({ id: 'three', title: 'welcome', deleted: true }),
  ]), root), 1);
  assert.deepEqual((await fs.readdir(root)).sort(), ['Deleted.md', 'Welcome.md']);
  assert.equal(await fs.readFile(path.join(root, 'Deleted.md'), 'utf8'), 'keep historical export');
});

test('selected roots must already be real directories, never files, links, or missing paths', async t => {
  const base = await temporaryDirectory(t);
  const file = path.join(base, 'file');
  await fs.writeFile(file, 'keep');
  for (const root of [file, path.join(base, 'missing'), '', null, 'relative-directory']) {
    await assert.rejects(exportMarkdown(snapshot(), root), /directory|root|absolute/i);
  }
  const real = path.join(base, 'real');
  await fs.mkdir(real);
  const linked = path.join(base, 'linked');
  if (!await directoryLink(t, real, linked)) return;
  await assert.rejects(exportMarkdown(snapshot(), linked), /link|directory/i);
  assert.deepEqual(await fs.readdir(real), []);
});

test('directory symlinks or junctions below root reject even when they point back inside root', async t => {
  const root = await temporaryDirectory(t);
  const outside = await temporaryDirectory(t);
  await fs.mkdir(path.join(root, 'Real'));
  if (!await directoryLink(t, outside, path.join(root, 'Outside'))) return;
  if (!await directoryLink(t, path.join(root, 'Real'), path.join(root, 'Inside'))) return;
  for (const folder of ['Outside', 'Inside']) {
    await assert.rejects(exportMarkdown(snapshot([note({ folder })], ['WouldBeCreated']), root), /link|contain|conflict/i);
    await assert.rejects(exportMarkdown(snapshot([], [`${folder}/Empty`]), root), /link|contain|conflict/i);
  }
  assert.deepEqual(await fs.readdir(outside), []);
  assert.deepEqual(await fs.readdir(path.join(root, 'Real')), []);
  await assert.rejects(fs.stat(path.join(root, 'WouldBeCreated')), { code: 'ENOENT' });
});

test('file symlinks are rejected rather than read or overwritten', async t => {
  const root = await temporaryDirectory(t);
  const outside = await temporaryDirectory(t);
  const target = path.join(outside, 'original.md');
  await fs.writeFile(target, '# Hello 🐄\n');
  try { await fs.symlink(target, path.join(root, 'Welcome.md'), 'file'); }
  catch (error) {
    if (error.code === 'EPERM' || error.code === 'EACCES' || error.code === 'ENOTSUP') { t.skip(`File links unavailable: ${error.code}`); return; }
    throw error;
  }
  await assert.rejects(exportMarkdown(snapshot(), root), /link|conflict/i);
  assert.equal(await fs.readFile(target, 'utf8'), '# Hello 🐄\n');
});

test('a junction appearing when a missing folder is created cannot redirect exported files', async t => {
  const root = await temporaryDirectory(t);
  const outside = await temporaryDirectory(t);
  const target = path.join(root, 'New');
  const probe = path.join(root, 'probe');
  if (!await directoryLink(t, outside, probe)) return;
  await fs.unlink(probe);
  const realMkdir = fs.mkdir.bind(fs);
  let appeared = false;
  t.mock.method(fs, 'mkdir', async (directory, ...rest) => {
    if (path.resolve(String(directory)) === target && !appeared) {
      appeared = true;
      await fs.symlink(outside, target, process.platform === 'win32' ? 'junction' : 'dir');
    }
    return realMkdir(directory, ...rest);
  });
  await assert.rejects(exportMarkdown(snapshot([note({ folder: 'New/Nested' })]), root), /link|junction|conflict/i);
  assert.equal(appeared, true);
  assert.deepEqual(await fs.readdir(outside), []);
});

test('an actual file appearing at exclusive creation is preserved rather than overwritten', async t => {
  const root = await temporaryDirectory(t);
  const target = path.join(root, 'Welcome.md');
  const realOpen = fs.open.bind(fs);
  let appeared = false;
  t.mock.method(fs, 'open', async (file, flags, ...rest) => {
    if (path.resolve(String(file)) === target && (typeof flags === 'string' ? flags.includes('w') : flags & 64)) {
      appeared = true;
      await fs.writeFile(target, 'concurrent writer wins');
    }
    return realOpen(file, flags, ...rest);
  });
  await assert.rejects(exportMarkdown(snapshot(), root), /exist|conflict|EEXIST/i);
  assert.equal(appeared, true);
  assert.equal(await fs.readFile(target, 'utf8'), 'concurrent writer wins');
});

test('native directory selection validates absolute local paths and bypasses browser enumeration', async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  t.after(() => previous ? Object.defineProperty(globalThis, 'window', previous) : delete globalThis.window);
  let result = 'C:\\Users\\Équipe 🐄\\Notes';
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    nitrobisonDesktop: { isDesktop: true, chooseDirectory: async () => result },
    showDirectoryPicker: () => { throw new Error('Browser picker must not run'); },
  } });
  assert.equal(await chooseDirectory(), 'C:\\Users\\Équipe 🐄\\Notes');
  for (result of ['C:/Users/Équipe 🐄/Notes', '/home/Équipe 🐄/Notes', 'C:\\', '/']) {
    assert.equal(await chooseDirectory(), result);
  }
  result = null;
  assert.equal(await chooseDirectory(), null);
  for (result of ['Notes', '../notes', '.', '', 'C:relative', '\\root-relative', '\\\\server\\share', '//server/share', '\\\\?\\C:\\Notes', '\\\\.\\C:\\Notes', 'C:\\line\nbreak', '/bad\u007fname', `/${'a'.repeat(4096)}`, { name: 'Notes', path: 'C:\\private\\Notes' }]) {
    await assert.rejects(chooseDirectory(), /directory|name/i);
  }
});

test('a non-desktop environment retains the browser directory picker behavior', async t => {
  const previous = Object.getOwnPropertyDescriptor(globalThis, 'window');
  t.after(() => previous ? Object.defineProperty(globalThis, 'window', previous) : delete globalThis.window);
  Object.defineProperty(globalThis, 'window', { configurable: true, value: {
    nitrobisonDesktop: { isDesktop: false, chooseDirectory: () => { throw new Error('Inactive native picker must not run'); } },
    showDirectoryPicker: async () => ({ name: 'Browser Notes' }),
  } });
  assert.equal(await chooseDirectory(), 'Browser Notes');
});

test('new folder destinations keep note files inside the named child, not the chosen parent', async t => {
  const root = await temporaryDirectory(t);
  const { createFolderDirectory } = await import('../desktop/files.js');
  await fs.writeFile(path.join(root, 'keep.txt'), 'existing parent file');
  const destination = await createFolderDirectory(root, 'path');
  assert.equal(destination, path.join(await fs.realpath(root), 'path'));
  await fs.writeFile(path.join(destination, 'Proof.md'), '# Child note\n');
  assert.equal(await fs.readFile(path.join(root, 'path', 'Proof.md'), 'utf8'), '# Child note\n');
  assert.equal(await fs.readFile(path.join(root, 'keep.txt'), 'utf8'), 'existing parent file');
  await assert.rejects(fs.stat(path.join(root, 'Proof.md')), { code: 'ENOENT' });
});

test('default native folders create nested Markdown storage under app data', async t => {
  const profile = await temporaryDirectory(t);
  const { createFolderDirectory } = await import('../desktop/files.js');
  const destination = await createFolderDirectory(null, 'Garden/Ideas', profile);
  assert.equal(destination, path.join(await fs.realpath(profile), 'Markdown', 'Garden', 'Ideas'));
  await exportMarkdown(snapshot([note()], []), destination);
  assert.equal(await fs.readFile(path.join(profile, 'Markdown', 'Garden', 'Ideas', 'Welcome.md'), 'utf8'), '# Hello 🐄\n');
  await assert.rejects(fs.stat(path.join(profile, 'Welcome.md')), { code: 'ENOENT' });
});

test('default native folders reject traversal before creating app-data storage', async t => {
  const profile = await temporaryDirectory(t);
  const { createFolderDirectory } = await import('../desktop/files.js');
  await assert.rejects(createFolderDirectory(null, '../Escaped', profile), /folder path/i);
  assert.deepEqual(await fs.readdir(profile), []);
});

test('default native folders reject an app-data Markdown junction', async t => {
  const profile = await temporaryDirectory(t);
  const outside = await temporaryDirectory(t);
  if (!await directoryLink(t, outside, path.join(profile, 'Markdown'))) return;
  const { createFolderDirectory } = await import('../desktop/files.js');
  await assert.rejects(createFolderDirectory(null, 'Ideas', profile), /link|conflict/i);
  assert.deepEqual(await fs.readdir(outside), []);
});
