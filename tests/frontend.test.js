import test from 'node:test';
import assert from 'node:assert/strict';

let model = {};
let graph = {};
try { model = await import('../src/markdown-model.js'); } catch {}
try { graph = await import('../src/graph.js'); } catch {}
const notes = [
  { id: 'a', title: 'Home', folder: '', content: '[[Ideas/Seed|a seed]] [[Ideas/Seed]] [seed](Ideas/Seed.md) [[Missing]]', updatedAt: 1 },
  { id: 'b', title: 'Seed', folder: 'Ideas', content: '[[Home]]', updatedAt: 1 },
  { id: 'c', title: 'Gone', folder: '', content: '[[Home]]', updatedAt: 1, deleted: true },
];

test('wiki and relative Markdown links resolve paths, aliases and ignore deleted notes', () => {
  assert.equal(typeof model.resolveNoteLink, 'function', 'note link resolution is implemented');
  assert.equal(model.resolveNoteLink('Ideas/Seed|a seed', notes, notes[0])?.id, 'b');
  assert.equal(model.resolveNoteLink('../Home.md', notes, notes[1])?.id, 'a');
  assert.equal(model.resolveNoteLink('Gone', notes, notes[0]), null);
  assert.equal(model.resolveNoteLink('Missing', notes, notes[0]), null);
});

test('resource policy blocks automatic remote images and executable links', () => {
  assert.equal(typeof model.safeResource, 'function', 'resource policy is implemented');
  assert.equal(model.safeResource('javascript:alert(1)'), null);
  assert.equal(model.safeResource('data:text/html,test'), null);
  assert.equal(model.safeResource('https://tracker.example/pixel.png', true), null);
  assert.equal(model.safeResource('//tracker.example/pixel.png', true), null);
  assert.equal(model.safeResource('https://example.com/guide'), 'https://example.com/guide');
  assert.equal(model.safeResource('#section'), '#section');
});

test('outline excludes fenced examples and disambiguates repeated headings', () => {
  assert.equal(typeof model.extractOutline, 'function', 'outline extraction is implemented');
  assert.deepEqual(model.extractOutline('# Start\n```md\n# Hidden\n```\n## Next\n## Next'), [
    { text: 'Start', level: 1, id: 'start' },
    { text: 'Next', level: 2, id: 'next' },
    { text: 'Next', level: 2, id: 'next-2' },
  ]);
});

test('graph includes isolated notes and unique resolved edges, never tombstones', () => {
  assert.equal(typeof graph.buildGraph, 'function', 'graph builder is implemented');
  const result = graph.buildGraph([...notes, { id: 'd', title: 'Alone', folder: '', content: '', updatedAt: 1 }]);
  assert.deepEqual(result.nodes.map(node => node.id).sort(), ['a', 'b', 'd']);
  assert.deepEqual(result.edges, [{ source: 'a', target: 'b' }, { source: 'b', target: 'a' }]);
});

test('relative Markdown and unqualified wiki links prefer the current folder without guessing ambiguous cross-folder titles', () => {
  assert.equal(typeof model.resolveNoteLink, 'function');
  const targets = [
    { id: 'root', title: 'Target', folder: '' },
    { id: 'local', title: 'Target', folder: 'Projects' },
    { id: 'other', title: 'Target', folder: 'Elsewhere' },
  ];
  assert.equal(model.resolveNoteLink('Target.md', targets, { folder: 'Projects' })?.id, 'local');
  assert.equal(model.resolveNoteLink('Target', targets, { folder: 'Projects' })?.id, 'local');
  assert.equal(model.resolveNoteLink('Projects/Target', targets, { folder: 'Elsewhere' })?.id, 'local');
  assert.equal(model.resolveNoteLink('Target', targets.filter(note => note.folder), { folder: 'Unrelated' }), null);
});

