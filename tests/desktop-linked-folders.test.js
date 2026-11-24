import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { inspectDirectory, oneDriveRoots, syncLinkedFolders } from '../desktop/linked-folders.js';

const note = (overrides = {}) => ({ id: 'one', title: 'Welcome', folder: 'Work', content: '# Hello\n', updatedAt: 1, ...overrides });
const snapshot = (notes = [note()], folders = []) => ({ notes, folders });
async function fixture(t) {
  const base = await fs.mkdtemp(path.join(os.tmpdir(), 'nitrobison-linked-'));
  t.after(() => fs.rm(base, { recursive: true, force: true }));
  const root = path.join(base, 'notes');
  const profile = path.join(base, 'profile');
  await fs.mkdir(root);
  return { base, root, profile, bindings: [{ folder: 'Work', directory: root }] };
}

test('explicit linked folders write nested Markdown and empty folders without touching unrelated files', async t => {
  const { root, profile, bindings } = await fixture(t);
  await fs.writeFile(path.join(root, 'unrelated.txt'), 'keep');
  const result = await syncLinkedFolders(snapshot([note({ folder: 'Work/Nested' })], ['Work/Empty/Child']), bindings, profile);
  assert.equal(await fs.readFile(path.join(root, 'Nested/Welcome.md'), 'utf8'), '# Hello\n');
  assert.equal((await fs.stat(path.join(root, 'Empty/Child'))).isDirectory(), true);
  assert.equal(await fs.readFile(path.join(root, 'unrelated.txt'), 'utf8'), 'keep');
  assert.deepEqual(result, [{ folder: 'Work', directory: await fs.realpath(root), fileCount: 1, provider: null, accountType: 'unknown' }]);
});

test('durable ownership updates files after a module restart and keeps one latest preimage per note', async t => {
  const { root, profile, bindings } = await fixture(t);
  await syncLinkedFolders(snapshot(), bindings, profile);
  const restarted = await import(`../desktop/linked-folders.js?restart=${Date.now()}`);
  await restarted.syncLinkedFolders(snapshot([note({ content: 'second' })]), bindings, profile);
  await restarted.syncLinkedFolders(snapshot([note({ content: 'third' })]), bindings, profile);
  assert.equal(await fs.readFile(path.join(root, 'Welcome.md'), 'utf8'), 'third');
  const roots = await fs.readdir(path.join(profile, 'linked-folders'));
  const recovery = path.join(profile, 'linked-folders', roots[0], 'recovery');
  assert.equal((await fs.readdir(recovery)).length, 1);
  assert.equal(await fs.readFile(path.join(recovery, (await fs.readdir(recovery))[0]), 'utf8'), 'second');
});

test('first binding never takes over a different or identical unowned file', async t => {
  const { root, profile, bindings } = await fixture(t);
  const file = path.join(root, 'Welcome.md');
  for (const content of ['user document', '# Hello\n']) {
    await fs.writeFile(file, content);
    await assert.rejects(syncLinkedFolders(snapshot(), bindings, profile), /conflict|not owned/i);
    assert.equal(await fs.readFile(file, 'utf8'), content);
  }
});

test('external edits block updates, renames and deletion without losing the user file', async t => {
  const { root, profile, bindings } = await fixture(t);
  await syncLinkedFolders(snapshot(), bindings, profile);
  await fs.writeFile(path.join(root, 'Welcome.md'), 'edited outside NitroBison');
  for (const value of [snapshot([note({ content: 'new' })]), snapshot([note({ title: 'Renamed' })]), snapshot([])]) {
    await assert.rejects(syncLinkedFolders(value, bindings, profile), /conflict|changed|external/i);
    assert.equal(await fs.readFile(path.join(root, 'Welcome.md'), 'utf8'), 'edited outside NitroBison');
  }
  await assert.rejects(fs.stat(path.join(root, 'Renamed.md')), { code: 'ENOENT' });
});

test('renames and tombstones remove only unchanged owned files', async t => {
  const { root, profile, bindings } = await fixture(t);
  await fs.writeFile(path.join(root, 'unrelated.md'), 'user');
  await syncLinkedFolders(snapshot(), bindings, profile);
  await syncLinkedFolders(snapshot([note({ title: 'Renamed', folder: 'Work/Sub' })]), bindings, profile);
  await assert.rejects(fs.stat(path.join(root, 'Welcome.md')), { code: 'ENOENT' });
  assert.equal(await fs.readFile(path.join(root, 'Sub/Renamed.md'), 'utf8'), '# Hello\n');
  await syncLinkedFolders(snapshot([note({ title: 'Renamed', folder: 'Work/Sub', deleted: true })]), bindings, profile);
  await assert.rejects(fs.stat(path.join(root, 'Sub/Renamed.md')), { code: 'ENOENT' });
  assert.equal(await fs.readFile(path.join(root, 'unrelated.md'), 'utf8'), 'user');
});

test('disabled and switched physical or logical bindings leave previous files alone', async t => {
  const { base, root, profile, bindings } = await fixture(t);
  await syncLinkedFolders(snapshot(), bindings, profile);
  await syncLinkedFolders(snapshot([]), [], profile);
  const other = path.join(base, 'other');
  await fs.mkdir(other);
  await syncLinkedFolders(snapshot(), [{ folder: 'Work', directory: other }], profile);
  await syncLinkedFolders(snapshot([note({ id: 'two', folder: 'Other', title: 'Other' })]), [{ folder: 'Other', directory: root }], profile);
  assert.equal(await fs.readFile(path.join(root, 'Welcome.md'), 'utf8'), '# Hello\n');
  assert.equal(await fs.readFile(path.join(other, 'Welcome.md'), 'utf8'), '# Hello\n');
});

test('deepest binding wins while its nested relative paths remain intact', async t => {
  const { base, root, profile, bindings } = await fixture(t);
  const nested = path.join(base, 'nested');
  await fs.mkdir(nested);
  const result = await syncLinkedFolders(snapshot([
    note(), note({ id: 'two', title: 'Deep', folder: 'Work/Private/Sub' }),
  ], ['Work/Private/Empty']), [...bindings, { folder: 'Work/Private', directory: nested }], profile);
  assert.equal(await fs.readFile(path.join(root, 'Welcome.md'), 'utf8'), '# Hello\n');
  assert.equal(await fs.readFile(path.join(nested, 'Sub/Deep.md'), 'utf8'), '# Hello\n');
  await assert.rejects(fs.stat(path.join(root, 'Private')), { code: 'ENOENT' });
  assert.equal((await fs.stat(path.join(nested, 'Empty'))).isDirectory(), true);
  assert.deepEqual(result.map(item => item.fileCount), [1, 1]);
});

test('Unfiled binding exports only root notes and never includes named folders', async t => {
  const { root, profile } = await fixture(t);
  const result = await syncLinkedFolders(snapshot([note({ folder: '' }), note({ id: 'two', folder: 'Nested', title: 'Second' })], ['Empty']), [{ folder: '', directory: root }], profile);
  assert.equal(await fs.readFile(path.join(root, 'Welcome.md'), 'utf8'), '# Hello\n');
  assert.deepEqual(await fs.readdir(root), ['Welcome.md']);
  assert.equal(result[0].fileCount, 1);
});

test('directory errors and unsafe binding or snapshot paths reject before writes', async t => {
  const { base, root, profile, bindings } = await fixture(t);
  for (const [value, links] of [
    [snapshot(), [{ folder: 'Work', directory: path.join(base, 'missing') }]],
    [snapshot(), [{ folder: '../Work', directory: root }]],
    [snapshot([note({ title: '../outside' })]), bindings],
    [snapshot([note({ title: 'Welcome' }), note({ id: 'two', title: 'welcome' })]), bindings],
    [snapshot(), [...bindings, ...bindings]],
  ]) {
    await assert.rejects(syncLinkedFolders(value, links, profile));
    assert.deepEqual(await fs.readdir(root), []);
  }
});

test('directory inspection verifies existence rather than guessing providers from names', async t => {
  const { base, root } = await fixture(t);
  const named = path.join(root, 'OneDrive - Business Google Drive');
  await fs.mkdir(named);
  assert.deepEqual(await inspectDirectory(named, []), { directory: await fs.realpath(named), provider: null, accountType: 'unknown' });
  await assert.rejects(inspectDirectory(path.join(base, 'missing'), []));
  await fs.writeFile(path.join(root, 'file'), 'not a directory');
  await assert.rejects(inspectDirectory(path.join(root, 'file'), []), /directory/i);
});

test('registered provider roots identify contained directories only and prefer the deepest registration', async t => {
  const { root } = await fixture(t);
  const business = path.join(root, 'account');
  const directory = path.join(business, 'notes');
  await fs.mkdir(directory, { recursive: true });
  const roots = [{ directory: root, accountType: 'personal' }, { directory: business, accountType: 'business' }];
  assert.deepEqual(await inspectDirectory(directory, roots), {
    directory: await fs.realpath(directory), provider: 'onedrive', accountType: 'business', root: await fs.realpath(business),
  });
  const sibling = `${business}-other`;
  await fs.mkdir(sibling);
  assert.equal((await inspectDirectory(sibling, [{ directory: business, accountType: 'business' }])).provider, null);
});

test('OneDrive discovery reads only authoritative environment or UserFolder account registrations', () => {
  const roots = oneDriveRoots({ OneDriveConsumer: 'C:\\Personal', OneDriveCommercial: 'C:\\Work', OneDrive: 'C:\\Unverified' }, `
HKEY_CURRENT_USER\\Software\\Microsoft\\OneDrive\\Accounts\\Personal
    UserFolder    REG_SZ    C:\\Registered Personal
HKEY_CURRENT_USER\\Software\\Microsoft\\OneDrive\\Accounts\\Business2
    UserFolder    REG_SZ    D:\\Registered Work
HKEY_CURRENT_USER\\Software\\Microsoft\\OneDrive\\Accounts\\NotAnAccount
    UserFolder    REG_SZ    C:\\Ignore
`);
  assert.deepEqual(roots, [
    { directory: 'C:\\Personal', accountType: 'personal' }, { directory: 'C:\\Work', accountType: 'business' },
    { directory: 'C:\\Registered Personal', accountType: 'personal' }, { directory: 'D:\\Registered Work', accountType: 'business' },
  ]);
});

test('symlinked roots and child directories cannot redirect linked writes', async t => {
  const { base, root, profile, bindings } = await fixture(t);
  const outside = path.join(base, 'outside');
  await fs.mkdir(outside);
  try { await fs.symlink(outside, path.join(root, 'Nested'), process.platform === 'win32' ? 'junction' : 'dir'); }
  catch (error) {
    if (['EPERM', 'EACCES', 'ENOTSUP'].includes(error.code)) { t.skip(`Links unavailable: ${error.code}`); return; }
    throw error;
  }
  await assert.rejects(inspectDirectory(path.join(root, 'Nested'), []), /link|directory/i);
  await assert.rejects(syncLinkedFolders(snapshot([note({ folder: 'Work/Nested' })]), bindings, profile), /link|conflict/i);
  assert.deepEqual(await fs.readdir(outside), []);
});

test('an interrupted atomic update resumes from its durable journal after restart', async t => {
  const { root, profile, bindings } = await fixture(t);
  await syncLinkedFolders(snapshot(), bindings, profile);
  const realLink = fs.link.bind(fs);
  let interrupted = false;
  t.mock.method(fs, 'link', async (source, target) => {
    if (String(source).endsWith('.next') && target === path.join(root, 'Welcome.md') && !interrupted) {
      interrupted = true;
      throw Object.assign(new Error('simulated publication failure'), { code: 'EIO' });
    }
    return realLink(source, target);
  });
  await assert.rejects(syncLinkedFolders(snapshot([note({ content: 'second' })]), bindings, profile), /publication failure/);
  t.mock.restoreAll();
  const restarted = await import(`../desktop/linked-folders.js?recovery=${Date.now()}`);
  await restarted.syncLinkedFolders(snapshot([note({ content: 'second' })]), bindings, profile);
  assert.equal(interrupted, true);
  assert.equal(await fs.readFile(path.join(root, 'Welcome.md'), 'utf8'), 'second');
  assert.deepEqual(await fs.readdir(root), ['Welcome.md']);
});

test('a file appearing during atomic publication is not overwritten and its preimage stays recoverable', async t => {
  const { root, profile, bindings } = await fixture(t);
  await syncLinkedFolders(snapshot(), bindings, profile);
  const target = path.join(root, 'Welcome.md');
  const realLink = fs.link.bind(fs);
  let appeared = false;
  t.mock.method(fs, 'link', async (source, destination) => {
    if (String(source).endsWith('.next') && destination === target && !appeared) {
      appeared = true;
      await fs.writeFile(target, 'concurrent external document');
    }
    return realLink(source, destination);
  });
  await assert.rejects(syncLinkedFolders(snapshot([note({ content: 'second' })]), bindings, profile), /conflict|EEXIST/i);
  assert.equal(await fs.readFile(target, 'utf8'), 'concurrent external document');
  const directories = await fs.readdir(path.join(profile, 'linked-folders'));
  const recovery = path.join(profile, 'linked-folders', directories[0], 'recovery', `${createHash('sha256').update('one').digest('hex')}.md`);
  assert.equal(await fs.readFile(recovery, 'utf8'), '# Hello\n');
});

test('a replaced physical root never inherits ownership from the former directory at that path', async t => {
  const { base, root, profile, bindings } = await fixture(t);
  await syncLinkedFolders(snapshot(), bindings, profile);
  await fs.rename(root, path.join(base, 'former-notes'));
  await fs.mkdir(root);
  await fs.writeFile(path.join(root, 'Welcome.md'), '# Hello\n');
  await assert.rejects(syncLinkedFolders(snapshot([note({ content: 'new' })]), bindings, profile), /replaced/i);
  assert.equal(await fs.readFile(path.join(root, 'Welcome.md'), 'utf8'), '# Hello\n');
  assert.equal(await fs.readFile(path.join(base, 'former-notes/Welcome.md'), 'utf8'), '# Hello\n');
});

test('an occupied rename destination preserves both the owned original and the unrelated destination', async t => {
  const { root, profile, bindings } = await fixture(t);
  await syncLinkedFolders(snapshot(), bindings, profile);
  await fs.writeFile(path.join(root, 'Renamed.md'), 'unrelated destination');
  await assert.rejects(syncLinkedFolders(snapshot([note({ title: 'Renamed' })]), bindings, profile), /conflict/i);
  assert.equal(await fs.readFile(path.join(root, 'Welcome.md'), 'utf8'), '# Hello\n');
  assert.equal(await fs.readFile(path.join(root, 'Renamed.md'), 'utf8'), 'unrelated destination');
});

test('enabling a deeper physical binding never deletes the previous parent-root copy', async t => {
  const { base, root, profile, bindings } = await fixture(t);
  const value = snapshot([note({ folder: 'Work/Private/Sub' })]);
  await syncLinkedFolders(value, bindings, profile);
  const other = path.join(base, 'private');
  await fs.mkdir(other);
  await syncLinkedFolders(value, [...bindings, { folder: 'Work/Private', directory: other }], profile);
  assert.equal(await fs.readFile(path.join(root, 'Private/Sub/Welcome.md'), 'utf8'), '# Hello\n');
  assert.equal(await fs.readFile(path.join(other, 'Sub/Welcome.md'), 'utf8'), '# Hello\n');
});

test('an interrupted journal cannot finish deleting files for a now-disabled logical binding', async t => {
  const { root, profile, bindings } = await fixture(t);
  await syncLinkedFolders(snapshot(), bindings, profile);
  const realLink = fs.link.bind(fs);
  let interrupted = false;
  t.mock.method(fs, 'link', async (source, target) => {
    if (String(source).endsWith('.next') && target === path.join(root, 'Welcome.md') && !interrupted) {
      interrupted = true;
      throw Object.assign(new Error('interrupted publication'), { code: 'EIO' });
    }
    return realLink(source, target);
  });
  await assert.rejects(syncLinkedFolders(snapshot([note({ content: 'second' })]), bindings, profile), /interrupted publication/);
  t.mock.restoreAll();
  await assert.rejects(syncLinkedFolders(snapshot([note({ id: 'two', folder: 'Other', title: 'Other' })]), [{ folder: 'Other', directory: root }], profile), /disabled binding/i);
  assert.equal(await fs.readFile(path.join(root, 'Welcome.md'), 'utf8'), '# Hello\n');
});

test('filesystems without hardlinks support creation, restart updates, rename and deletion', async t => {
  const { root, profile, bindings } = await fixture(t);
  t.mock.method(fs, 'link', async () => { throw Object.assign(new Error('hardlinks unsupported'), { code: 'ENOTSUP' }); });
  await syncLinkedFolders(snapshot(), bindings, profile);
  assert.equal(await fs.readFile(path.join(root, 'Welcome.md'), 'utf8'), '# Hello\n');
  const restarted = await import(`../desktop/linked-folders.js?withoutLinks=${Date.now()}`);
  await restarted.syncLinkedFolders(snapshot([note({ content: 'second' })]), bindings, profile);
  assert.equal(await fs.readFile(path.join(root, 'Welcome.md'), 'utf8'), 'second');
  await restarted.syncLinkedFolders(snapshot([note({ title: 'Renamed', content: 'second' })]), bindings, profile);
  assert.deepEqual(await fs.readdir(root), ['Renamed.md']);
  await restarted.syncLinkedFolders(snapshot([]), bindings, profile);
  assert.deepEqual(await fs.readdir(root), []);
});

async function interruptCopy(t, root) {
  t.mock.method(fs, 'link', async () => { throw Object.assign(new Error('hardlinks unsupported'), { code: 'ENOTSUP' }); });
  const realOpen = fs.open.bind(fs);
  let interrupted = false;
  t.mock.method(fs, 'open', async (file, flags, ...rest) => {
    const handle = await realOpen(file, flags, ...rest);
    if (file === path.join(root, 'Welcome.md') && flags === 'wx' && !interrupted) {
      interrupted = true;
      const realWrite = handle.writeFile.bind(handle);
      t.mock.method(handle, 'writeFile', async content => {
        await realWrite(Buffer.from(content).subarray(0, 3));
        throw Object.assign(new Error('interrupted exclusive copy'), { code: 'EIO' });
      });
    }
    return handle;
  });
}

test('a partial exclusive copy recovers after restart without losing the previous owned content', async t => {
  const { root, profile, bindings } = await fixture(t);
  await syncLinkedFolders(snapshot(), bindings, profile);
  await interruptCopy(t, root);
  await assert.rejects(syncLinkedFolders(snapshot([note({ content: 'second version' })]), bindings, profile), /interrupted exclusive copy/);
  assert.equal(await fs.readFile(path.join(root, 'Welcome.md'), 'utf8'), 'sec');
  const restarted = await import(`../desktop/linked-folders.js?partialCopy=${Date.now()}`);
  await restarted.syncLinkedFolders(snapshot([note({ content: 'second version' })]), bindings, profile);
  assert.equal(await fs.readFile(path.join(root, 'Welcome.md'), 'utf8'), 'second version');
  assert.deepEqual(await fs.readdir(root), ['Welcome.md']);
  const directories = await fs.readdir(path.join(profile, 'linked-folders'));
  const recovery = path.join(profile, 'linked-folders', directories[0], 'recovery');
  const id = createHash('sha256').update('one').digest('hex');
  assert.equal(await fs.readFile(path.join(recovery, `${id}.md`), 'utf8'), '# Hello\n');
  assert.equal(await fs.readFile(path.join(recovery, `${id}.partial.md`), 'utf8'), 'sec');
});

test('external edits to an incomplete fallback publication are preserved and reported', async t => {
  const { root, profile, bindings } = await fixture(t);
  await syncLinkedFolders(snapshot(), bindings, profile);
  await interruptCopy(t, root);
  await assert.rejects(syncLinkedFolders(snapshot([note({ content: 'second version' })]), bindings, profile), /interrupted exclusive copy/);
  await fs.writeFile(path.join(root, 'Welcome.md'), 'external replacement');
  await assert.rejects(syncLinkedFolders(snapshot([note({ content: 'second version' })]), bindings, profile), /conflict/i);
  assert.equal(await fs.readFile(path.join(root, 'Welcome.md'), 'utf8'), 'external replacement');
});

test('a file appearing at fallback exclusive creation is never overwritten', async t => {
  const { root, profile, bindings } = await fixture(t);
  t.mock.method(fs, 'link', async () => { throw Object.assign(new Error('hardlinks unsupported'), { code: 'ENOTSUP' }); });
  const realOpen = fs.open.bind(fs);
  let appeared = false;
  t.mock.method(fs, 'open', async (file, flags, ...rest) => {
    if (file === path.join(root, 'Welcome.md') && flags === 'wx' && !appeared) {
      appeared = true;
      await fs.writeFile(file, 'external writer');
    }
    return realOpen(file, flags, ...rest);
  });
  await assert.rejects(syncLinkedFolders(snapshot(), bindings, profile), /conflict|EEXIST/i);
  assert.equal(appeared, true);
  assert.equal(await fs.readFile(path.join(root, 'Welcome.md'), 'utf8'), 'external writer');
});

test('a first-bind partial exclusive copy recovers without adopting an unrelated preexisting file', async t => {
  const { root, profile, bindings } = await fixture(t);
  await interruptCopy(t, root);
  await assert.rejects(syncLinkedFolders(snapshot(), bindings, profile), /interrupted exclusive copy/);
  assert.equal(await fs.readFile(path.join(root, 'Welcome.md'), 'utf8'), '# H');
  const restarted = await import(`../desktop/linked-folders.js?firstCopy=${Date.now()}`);
  await restarted.syncLinkedFolders(snapshot(), bindings, profile);
  assert.equal(await fs.readFile(path.join(root, 'Welcome.md'), 'utf8'), '# Hello\n');
  assert.deepEqual(await fs.readdir(root), ['Welcome.md']);
});

test('a replacement file matching an interrupted prefix is not mistaken for the app-created partial file', async t => {
  const { base, root, profile, bindings } = await fixture(t);
  await syncLinkedFolders(snapshot(), bindings, profile);
  await interruptCopy(t, root);
  await assert.rejects(syncLinkedFolders(snapshot([note({ content: 'second version' })]), bindings, profile), /interrupted exclusive copy/);
  await fs.rename(path.join(root, 'Welcome.md'), path.join(base, 'original-partial'));
  await fs.writeFile(path.join(root, 'Welcome.md'), 'sec');
  await assert.rejects(syncLinkedFolders(snapshot([note({ content: 'second version' })]), bindings, profile), /conflict/i);
  assert.equal(await fs.readFile(path.join(root, 'Welcome.md'), 'utf8'), 'sec');
});

test('renaming a logical binding on the same physical root transfers stable-note ownership without rewriting Markdown', async t => {
  const { root, profile, bindings } = await fixture(t);
  await fs.writeFile(path.join(root, 'unrelated.md'), 'keep');
  await syncLinkedFolders(snapshot(), bindings, profile);
  const original = await fs.stat(path.join(root, 'Welcome.md'));
  const renamed = [{ folder: 'Renamed', directory: root }];
  await syncLinkedFolders(snapshot([note({ folder: 'Renamed', updatedAt: 2 })]), renamed, profile);
  assert.equal(await fs.readFile(path.join(root, 'Welcome.md'), 'utf8'), '# Hello\n');
  const after = await fs.stat(path.join(root, 'Welcome.md'));
  assert.equal(after.ino, original.ino);
  assert.equal(after.mtimeMs, original.mtimeMs);
  const restarted = await import(`../desktop/linked-folders.js?bindingRename=${Date.now()}`);
  await restarted.syncLinkedFolders(snapshot([]), renamed, profile);
  assert.deepEqual(await fs.readdir(root), ['unrelated.md']);
  assert.equal(await fs.readFile(path.join(root, 'unrelated.md'), 'utf8'), 'keep');
});

test('same-root logical rebinding can update only the unchanged file owned by the same note ID', async t => {
  const { root, profile, bindings } = await fixture(t);
  await syncLinkedFolders(snapshot(), bindings, profile);
  const renamed = [{ folder: 'Renamed', directory: root }];
  await assert.rejects(syncLinkedFolders(snapshot([note({ id: 'different-note', folder: 'Renamed' })]), renamed, profile), /conflict/i);
  assert.equal(await fs.readFile(path.join(root, 'Welcome.md'), 'utf8'), '# Hello\n');
  await fs.writeFile(path.join(root, 'Welcome.md'), 'external edit');
  await assert.rejects(syncLinkedFolders(snapshot([note({ folder: 'Renamed', content: 'updated' })]), renamed, profile), /conflict/i);
  assert.equal(await fs.readFile(path.join(root, 'Welcome.md'), 'utf8'), 'external edit');
  await fs.writeFile(path.join(root, 'Welcome.md'), '# Hello\n');
  await syncLinkedFolders(snapshot([note({ folder: 'Renamed', content: 'updated' })]), renamed, profile);
  assert.equal(await fs.readFile(path.join(root, 'Welcome.md'), 'utf8'), 'updated');
});

test('transferring a note between active logical bindings sharing a physical root never schedules deletion of its transferred file', async t => {
  const { root, profile, bindings } = await fixture(t);
  const shared = [...bindings, { folder: 'Renamed', directory: root }];
  await syncLinkedFolders(snapshot(), shared, profile);
  await syncLinkedFolders(snapshot([note({ folder: 'Renamed' })]), shared, profile);
  assert.equal(await fs.readFile(path.join(root, 'Welcome.md'), 'utf8'), '# Hello\n');
  await syncLinkedFolders(snapshot([]), [{ folder: 'Renamed', directory: root }], profile);
  assert.deepEqual(await fs.readdir(root), []);
});
