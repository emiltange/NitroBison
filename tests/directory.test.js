import test from 'node:test';
import assert from 'node:assert/strict';
import { selectedDirectoryName } from '../src/directory.js';

const file = webkitRelativePath => ({ webkitRelativePath });
const directory = name => ({ name, isDirectory: true, isFile: false, fullPath: `/${name}` });

test('directory metadata keeps only the exact root name, including Unicode and spaces', () => {
  assert.equal(selectedDirectoryName([
    file(' Équipe 🐄 /note.md'),
    file(' Équipe 🐄 /nested/another.md'),
  ]), ' Équipe 🐄 ');
});

test('empty directory entries supply a name without reading directory contents', () => {
  const entry = directory('Empty folder');
  Object.defineProperty(entry, 'createReader', { get() { throw new Error('Must not enumerate directories'); } });
  assert.equal(selectedDirectoryName([], [entry]), 'Empty folder');
  assert.equal(selectedDirectoryName([file('Empty folder/note.md')], [entry]), 'Empty folder');
});

test('an empty selection does not invent a directory name', () => {
  assert.equal(selectedDirectoryName([]), null);
});

test('mixed roots and contradictory directory entries cannot become a saved selection', () => {
  for (const [files, entries] of [
    [[file('One/a.md'), file('Two/b.md')], []],
    [[file('One/a.md'), file('one/b.md')], []],
    [[], [directory('One'), directory('Two')]],
    [[file('One/a.md')], [directory('Two')]],
    [[], [{ ...directory('One'), fullPath: '/Other' }]],
    [[], [{ ...directory('One'), fullPath: '/Parent/One' }]],
  ]) {
    assert.throws(() => selectedDirectoryName(files, entries), /directory/i);
  }
});

test('ordinary files and non-directory entries are not directory selections', () => {
  for (const [files, entries] of [
    [[{ name: 'note.md' }], []],
    [[file('note.md')], []],
    [[file('')], []],
    [[], [{ name: 'note.md', isDirectory: false, isFile: true, fullPath: '/note.md' }]],
    [[], [{ ...directory('Folder'), isFile: true }]],
  ]) {
    assert.throws(() => selectedDirectoryName(files, entries), /directory/i);
  }
});

test('unsafe relative path metadata is rejected rather than displayed as a location', () => {
  for (const path of [
    '/Folder/note.md', 'C:/Folder/note.md', 'Folder\\note.md',
    '../note.md', './note.md', 'Folder/../note.md', 'Folder/./note.md',
    'Folder//note.md', 'Folder/note.md/', 'Folder/line\nbreak.md',
    '\u0000Folder/note.md', 'Folder/\u007fnote.md', 'Folder/\u0085note.md',
    '   /note.md', `${'a'.repeat(256)}/note.md`,
  ]) {
    assert.throws(() => selectedDirectoryName([file(path)]), /directory/i, JSON.stringify(path));
  }
});

test('directory entry names obey the same boundary without trimming valid names', () => {
  assert.equal(selectedDirectoryName([], [directory('  Équipe 🐄  ')]), '  Équipe 🐄  ');
  for (const name of ['', ' ', '.', '..', 'a/b', 'a\\b', 'C:', 'a\nb', 'a\u007fb', 'a\u009fb', 'a'.repeat(256)]) {
    assert.throws(() => selectedDirectoryName([], [directory(name)]), /directory/i, JSON.stringify(name));
  }
});
