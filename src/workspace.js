import { EMPTY_VAULT, mergeSnapshots, validatePath, validateSnapshot } from './core.js';
import { updateFolderPreferences, renameFolderPreferences } from './folder-preferences.js';
import { createStarterSnapshot } from './starter.js';
import { withProperties } from './collections.js';

const clone = value => structuredClone(value);
const timestamp = () => Date.now();
const preferencesKey = key => `folder-preferences:${key}`;
const REGISTRY_KEY = 'workspace-registry';
const DEFAULT_WORKSPACE = { id: 'personal', name: 'Personal workspace' };
function validateWorkspaceName(name) {
  const trimmed = typeof name === 'string' ? name.trim() : '';
  if (!trimmed || trimmed.length > 80 || /[\x00-\x1f\x7f]/.test(trimmed)) throw new Error('Workspace name must be 1–80 characters.');
  return trimmed;
}
function normalizeRegistry(raw) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.workspaces)) return { active: 'personal', workspaces: [{ ...DEFAULT_WORKSPACE }] };
  const seen = new Set();
  const workspaces = [];
  for (const item of raw.workspaces) {
    if (!item || typeof item.id !== 'string' || seen.has(item.id) || (item.id !== 'personal' && !/^workspace:[0-9a-f-]{8,64}$/i.test(item.id))) continue;
    try {
      seen.add(item.id);
      workspaces.push({ id: item.id, name: validateWorkspaceName(item.name) });
    } catch { /* Ignore malformed entry. */ }
  }
  if (!seen.has('personal')) workspaces.unshift({ ...DEFAULT_WORKSPACE });
  const active = seen.has(raw.active) ? raw.active : 'personal';
  return { active, workspaces };
}

async function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('herd-workspaces', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('vaults');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error(`Local storage unavailable: ${request.error?.message}. Notes were not saved.`));
  });
}

function stored(db, key) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('vaults', 'readonly');
    const request = tx.objectStore('vaults').get(key);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storedFolderPreferences(db, key) {
  const value = await stored(db, preferencesKey(key));
  if (value === undefined) return {};
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Stored folder preferences are invalid.');
  let preferences = {};
  for (const [folder, patch] of Object.entries(value)) preferences = updateFolderPreferences(preferences, folder, patch);
  return preferences;
}

function writeRecord(db, entries) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction('vaults', 'readwrite');
    for (const [key, value] of entries) tx.objectStore('vaults').put(value, key);
    tx.oncomplete = () => resolve();
    tx.onabort = tx.onerror = () => reject(new Error(`Could not save your notes: ${tx.error?.message || 'storage is full or unavailable'}. Keep this window open and export a backup.`));
  });
}


export async function openWorkspace(requestedId) {
  const db = await openDatabase();
  const listeners = new Set();
  let registry = normalizeRegistry(await stored(db, REGISTRY_KEY));
  let key = requestedId && registry.workspaces.some(item => item.id === requestedId) ? requestedId : registry.active;
  let record;
  let folderPreferences = {};
  const loadVault = async targetKey => {
    const initialize = async () => {
      record = await stored(db, targetKey);
      if (record === undefined) {
        const snapshot = targetKey === 'personal' ? validateSnapshot(createStarterSnapshot()) : clone(EMPTY_VAULT);
        record = { snapshot, base: clone(EMPTY_VAULT), revision: 0, dirty: false };
        await writeRecord(db, [[targetKey, record]]);
      }
    };
    if (navigator.locks) await navigator.locks.request(`herd-write:${targetKey}`, initialize);
    else await initialize();
    folderPreferences = await storedFolderPreferences(db, targetKey);
  };
  await loadVault(key);
  let status = 'Saved on this device';
  let queue = Promise.resolve();
  const cloudBases = new WeakMap();
  const emit = () => listeners.forEach(fn => fn());
  const enqueue = action => {
    const result = queue.then(action);
    queue = result.catch(() => {});
    return result;
  };
  const publish = async (next, changePreferences, changeSnapshot) => {
    const commit = async () => {
      const latest = await stored(db, key);
      let result;
      if (changeSnapshot) {
        next = clone(latest || record);
        result = changeSnapshot(next.snapshot);
        next.snapshot = validateSnapshot(next.snapshot);
        next.dirty = true;
      } else if (latest && JSON.stringify(latest.snapshot) !== JSON.stringify(record.snapshot)) {
        const merged = mergeSnapshots(record.snapshot, next.snapshot, latest.snapshot);
        const concurrentChanges = JSON.stringify(merged) !== JSON.stringify(next.snapshot);
        next = { ...next, snapshot: merged, dirty: next.dirty || concurrentChanges };
        if (latest.revision > next.revision) { next.revision = latest.revision; next.base = latest.base; }
      }
      const nextPreferences = changePreferences ? changePreferences(await storedFolderPreferences(db, key)) : undefined;
      await writeRecord(db, [[key, next], ...(nextPreferences === undefined ? [] : [[preferencesKey(key), nextPreferences]])]);
      record = next;
      if (nextPreferences !== undefined) folderPreferences = nextPreferences;
      status = 'Saved on this device';
      emit();
      return result;
    };
    if (navigator.locks) return navigator.locks.request(`herd-write:${key}`, commit);
    return commit();
  };
  const mutate = (action, changePreferences, latest = false) => {
    if (latest) return enqueue(() => publish(undefined, changePreferences, action));
    return enqueue(async () => {
      const next = clone(record);
      const result = action(next.snapshot);
      next.snapshot = validateSnapshot(next.snapshot);
      next.dirty = true;
      await publish(next, changePreferences);
      return result;
    });
  };
  const workspace = {
    get id() { return key; },
    get name() { return registry.workspaces.find(item => item.id === key)?.name || DEFAULT_WORKSPACE.name; },
    get workspaces() { return clone(registry.workspaces); },
    get snapshot() { return clone(record.snapshot); },
    get folderPreferences() { return clone(folderPreferences); },
    get status() { return status; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async saveFolderPreferences(folder, patch) {
      updateFolderPreferences(folderPreferences, folder, patch);
      const capturedPatch = clone(patch);
      return enqueue(async () => {
        const commit = async () => {
          const next = updateFolderPreferences(await storedFolderPreferences(db, key), folder, capturedPatch);
          await writeRecord(db, [[preferencesKey(key), next]]);
          folderPreferences = next; emit();
        };
        if (navigator.locks) await navigator.locks.request(`herd-write:${key}`, commit);
        else await commit();
      });
    },
    saveNote(note) {
      return mutate(snapshot => {
        const saved = { ...note, id: note.id || crypto.randomUUID(), updatedAt: timestamp() };
        if (snapshot.notes.some(other => other.id !== saved.id && !other.deleted && other.folder === saved.folder && other.title.toLocaleLowerCase() === saved.title.toLocaleLowerCase())) throw new Error('A note with that title already exists in this folder.');
        const index = snapshot.notes.findIndex(other => other.id === saved.id);
        if (index < 0) snapshot.notes.push(saved); else snapshot.notes[index] = saved;
        return saved;
      });
    },
    updateNoteProperties(id, expectedContent, patch) {
      const capturedPatch = clone(patch);
      return mutate(snapshot => {
        const note = snapshot.notes.find(item => item.id === id);
        if (!note || note.deleted) throw new Error('This note was deleted or is no longer available. Its properties were not changed.');
        if (note.content !== expectedContent) throw new Error('This note changed while you were editing its properties. Reopen Properties and try again; your source is unchanged.');
        note.content = withProperties(note.content, capturedPatch);
        note.updatedAt = timestamp();
        return note;
      }, undefined, true);
    },
    applyAIRevision(id, expectedContent, content) {
      return mutate(snapshot => {
        const note = snapshot.notes.find(item => item.id === id);
        if (!note || note.deleted) throw new Error('This note was deleted or is no longer available. The AI revision was not applied.');
        if (note.content !== expectedContent) throw new Error('This note changed after generation. The AI revision was not applied.');
        note.content = content;
        note.updatedAt = timestamp();
        return note;
      }, undefined, true);
    },
    deleteNote(id) {
      return mutate(snapshot => {
        const note = snapshot.notes.find(item => item.id === id);
        if (note) { note.deleted = true; note.updatedAt = timestamp(); }
      });
    },
    addFolder(path) {
      return mutate(snapshot => { validatePath(path, false); if (!snapshot.folders.includes(path)) snapshot.folders.push(path); });
    },
    renameFolder(oldPath, newPath) {
      return mutate(snapshot => {
        validatePath(oldPath, false); validatePath(newPath, false);
        if (newPath.startsWith(`${oldPath}/`)) throw new Error('A folder cannot be moved inside itself.');
        if (newPath !== oldPath && snapshot.folders.includes(newPath)) throw new Error('That folder already exists.');
        const move = path => path === oldPath || path.startsWith(`${oldPath}/`) ? newPath + path.slice(oldPath.length) : path;
        snapshot.folders = snapshot.folders.map(move);
        for (const note of snapshot.notes) if (move(note.folder) !== note.folder) { note.folder = move(note.folder); note.updatedAt = timestamp(); }
      }, current => renameFolderPreferences(current, oldPath, newPath));
    },
    deleteFolder(path) {
      const contains = folder => folder === path || folder.startsWith(`${path}/`);
      return mutate(snapshot => {
        validatePath(path, false);
        const updatedAt = timestamp();
        for (const note of snapshot.notes) {
          if (!note.deleted && contains(note.folder)) { note.deleted = true; note.updatedAt = updatedAt; }
        }
        snapshot.folders = snapshot.folders.filter(folder => !contains(folder));
      }, current => {
        const next = { ...current };
        for (const folder of Object.keys(next)) if (contains(folder)) delete next[folder];
        return next;
      }, true);
    },
    importNotes(notes, folders = []) {
      return mutate(snapshot => {
        for (const note of notes) {
          let title = note.title;
          let number = 1;
          while (snapshot.notes.some(existing => !existing.deleted && existing.folder === (note.folder || '') && existing.title.toLocaleLowerCase() === title.toLocaleLowerCase())) title = `${note.title.slice(0, 170)} (import ${number++})`;
          snapshot.notes.push({ ...note, id: crypto.randomUUID(), title, folder: note.folder || '', updatedAt: timestamp(), deleted: false });
        }
        snapshot.folders.push(...folders);
        return notes.length;
      });
    },
    replaceSnapshot(snapshot) {
      return enqueue(async () => {
        const valid = validateSnapshot(snapshot);
        await writeRecord(db, [[`${key}:recovery`, clone(record)]]);
        // Missing restored notes become tombstones, so old cloud copies cannot reappear.
        const ids = new Set(valid.notes.map(note => note.id));
        valid.notes.push(...record.snapshot.notes.filter(note => !ids.has(note.id)).map(note => ({ ...note, deleted: true, updatedAt: timestamp() })));
        await publish({ ...record, snapshot: validateSnapshot(valid), dirty: true });
      });
    },
    async exportSnapshot() { await queue; return clone(record.snapshot); },
    async waitForWrites() { await queue; },
    async listWorkspaceSnapshots() {
      await queue;
      const latestRegistry = normalizeRegistry(await stored(db, REGISTRY_KEY));
      return Promise.all(latestRegistry.workspaces.map(async item => {
        const entry = item.id === key ? record : await stored(db, item.id);
        return { id: item.id, name: item.name, active: item.id === key, snapshot: entry?.snapshot ? clone(entry.snapshot) : clone(EMPTY_VAULT) };
      }));
    },
    switchWorkspace(id) {
      return enqueue(async () => {
        const latestRegistry = normalizeRegistry(await stored(db, REGISTRY_KEY));
        if (!latestRegistry.workspaces.some(item => item.id === id)) throw new Error('That workspace could not be found.');
        await loadVault(id);
        key = id;
        registry = { ...latestRegistry, active: id };
        await writeRecord(db, [[REGISTRY_KEY, registry]]);
        status = 'Saved on this device';
        emit();
      });
    },
    createWorkspace(name) {
      return enqueue(async () => {
        const trimmed = validateWorkspaceName(name);
        const latestRegistry = normalizeRegistry(await stored(db, REGISTRY_KEY));
        if (latestRegistry.workspaces.some(item => item.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) throw new Error('A workspace with that name already exists.');
        const created = { id: `workspace:${crypto.randomUUID()}`, name: trimmed };
        const emptyRecord = { snapshot: clone(EMPTY_VAULT), base: clone(EMPTY_VAULT), revision: 0, dirty: false };
        const nextRegistry = { active: created.id, workspaces: [...latestRegistry.workspaces, created] };
        await writeRecord(db, [[created.id, emptyRecord], [REGISTRY_KEY, nextRegistry]]);
        key = created.id;
        record = emptyRecord;
        folderPreferences = {};
        registry = nextRegistry;
        status = 'Saved on this device';
        emit();
        return clone(created);
      });
    },
    renameWorkspace(id, name) {
      return enqueue(async () => {
        const trimmed = validateWorkspaceName(name);
        const latestRegistry = normalizeRegistry(await stored(db, REGISTRY_KEY));
        if (!latestRegistry.workspaces.some(item => item.id === id)) throw new Error('That workspace could not be found.');
        if (latestRegistry.workspaces.some(item => item.id !== id && item.name.toLocaleLowerCase() === trimmed.toLocaleLowerCase())) throw new Error('A workspace with that name already exists.');
        registry = { ...latestRegistry, workspaces: latestRegistry.workspaces.map(item => item.id === id ? { ...item, name: trimmed } : item) };
        await writeRecord(db, [[REGISTRY_KEY, registry]]);
        emit();
      });
    },
    syncCloud(connection) {
      return enqueue(async () => {
        status = `Syncing ${connection.name}…`; emit();
        try {
          const remote = await connection.load();
          const base = cloudBases.get(connection) || EMPTY_VAULT;
          const remoteSnapshot = remote ? validateSnapshot(remote.snapshot) : EMPTY_VAULT;
          const merged = remote ? mergeSnapshots(base, record.snapshot, remoteSnapshot) : clone(record.snapshot);
          await writeRecord(db, [[`${key}:recovery`, clone(record)]]);
          await publish({ ...record, snapshot: merged, dirty: true });
          // A pull-only or failed upload must keep the actual remote state as its merge base.
          cloudBases.set(connection, clone(remoteSnapshot));
          if (connection.readOnly) {
            status = `${connection.name} refreshed · read-only cloud access · local notes retained`; emit();
            return;
          }
          await connection.save(merged, remote?.revision || null);
          cloudBases.set(connection, clone(merged));
          status = `${connection.name} synced · saved on this device`; emit();
        } catch (error) { status = `${error.message} Local notes retained.`; emit(); throw error; }
      });
    },
  };
  return workspace;
}
