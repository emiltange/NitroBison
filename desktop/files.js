import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { validatePath, validateSnapshot } from '../src/core.js';
import { pathRegistry } from '../src/markdown-paths.js';
import { localDirectoryPath } from '../src/directory.js';

const pathKey = value => value.normalize('NFC').toLowerCase();
const parentPath = value => value.includes('/') ? value.slice(0, value.lastIndexOf('/')) : '';
const sameEntry = (left, right) => left.dev === right.dev && left.ino === right.ino;
const conflict = (relative, reason) => new Error(`Export conflict: ${relative || 'selected directory'} ${reason}. Existing files were not overwritten.`);

async function existingStat(target) {
  try { return await fs.lstat(target); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

export async function directoryAccess(rootPath) {
  localDirectoryPath(rootPath);
  if (!path.isAbsolute(rootPath) || (process.platform === 'win32' && !/^[a-z]:[\\/]/i.test(rootPath))) throw new Error('Choose an existing absolute local directory.');
  const selected = await existingStat(rootPath);
  if (!selected || selected.isSymbolicLink() || !selected.isDirectory()) throw new Error('The selected directory must be an existing directory, not a link.');
  const root = await fs.realpath(rootPath);
  localDirectoryPath(root);
  const rootStat = await fs.lstat(root);
  if (!sameEntry(selected, rootStat)) throw new Error('The selected directory changed. Choose it again.');
  const contained = (target, relative) => {
    const fromRoot = path.relative(root, target);
    if (!fromRoot || fromRoot === '..' || fromRoot.startsWith(`..${path.sep}`) || path.isAbsolute(fromRoot)) {
      throw conflict(relative, 'does not remain inside the selected directory');
    }
  };
  const assertDirectory = async relative => {
    const currentRoot = await existingStat(root);
    if (!currentRoot || currentRoot.isSymbolicLink() || !currentRoot.isDirectory() || !sameEntry(rootStat, currentRoot)
      || path.relative(root, await fs.realpath(root)) !== '') {
      throw conflict('', 'changed or became a link');
    }
    let target = root;
    for (const part of relative.split('/').filter(Boolean)) {
      target = path.join(target, part);
      const entry = await existingStat(target);
      if (!entry || entry.isSymbolicLink() || !entry.isDirectory()) throw conflict(relative, 'is missing, is a link, or is not a directory');
      contained(await fs.realpath(target), relative);
    }
    return target;
  };
  const inspect = async (relative, kind) => {
    const parent = parentPath(relative);
    const directory = await assertDirectory(parent);
    const name = relative.slice(parent ? parent.length + 1 : 0);
    const matches = (await fs.readdir(directory)).filter(entry => pathKey(entry) === pathKey(name));
    if (matches.some(entry => entry !== name) || matches.length > 1) throw conflict(relative, 'has a case or Unicode filename collision');
    const target = path.join(directory, name);
    const entry = await existingStat(target);
    if (!entry) return null;
    if (entry.isSymbolicLink()) throw conflict(relative, 'is a symbolic link or junction');
    if (kind === 'directory' ? !entry.isDirectory() : !entry.isFile()) throw conflict(relative, `is not a ${kind}`);
    contained(await fs.realpath(target), relative);
    await assertDirectory(parent);
    const checked = await existingStat(target);
    if (!checked || checked.isSymbolicLink() || !sameEntry(entry, checked)) throw conflict(relative, 'changed during inspection');
    return { target, stat: checked };
  };
  return { root, identity: { dev: rootStat.dev, ino: rootStat.ino }, assertDirectory, inspect };
}

export async function createFolderDirectory(rootPath, folder, userDataPath) {
  if (rootPath === null) {
    validatePath(folder, false);
    rootPath = await createFolderDirectory(userDataPath, 'Markdown');
  }
  const access = await directoryAccess(rootPath);
  await exportMarkdown({ notes: [], folders: [folder] }, access.root);
  return access.assertDirectory(folder);
}

export async function exportMarkdown(value, rootPath) {
  const snapshot = validateSnapshot(value);
  const register = pathRegistry();
  const directories = new Set();
  for (const folder of snapshot.folders) {
    register(folder, 'folder');
    const parts = folder.split('/');
    for (let i = 1; i <= parts.length; i++) directories.add(parts.slice(0, i).join('/'));
  }
  const notes = snapshot.notes.filter(note => !note.deleted);
  const files = notes.map(note => {
    const relative = `${note.folder ? `${note.folder}/` : ''}${note.title}.md`;
    register(relative, 'file');
    return { relative, note };
  });
  const { assertDirectory, inspect } = await directoryAccess(rootPath);

  const orderedDirectories = [...directories].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
  const present = new Map([['', true]]);
  // Preflight every target, including empty folders, before creating anything.
  for (const relative of orderedDirectories) {
    present.set(relative, present.get(parentPath(relative)) ? !!await inspect(relative, 'directory') : false);
  }
  const pending = [];
  for (const file of files) {
    const existing = present.get(file.note.folder) ? await inspect(file.relative, 'file') : null;
    if (!existing) { pending.push(file); continue; }
    const expected = Buffer.from(file.note.content, 'utf8');
    if (existing.stat.size !== expected.length) throw conflict(file.relative, 'already exists with different content');
    const handle = await fs.open(existing.target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const current = await inspect(file.relative, 'file');
      const opened = await handle.stat();
      if (!current || !opened.isFile() || !sameEntry(current.stat, opened)) throw conflict(file.relative, 'changed during inspection');
      if (!(await handle.readFile()).equals(expected)) throw conflict(file.relative, 'already exists with different content');
    } finally { await handle.close(); }
  }

  // Node's path APIs cannot eliminate concurrent ancestor-directory replacement races.
  // Preflight is not a cross-file transaction; a later I/O failure can leave new entries.
  for (const relative of orderedDirectories) {
    if (await inspect(relative, 'directory')) continue;
    const directory = await assertDirectory(parentPath(relative));
    try { await fs.mkdir(path.join(directory, relative.slice(parentPath(relative) ? parentPath(relative).length + 1 : 0)), { mode: 0o700 }); }
    catch (error) { if (error.code !== 'EEXIST') throw error; }
    await assertDirectory(relative);
  }
  for (const { relative, note } of pending) {
    if (await inspect(relative, 'file')) throw conflict(relative, 'appeared during export');
    const directory = await assertDirectory(note.folder);
    let handle;
    try { handle = await fs.open(path.join(directory, `${note.title}.md`), 'wx', 0o600); }
    catch (error) { if (error.code === 'EEXIST') throw conflict(relative, 'appeared during export'); throw error; }
    try {
      const current = await inspect(relative, 'file');
      const opened = await handle.stat();
      if (!current || !opened.isFile() || !sameEntry(current.stat, opened)) throw conflict(relative, 'changed before writing');
      await handle.writeFile(note.content, 'utf8');
    } finally { await handle.close(); }
  }
  return notes.length;
}
