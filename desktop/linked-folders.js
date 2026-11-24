import fs from 'node:fs/promises';
import { constants } from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { validateSnapshot } from '../src/core.js';
import { pathRegistry, portablePath } from '../src/markdown-paths.js';
import { directoryAccess } from './files.js';

const digest = value => createHash('sha256').update(value).digest('hex');
const parentPath = value => value.includes('/') ? value.slice(0, value.lastIndexOf('/')) : '';
const rootKey = value => process.platform === 'win32' ? value.normalize('NFC').toLowerCase() : value;
const matches = (folder, binding) => folder === binding || (!!binding && folder.startsWith(`${binding}/`));
const relativeFolder = (folder, binding) => binding ? folder.slice(binding.length).replace(/^\//, '') : folder;
const conflict = relative => new Error(`Linked-folder conflict: ${relative}. An unowned file or external change was preserved; the linked folder was not fully updated.`);
const run = promisify(execFile);

export function oneDriveRoots(env, registry = '') {
  const roots = [];
  if (env.OneDriveConsumer) roots.push({ directory: env.OneDriveConsumer, accountType: 'personal' });
  if (env.OneDriveCommercial) roots.push({ directory: env.OneDriveCommercial, accountType: 'business' });
  let accountType;
  for (const line of registry.split(/\r?\n/)) {
    if (/^HKEY_/i.test(line.trim())) {
      const account = /^HKEY_CURRENT_USER\\Software\\Microsoft\\OneDrive\\Accounts\\(Personal|Business\d+)$/i.exec(line.trim());
      accountType = account ? (/^Personal$/i.test(account[1]) ? 'personal' : 'business') : null;
    } else if (accountType) {
      const value = /^\s*UserFolder\s+REG_SZ\s+(.+?)\s*$/i.exec(line);
      if (value) roots.push({ directory: value[1], accountType });
    }
  }
  return roots;
}

let cachedRoots;

async function registeredRoots() {
  if (process.platform !== 'win32') return [];
  let registry = '';
  try {
    // Query only UserFolder: never read account tokens, identities, or arbitrary registry values.
    registry = (await run('reg.exe', ['query', 'HKCU\\Software\\Microsoft\\OneDrive\\Accounts', '/s', '/v', 'UserFolder'], { windowsHide: true, timeout: 5000, maxBuffer: 1024 * 1024 })).stdout;
  } catch { /* An absent/unavailable client registration is not proof of a provider. */ }
  return oneDriveRoots(process.env, registry);
}

async function directoryInfo(access, roots) {
  let affiliation;
  for (const candidate of roots) {
    let registered;
    try { registered = await directoryAccess(candidate.directory); }
    catch { continue; }
    const relative = path.relative(registered.root, access.root);
    if (relative === '..' || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) continue;
    if (!affiliation || registered.root.length > affiliation.root.length) {
      affiliation = { provider: 'onedrive', accountType: candidate.accountType, root: registered.root };
    } else if (registered.root === affiliation.root && candidate.accountType !== affiliation.accountType) {
      affiliation.accountType = 'unknown';
    }
  }
  return { directory: access.root, ...(affiliation || { provider: null, accountType: 'unknown' }) };
}

export async function inspectDirectory(directory, roots) {
  const access = await directoryAccess(directory);
  if (!roots) cachedRoots = registeredRoots();
  return directoryInfo(access, roots || await cachedRoots);
}

async function readJSON(file) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function atomicPrivate(file, content) {
  const temporary = `${file}.${randomUUID()}.tmp`;
  const handle = await fs.open(temporary, 'wx', 0o600);
  try { await handle.writeFile(content); await handle.sync(); }
  finally { await handle.close(); }
  await fs.rename(temporary, file);
}

function checkEntry(entry) {
  if (!entry || typeof entry.id !== 'string' || !entry.id || entry.id.length > 200
    || typeof entry.binding !== 'string' || !/^[a-f0-9]{64}$/.test(entry.hash)) throw new Error('Invalid private linked-folder ownership state.');
  if (entry.binding) portablePath(entry.binding);
  portablePath(entry.relative);
  return entry;
}

async function readFile(access, relative) {
  const entry = await access.inspect(relative, 'file');
  if (!entry) return null;
  // Owned Markdown is bounded by the snapshot's two-million-character content limit.
  if (entry.stat.size > 8000000) throw conflict(relative);
  const handle = await fs.open(entry.target, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.dev !== entry.stat.dev || opened.ino !== entry.stat.ino) throw conflict(relative);
    const content = await handle.readFile();
    const checked = await access.inspect(relative, 'file');
    if (!checked || checked.stat.dev !== opened.dev || checked.stat.ino !== opened.ino) throw conflict(relative);
    return { content, hash: digest(content), target: entry.target, identity: { dev: opened.dev, ino: opened.ino, birthtimeMs: opened.birthtimeMs } };
  } finally { await handle.close(); }
}

async function saveState(plan) {
  await atomicPrivate(path.join(plan.privateRoot, 'state.json'), JSON.stringify(plan.state));
}

function applyEntry(plan, journal) {
  const relative = (journal.after || journal.before).relative;
  plan.state.entries = plan.state.entries.filter(entry => entry.relative !== relative);
  if (journal.after) plan.state.entries.push(journal.after);
}

const sameIdentity = (left, right) => left && right && left.dev === right.dev && left.ino === right.ino && left.birthtimeMs === right.birthtimeMs;
const unsupportedLink = error => ['ENOTSUP', 'EOPNOTSUPP', 'ENOSYS', 'EXDEV', 'EPERM', 'EACCES', 'EINVAL'].includes(error.code);
const isPrefix = (partial, stage) => partial.content.length < stage.content.length && stage.content.subarray(0, partial.content.length).equals(partial.content);

async function saveJournal(plan, journal) {
  await atomicPrivate(path.join(plan.privateRoot, 'journal.json'), JSON.stringify(journal));
}

async function publishExclusive(plan, source, relative, journal) {
  const parent = parentPath(relative);
  await plan.access.assertDirectory(parent);
  const target = path.join(plan.access.root, relative);
  let linked = false;
  try { await fs.link(source.target, target); linked = true; }
  catch (error) { if (!unsupportedLink(error)) throw error; }
  if (linked) {
    const published = await readFile(plan.access, relative);
    if (!published || published.hash !== source.hash || !sameIdentity(source.identity, published.identity)) throw conflict(relative);
    return source.identity;
  }
  // Provider filesystems may lack hardlinks. Exclusive copying can be temporarily partial;
  // persist its identity before writing so recovery never truncates an unowned destination.
  const handle = await fs.open(target, 'wx', 0o600);
  try {
    const opened = await handle.stat();
    const identity = { dev: opened.dev, ino: opened.ino, birthtimeMs: opened.birthtimeMs };
    if (journal) {
      journal.publication = identity;
      await saveJournal(plan, journal);
    }
    const current = await plan.access.inspect(relative, 'file');
    if (!current || !sameIdentity(identity, current.stat)) throw conflict(relative);
    await handle.writeFile(source.content);
    await handle.sync();
    const published = await readFile(plan.access, relative);
    if (!published || published.hash !== source.hash || !sameIdentity(identity, published.identity)) throw conflict(relative);
    return identity;
  } finally { await handle.close(); }
}

async function recoverPartial(plan, journal, stage, current) {
  let partial = journal.partial ? await readFile(plan.access, journal.partial) : null;
  if (!partial && current && journal.publication && current.hash !== journal.after.hash && sameIdentity(current.identity, journal.publication)) {
    if (!stage || !isPrefix(current, stage)) throw conflict(journal.after.relative);
    journal.partial ||= journal.stage.replace(/\.next$/, '.partial');
    await saveJournal(plan, journal);
    await plan.access.assertDirectory(parentPath(journal.after.relative));
    await fs.rename(current.target, path.join(plan.access.root, journal.partial));
    partial = await readFile(plan.access, journal.partial);
    current = await plan.access.inspect(journal.after.relative, 'file');
  }
  if (!partial) return current;
  // Capture before removing: a racing external edit is preserved rather than retried over.
  if (!stage || !sameIdentity(partial.identity, journal.publication) || !isPrefix(partial, stage)) {
    if (!current) await publishExclusive(plan, partial, journal.after.relative);
    throw conflict(journal.partial);
  }
  if (current) throw conflict(journal.after.relative);
  await fs.mkdir(path.join(plan.privateRoot, 'recovery'), { recursive: true, mode: 0o700 });
  await atomicPrivate(path.join(plan.privateRoot, 'recovery', `${digest(journal.after.id)}.partial.md`), partial.content);
  const checked = await readFile(plan.access, journal.partial);
  if (!checked || checked.hash !== partial.hash || !sameIdentity(checked.identity, partial.identity)) throw conflict(journal.partial);
  await plan.access.assertDirectory(parentPath(journal.partial));
  await fs.unlink(checked.target);
  journal.publication = null;
  await saveJournal(plan, journal);
  return null;
}

async function recover(plan) {
  const journalPath = path.join(plan.privateRoot, 'journal.json');
  const journal = await readJSON(journalPath);
  if (!journal) return;
  if (journal.version !== 1 || journal.directory !== plan.access.root || (!journal.before && !journal.after)) throw new Error('Invalid private linked-folder journal.');
  const before = journal.before && checkEntry(journal.before);
  const after = journal.after && checkEntry(journal.after);
  const relative = (after || before).relative;
  if (before && after && before.relative !== after.relative) throw new Error('Invalid linked-folder journal path.');
  const parent = parentPath(relative);
  const expectedTemporary = /^\.nitrobison-[a-f0-9-]+\.(next|previous|partial)$/;
  for (const name of [journal.stage, journal.held, journal.partial].filter(Boolean)) {
    portablePath(name);
    if (parentPath(name) !== parent || !expectedTemporary.test(path.posix.basename(name))) throw new Error('Invalid linked-folder staging path.');
  }
  if (!!journal.stage !== !!after || !!journal.held !== !!before) throw new Error('Invalid linked-folder journal entries.');
  if (!plan.bindings.has((after || before).binding)) throw new Error('Pending linked-folder recovery belongs to a disabled binding. Re-enable its original folder binding to recover safely; existing files and recovery copies were left untouched.');
  const targetEntry = await plan.access.inspect(relative, 'file');
  if (targetEntry && !before) {
    const stagedEntry = journal.stage && await plan.access.inspect(journal.stage, 'file');
    const recorded = plan.state.entries.some(entry => entry.relative === relative && entry.id === after.id && entry.hash === after.hash);
    const copied = journal.publication && sameIdentity(journal.publication, targetEntry.stat);
    if (!recorded && !copied && (!stagedEntry || stagedEntry.stat.dev !== targetEntry.stat.dev || stagedEntry.stat.ino !== targetEntry.stat.ino)) throw conflict(relative);
  }
  let current = targetEntry ? await readFile(plan.access, relative) : null;
  let held = journal.held ? await readFile(plan.access, journal.held) : null;
  const stage = journal.stage ? await readFile(plan.access, journal.stage) : null;
  if (after) current = await recoverPartial(plan, journal, stage, current);
  const alreadyPublished = after ? current?.hash === after.hash : !current && !!held;
  if (!alreadyPublished) {
    if (after && (!stage || stage.hash !== after.hash)) {
      // A crash before staging completed did not touch the destination; retry from the snapshot.
      if (!held && (before ? current?.hash === before.hash : !current) && !stage) {
        await fs.unlink(journalPath);
        return;
      }
      throw conflict(relative);
    }
    if (before && !held) {
      if (!current || current.hash !== before.hash) throw conflict(relative);
      await plan.access.assertDirectory(parent);
      await fs.rename(current.target, path.join(plan.access.root, journal.held));
      held = await readFile(plan.access, journal.held);
      current = await plan.access.inspect(relative, 'file');
    }
    if (held && held.hash !== before.hash) {
      // The rename captures the actual preimage, including a writer racing our earlier hash check.
      if (!current) {
        await plan.access.assertDirectory(parent);
        await publishExclusive(plan, held, relative);
        const preserved = await readFile(plan.access, journal.held);
        if (!preserved || preserved.hash !== held.hash) throw conflict(journal.held);
        await fs.unlink(held.target);
      }
      throw conflict(relative);
    }
    if (current) throw conflict(relative);
  }
  if (held) {
    if (held.hash !== before.hash) throw conflict(relative);
    await fs.mkdir(path.join(plan.privateRoot, 'recovery'), { recursive: true, mode: 0o700 });
    await atomicPrivate(path.join(plan.privateRoot, 'recovery', `${digest(before.id)}.md`), held.content);
  }
  if (!alreadyPublished && after) {
    await plan.access.assertDirectory(parent);
    try { await publishExclusive(plan, stage, relative, journal); }
    catch (error) {
      if (held && !await plan.access.inspect(relative, 'file')) {
        await plan.access.assertDirectory(parent);
        let restoredIdentity;
        try { restoredIdentity = await publishExclusive(plan, held, relative); }
        catch (restoreError) { if (restoreError.code !== 'EEXIST') throw restoreError; }
        const restored = await plan.access.inspect(relative, 'file');
        const previous = await readFile(plan.access, journal.held);
        if (restored && restoredIdentity && sameIdentity(restored.stat, restoredIdentity) && previous?.hash === held.hash) await fs.unlink(held.target);
      }
      if (error.code === 'EEXIST') throw conflict(relative);
      throw error;
    }
  }
  applyEntry(plan, journal);
  await saveState(plan);
  for (const [temporary, expected] of [[journal.stage, after?.hash], [journal.held, before?.hash]]) {
    if (!temporary) continue;
    const file = await readFile(plan.access, temporary);
    if (!file) continue;
    if (file.hash !== expected) throw conflict(temporary);
    await plan.access.assertDirectory(parent);
    await fs.unlink(file.target);
  }
  await fs.unlink(journalPath);
}

async function changeFile(plan, before, after, content) {
  const relative = (after || before).relative;
  const parent = parentPath(relative);
  const prefix = `${parent ? `${parent}/` : ''}.nitrobison-${randomUUID()}`;
  const journal = { version: 1, directory: plan.access.root, before, after, stage: after ? `${prefix}.next` : null, held: before ? `${prefix}.previous` : null };
  await saveJournal(plan, journal);
  if (after) {
    const directory = await plan.access.assertDirectory(parent);
    const handle = await fs.open(path.join(directory, path.posix.basename(journal.stage)), 'wx', 0o600);
    try { await handle.writeFile(content, 'utf8'); await handle.sync(); }
    finally { await handle.close(); }
  }
  await recover(plan);
}

async function preflight(plan) {
  const ordered = [...plan.directories].sort((a, b) => a.split('/').length - b.split('/').length || a.localeCompare(b));
  const present = new Map([['', true]]);
  for (const relative of ordered) {
    present.set(relative, present.get(parentPath(relative)) ? !!await plan.access.inspect(relative, 'directory') : false);
  }
  const operations = [];
  const wanted = new Map(plan.files.map(file => [file.relative, file]));
  const owned = new Map(plan.state.entries.map(entry => [entry.relative, entry]));
  for (const entry of plan.state.entries) {
    if (!plan.bindings.has(entry.binding)) continue;
    const destination = plan.destinations.get(entry.id);
    // Disabling or switching a note's physical root is never a request to delete the old copy.
    if (destination && destination !== plan.access.root) continue;
    const desired = wanted.get(entry.relative);
    const current = present.get(parentPath(entry.relative)) === false ? null : await readFile(plan.access, entry.relative);
    if (current && current.hash !== entry.hash) throw conflict(entry.relative);
    if (!desired || desired.note.id !== entry.id) {
      operations.push({ before: entry, after: null, missing: !current });
    }
  }
  for (const file of plan.files) {
    const before = owned.get(file.relative);
    if (before && before.id !== file.note.id) throw conflict(file.relative);
    const existing = present.get(parentPath(file.relative)) ? await plan.access.inspect(file.relative, 'file') : null;
    if (existing && !before) throw conflict(file.relative);
    const current = existing ? await readFile(plan.access, file.relative) : null;
    if (current && current.hash !== before.hash) throw conflict(file.relative);
    const after = { id: file.note.id, binding: file.binding, relative: file.relative, hash: digest(file.note.content) };
    if (!current || current.hash !== after.hash) operations.unshift({ before: current ? before : null, after, content: file.note.content });
    else if (before.binding !== after.binding) operations.push({ before, after, ownershipOnly: true });
  }
  return { ordered, operations };
}

export async function syncLinkedFolders(value, bindings, userData) {
  const snapshot = validateSnapshot(value);
  if (!Array.isArray(bindings) || bindings.length > 5001) throw new Error('Invalid linked-folder bindings.');
  const registry = pathRegistry();
  for (const folder of snapshot.folders) registry(folder, 'folder');
  for (const note of snapshot.notes.filter(note => !note.deleted)) registry(`${note.folder ? `${note.folder}/` : ''}${note.title}.md`, 'file');
  const seen = new Set();
  for (const binding of bindings) {
    if (!binding || typeof binding !== 'object' || Array.isArray(binding) || Object.keys(binding).some(key => key !== 'folder' && key !== 'directory')
      || typeof binding.folder !== 'string' || seen.has(binding.folder)) throw new Error('Invalid or duplicate linked-folder binding.');
    if (binding.folder) portablePath(binding.folder);
    seen.add(binding.folder);
  }
  const roots = bindings.length ? await (cachedRoots ||= registeredRoots()) : [];
  const resolved = await Promise.all(bindings.map(async binding => {
    const access = await directoryAccess(binding.directory);
    return { ...binding, directory: access.root, access, info: await directoryInfo(access, roots), count: 0 };
  }));
  const deepest = [...resolved].sort((a, b) => b.folder.length - a.folder.length);
  const destination = folder => deepest.find(binding => matches(folder, binding.folder));
  const destinations = new Map();
  const plans = new Map();
  for (const binding of resolved) {
    let plan = plans.get(binding.directory);
    if (!plan) {
      const privateRoot = path.join(userData, 'linked-folders', digest(rootKey(binding.directory)));
      await fs.mkdir(privateRoot, { recursive: true, mode: 0o700 });
      const state = await readJSON(path.join(privateRoot, 'state.json')) || { version: 1, directory: binding.directory, identity: binding.access.identity, entries: [] };
      if (state.version !== 1 || state.directory !== binding.directory || !Array.isArray(state.entries)) throw new Error('Invalid private linked-folder ownership state.');
      if (state.identity?.dev !== binding.access.identity.dev || state.identity?.ino !== binding.access.identity.ino) throw new Error('The linked directory was replaced. Its existing files were left untouched; choose a different directory to save safely.');
      const paths = new Set();
      for (const entry of state.entries) {
        checkEntry(entry);
        if (paths.has(entry.relative)) throw new Error('Duplicate private linked-folder ownership path.');
        paths.add(entry.relative);
      }
      plan = { access: binding.access, privateRoot, state, files: [], directories: new Set(), bindings: new Set(), destinations, register: pathRegistry() };
      plans.set(binding.directory, plan);
    }
    plan.bindings.add(binding.folder);
  }
  for (const plan of plans.values()) await recover(plan);
  for (const note of snapshot.notes) {
    if (note.deleted) continue;
    const binding = destination(note.folder);
    if (!binding) continue;
    destinations.set(note.id, binding.directory);
    const plan = plans.get(binding.directory);
    const folder = relativeFolder(note.folder, binding.folder);
    const relative = `${folder ? `${folder}/` : ''}${note.title}.md`;
    plan.register(relative, 'file');
    plan.files.push({ relative, binding: binding.folder, note });
    binding.count++;
  }
  for (const folder of snapshot.folders) {
    const binding = destination(folder);
    if (!binding) continue;
    const plan = plans.get(binding.directory);
    const relative = relativeFolder(folder, binding.folder);
    if (!relative) continue;
    plan.register(relative, 'folder');
    const parts = relative.split('/');
    for (let i = 1; i <= parts.length; i++) plan.directories.add(parts.slice(0, i).join('/'));
  }
  // Preflight every active root before making any user-visible changes.
  for (const plan of plans.values()) plan.pending = await preflight(plan);
  for (const plan of plans.values()) {
    for (const relative of plan.pending.ordered) {
      if (await plan.access.inspect(relative, 'directory')) continue;
      const parent = await plan.access.assertDirectory(parentPath(relative));
      try { await fs.mkdir(path.join(parent, path.posix.basename(relative)), { mode: 0o700 }); }
      catch (error) { if (error.code !== 'EEXIST') throw error; }
      await plan.access.assertDirectory(relative);
    }
    for (const operation of plan.pending.operations) {
      if (operation.ownershipOnly) {
        const current = await readFile(plan.access, operation.after.relative);
        if (!current || current.hash !== operation.before.hash) throw conflict(operation.after.relative);
        applyEntry(plan, operation);
        await saveState(plan);
      } else if (operation.missing) {
        plan.state.entries = plan.state.entries.filter(entry => entry.relative !== operation.before.relative);
        await saveState(plan);
      } else {
        await changeFile(plan, operation.before, operation.after, operation.content);
      }
    }
  }
  // Node's path APIs cannot prevent another process replacing an ancestor between syscalls.
  // Exclusive publication and journaled, hash-checked preimages prevent blind overwrites.
  return resolved.map(binding => ({ folder: binding.folder, ...binding.info, fileCount: binding.count }));
}
