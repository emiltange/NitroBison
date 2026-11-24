import { extractNoteTargets, resolveNoteLink } from './markdown-model.js';

export const EMPTY_VAULT = { notes: [], folders: [] };

export function validatePath(path, allowEmpty = true) {
  if (typeof path !== 'string' || path.length > 500 || (!allowEmpty && !path) || (path && path.split('/').some(part => !part.trim() || part === '.' || part === '..' || /[\\<>:"|?*\x00-\x1f]/.test(part) || /[. ]$/.test(part)))) {
    throw new Error('Use a folder path without empty segments, reserved characters, or “..”.');
  }
  return path;
}

export function validateSnapshot(value) {
  if (!value || !Array.isArray(value.notes) || !Array.isArray(value.folders) || value.notes.length > 20000 || value.folders.length > 5000) throw new Error('Invalid vault: expected notes and folders within the supported limits.');
  const ids = new Set();
  const notes = value.notes.map(note => {
    if (!note || typeof note.id !== 'string' || !note.id || note.id.length > 200 || ids.has(note.id)) throw new Error('Every note needs a unique identifier.');
    ids.add(note.id);
    if (typeof note.title !== 'string' || !note.title.trim() || note.title.length > 200 || note.title.includes('/')) throw new Error('Note titles must be 1–200 characters without path separators.');
    validatePath(note.title, false);
    validatePath(note.folder);
    if (typeof note.content !== 'string' || note.content.length > 2000000 || !Number.isSafeInteger(note.updatedAt) || note.updatedAt < 0 || (note.deleted !== undefined && typeof note.deleted !== 'boolean')) throw new Error('Invalid note content, timestamp, or deletion marker.');
    return { id: note.id, title: note.title, folder: note.folder, content: note.content, updatedAt: note.updatedAt, ...(note.deleted ? { deleted: true } : {}) };
  });
  const folders = new Set(value.folders.map(folder => validatePath(folder, false)));
  for (const note of notes) {
    if (note.deleted) continue;
    const parts = note.folder.split('/').filter(Boolean);
    for (let i = 1; i <= parts.length; i++) folders.add(parts.slice(0, i).join('/'));
  }
  return { notes, folders: [...folders].sort((a, b) => a.localeCompare(b)) };
}

export function noteLabel(note) {
  return `${note.folder ? `${note.folder}/` : ''}${note.title}`;
}

const sameNote = (a, b) => a === b || (!!a && !!b && a.title === b.title && a.folder === b.folder && a.content === b.content && !!a.deleted === !!b.deleted);

export function mergeSnapshots(base, local, remote) {
  const original = new Map(base.notes.map(note => [note.id, note]));
  const ours = new Map(local.notes.map(note => [note.id, note]));
  const theirs = new Map(remote.notes.map(note => [note.id, note]));
  const notes = [];
  for (const id of new Set([...original.keys(), ...ours.keys(), ...theirs.keys()])) {
    const before = original.get(id), left = ours.get(id), right = theirs.get(id);
    if (sameNote(left, right) || sameNote(right, before)) {
      if (left) notes.push(left);
    } else if (sameNote(left, before)) {
      if (right) notes.push(right);
    } else {
      if (right) notes.push(right);
      if (left && !left.deleted) {
        const title = `${left.title.slice(0, 189)} (conflict)`;
        notes.push({ ...left, id: crypto.randomUUID(), title, updatedAt: Date.now() });
      }
    }
  }
  const folders = [...new Set([...local.folders, ...remote.folders])].filter(folder => !base.folders.includes(folder) || (local.folders.includes(folder) && remote.folders.includes(folder)));
  return validateSnapshot({ notes, folders });
}

export function linksFor(note, notes) {
  return [...new Set(extractNoteTargets(note.content).map(target => resolveNoteLink(target, notes, note)?.id).filter(Boolean))];
}
