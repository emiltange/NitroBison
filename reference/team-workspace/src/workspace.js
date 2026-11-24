import { sampleVault } from './examples.js';
import { EMPTY_VAULT, mergeSnapshots, validatePath, validateSnapshot } from './core.js';
import { updateFolderPreferences, renameFolderPreferences } from './folder-preferences.js';

const clone = value => structuredClone(value);
const timestamp = () => Date.now();
const preferencesKey = key => `folder-preferences:${key}`;

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

async function api(path, body, method = body === undefined ? 'GET' : 'POST') {
  const response = await fetch(`/api/${path}`, {
    method, credentials: 'same-origin', cache: 'no-store',
    ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
  });
  let value;
  try { value = await response.json(); } catch { throw new Error('Collaboration server unavailable. Personal notes still work offline.'); }
  if (!response.ok) {
    const error = new Error(value.error || `Server returned ${response.status}.`);
    error.status = response.status;
    error.workspace = value.workspace;
    throw error;
  }
  return value;
}

export async function openWorkspace() {
  const db = await openDatabase();
  const listeners = new Set();
  let key = 'personal';
  let record = await stored(db, key);
  if (!record) {
    record = { snapshot: validateSnapshot(sampleVault), base: clone(EMPTY_VAULT), revision: 0, dirty: false };
    await writeRecord(db, [[key, record]]);
  }
  let folderPreferences = await storedFolderPreferences(db, key);
  let status = 'Saved on this device';
  let user = null;
  let workspaceName = 'Personal vault';
  let queue = Promise.resolve();
  let syncing = false;
  const cloudBases = new WeakMap();
  const emit = () => listeners.forEach(fn => fn());
  const enqueue = action => {
    const result = queue.then(action);
    queue = result.catch(() => {});
    return result;
  };
  const publish = async (next, changePreferences) => {
    const commit = async () => {
      const latest = await stored(db, key);
      if (latest && JSON.stringify(latest.snapshot) !== JSON.stringify(record.snapshot)) {
        const merged = mergeSnapshots(record.snapshot, next.snapshot, latest.snapshot);
        const concurrentChanges = JSON.stringify(merged) !== JSON.stringify(next.snapshot);
        next = { ...next, snapshot: merged, dirty: next.dirty || concurrentChanges };
        if (latest.revision > next.revision) { next.revision = latest.revision; next.base = latest.base; }
      }
      const nextPreferences = changePreferences ? changePreferences(await storedFolderPreferences(db, key)) : undefined;
      await writeRecord(db, [[key, next], ...(nextPreferences === undefined ? [] : [[preferencesKey(key), nextPreferences]])]);
      record = next;
      if (nextPreferences !== undefined) folderPreferences = nextPreferences;
      status = key === 'personal' ? 'Saved on this device' : (next.dirty ? 'Saved locally · sync pending' : 'Team vault synced');
      emit();
    };
    if (navigator.locks) await navigator.locks.request(`herd-write:${key}`, commit);
    else await commit();
  };
  const writable = () => {
    if (user?.role === 'viewer' && key !== 'personal') throw new Error('This invitation grants read-only access. Switch to your personal vault to edit.');
  };
  const mutate = (action, changePreferences) => {
    const targetKey = key;
    return enqueue(async () => {
      if (key !== targetKey) throw new Error('The active vault changed. Return to the original vault before editing its notes.');
      writable();
      const next = clone(record);
      const result = action(next.snapshot);
      next.snapshot = validateSnapshot(next.snapshot);
      next.dirty = true;
      await publish(next, changePreferences);
      return result;
    });
  };
  const switchTeam = async result => {
    const remote = await api('workspace');
    const nextKey = `team:${result.user.id}`;
    const cached = await stored(db, nextKey);
    const snapshot = cached?.dirty ? mergeSnapshots(cached.base, cached.snapshot, remote) : validateSnapshot(remote);
    const next = { snapshot, base: validateSnapshot(remote), revision: remote.revision, dirty: !!cached?.dirty };
    const nextPreferences = await storedFolderPreferences(db, nextKey);
    await writeRecord(db, [[nextKey, next], ['active', { key: nextKey, user: result.user, workspaceName: result.workspaceName }]]);
    key = nextKey; record = next; folderPreferences = nextPreferences; user = result.user; workspaceName = result.workspaceName || 'Team vault';
    status = next.dirty ? 'Saved locally · sync pending' : 'Team vault synced';
    emit();
    return result;
  };
  const active = await stored(db, 'active');
  if (active?.key?.startsWith('team:')) {
    const cached = await stored(db, active.key);
    if (cached) {
      let session;
      try { session = await api('session'); } catch { session = undefined; }
      if (!session || session.user?.id === active.user.id) {
        const nextPreferences = await storedFolderPreferences(db, active.key);
        key = active.key; record = cached; folderPreferences = nextPreferences; user = active.user; workspaceName = active.workspaceName;
        status = 'Team vault cached locally · sync to check access';
      } else await writeRecord(db, [['active', null]]);
    }
  }
  const workspace = {
    get snapshot() { return clone(record.snapshot); },
    get folderPreferences() { return clone(folderPreferences); },
    get user() { return user; },
    get mode() { return key === 'personal' ? 'personal' : 'team'; },
    get workspaceName() { return workspaceName; },
    get status() { return status; },
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    async saveFolderPreferences(folder, patch) {
      const targetKey = key;
      updateFolderPreferences({}, folder, patch);
      const capturedPatch = clone(patch);
      return enqueue(async () => {
        const commit = async () => {
          const next = updateFolderPreferences(await storedFolderPreferences(db, targetKey), folder, capturedPatch);
          await writeRecord(db, [[preferencesKey(targetKey), next]]);
          if (key === targetKey) { folderPreferences = next; emit(); }
        };
        if (navigator.locks) await navigator.locks.request(`herd-write:${targetKey}`, commit);
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
      return mutate(snapshot => {
        validatePath(path, false);
        if (snapshot.notes.some(note => !note.deleted && (note.folder === path || note.folder.startsWith(`${path}/`))) || snapshot.folders.some(folder => folder.startsWith(`${path}/`))) throw new Error('Move or delete the contents before deleting this folder.');
        snapshot.folders = snapshot.folders.filter(folder => folder !== path);
      }, current => {
        const next = { ...current };
        delete next[path];
        return next;
      });
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
        writable();
        const valid = validateSnapshot(snapshot);
        await writeRecord(db, [[`${key}:recovery`, clone(record)]]);
        // Missing restored notes become tombstones, so old server copies cannot reappear.
        const ids = new Set(valid.notes.map(note => note.id));
        valid.notes.push(...record.snapshot.notes.filter(note => !ids.has(note.id)).map(note => ({ ...note, deleted: true, updatedAt: timestamp() })));
        await publish({ ...record, snapshot: validateSnapshot(valid), dirty: true });
      });
    },
    async exportSnapshot() { await queue; return clone(record.snapshot); },
    serverInfo() { return api('session'); },
    setup(body) { return enqueue(async () => switchTeam(await api('setup', body))); },
    login(body) { return enqueue(async () => switchTeam(await api('session', body))); },
    acceptInvite(body) { return enqueue(async () => switchTeam(await api('invites/accept', body))); },
    leaveTeam() {
      return enqueue(async () => {
        // A failed logout leaves team mode intact rather than claiming the cookie was cleared.
        await api('logout', {});
        const personal = await stored(db, 'personal');
        const nextPreferences = await storedFolderPreferences(db, 'personal');
        await writeRecord(db, [['active', null]]);
        key = 'personal'; record = personal; folderPreferences = nextPreferences; user = null; workspaceName = 'Personal vault'; status = 'Saved on this device'; emit();
      });
    },
    sync() {
      return enqueue(async () => {
        if (key === 'personal' || syncing) return;
        syncing = true; status = 'Syncing team vault…'; emit();
        try {
          const session = await api('session');
          if (session.user?.id !== user.id) throw new Error('Your team session expired. Sign in again; local changes remain saved.');
          user = session.user;
          let remote = await api('workspace');
          if (!record.dirty) {
            await publish({ snapshot: validateSnapshot(remote), base: validateSnapshot(remote), revision: remote.revision, dirty: false });
            return;
          }
          writable();
          const merged = mergeSnapshots(record.base, record.snapshot, remote);
          // Persist merged conflicts before uploading; another writer never destroys local edits.
          await publish({ snapshot: merged, base: validateSnapshot(remote), revision: remote.revision, dirty: true });
          let saved;
          try { saved = await api('workspace', { ...merged, revision: remote.revision }, 'PUT'); }
          catch (error) {
            if (error.status === 409 && error.workspace) {
              const latest = validateSnapshot(error.workspace);
              await publish({ snapshot: mergeSnapshots(record.base, record.snapshot, latest), base: latest, revision: error.workspace.revision, dirty: true });
              throw new Error('Someone saved during synchronization. Both versions are safe locally; sync again.');
            }
            throw error;
          }
          await publish({ snapshot: validateSnapshot(saved), base: validateSnapshot(saved), revision: saved.revision, dirty: false });
        } catch (error) { status = `${error.message} Local notes retained.`; emit(); throw error; }
        finally { syncing = false; }
      });
    },
    async invite(body) { const result = await api('invites', body); return { ...result, url: `${location.origin}/#invite=${encodeURIComponent(result.token)}` }; },
    async members() { return (await api('members')).members; },
    removeMember(id) { return api(`members/${encodeURIComponent(id)}`, {}, 'DELETE'); },
    syncCloud(connection) {
      return enqueue(async () => {
        if (key !== 'personal') throw new Error('Cloud sync is only available in your personal vault. Team notes are not sent to personal cloud storage.');
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
