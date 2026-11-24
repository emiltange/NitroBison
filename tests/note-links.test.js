import test from 'node:test';
import assert from 'node:assert/strict';
import * as model from '../src/markdown-model.js';
import { buildGraph } from '../src/graph.js';

const source = { id: 'source', title: 'Start', folder: 'Work', content: 'Keep my original text.  ', updatedAt: 1 };
const target = { id: 'target', title: 'Plan [draft] (#1)', folder: 'Other/Research', content: '', updatedAt: 1 };

test('manual links retain source text and resolve exact special-character paths across folders', () => {
  const content = model.withNoteLink(source, target, [source, target]);
  assert.ok(content.startsWith(source.content));
  const linked = { ...source, content };
  assert.deepEqual(buildGraph([linked, target]).edges, [{ source: 'source', target: 'target' }]);
  assert.equal(model.withNoteLink(linked, target, [linked, target]), content);
});

test('manual links do not duplicate wiki references and reject unavailable or self targets', () => {
  const referenced = { ...source, content: '[[/Other/Research/Plan%20%5Bdraft%5D%20(%231)]]' };
  assert.equal(model.withNoteLink(referenced, target, [referenced, target]), referenced.content);
  assert.throws(() => model.withNoteLink(source, source, [source, target]));
  assert.throws(() => model.withNoteLink(source, { ...target, deleted: true }, [source, { ...target, deleted: true }]));
  assert.throws(() => model.withNoteLink(source, target, [source]));
});

test('tags are distinct, case-insensitive topics, not headings, code, URL fragments or Markdown anchors', () => {
  const content = '# Heading\n\n#Design #design #Café/ideas #2026\n\n`#inline-code` [section](#anchor) https://example.test/#fragment\n\n```md\n#fenced\n```\n\n    #indented\n';
  assert.deepEqual(model.extractTags(content), ['design', 'café/ideas']);
});

test('reference locations retain repeated aliases, source-folder resolution and UTF-16 offsets', () => {
  const plan = { id: 'plan', title: 'Plan', folder: 'Work', content: '' };
  const otherPlan = { ...plan, id: 'other-plan', folder: 'Other' };
  const linked = { ...source, content: '😀 [[Plan|first]]\n[[Plan|again]]\n[open](../Work/Plan.md#part)' };
  const notes = [linked, plan, otherPlan];
  assert.deepEqual(model.referenceOccurrences(linked, plan, notes), [
    { start: 3, end: 17, text: '[[Plan|first]]' },
    { start: 18, end: 32, text: '[[Plan|again]]' },
    { start: 33, end: 61, text: '[open](../Work/Plan.md#part)' },
  ]);
  assert.deepEqual(model.referenceOccurrences(linked, otherPlan, notes), []);
});

test('reference locations resolve encoded, escaped and angle-delimited special-character paths', () => {
  const links = [
    '[[/Other/Research/Plan%20%5Bdraft%5D%20(%231)|draft]]',
    '[draft](../Other/Research/Plan%20%5Bdraft%5D%20\\(%231\\).md#part)',
    '[draft](<../Other/Research/Plan [draft] (%231).md>)',
  ];
  const linked = { ...source, content: links.join('\n') };
  const occurrences = model.referenceOccurrences(linked, target, [linked, target]);
  assert.deepEqual(occurrences.map(occurrence => occurrence.text), links);
  assert.deepEqual(occurrences.map(({ start, end }) => linked.content.slice(start, end)), links);
  assert.deepEqual(buildGraph([linked, target]).edges, [{ source: source.id, target: target.id }]);
  for (const link of links) {
    assert.equal(model.withNoteLink({ ...source, content: link }, target, [source, target]), link);
  }
});

test('reference locations ignore code, escaped syntax, images, anchors and external links without shifting offsets', () => {
  const plan = { id: 'plan', title: 'Plan', folder: 'Work', content: '' };
  const prefix = '`[[Plan]]`\n```md\n[[Plan]]\n```\n    [[Plan]]\n![image](Plan.md)\n[anchor](#Plan)\n[web](https://example.test/Plan.md)\n\\[[Plan]]\n';
  const linked = { ...source, content: `${prefix}[[Plan]]` };
  assert.deepEqual(model.referenceOccurrences(linked, plan, [linked, plan]), [
    { start: prefix.length, end: prefix.length + 8, text: '[[Plan]]' },
  ]);
  assert.deepEqual(buildGraph([linked, plan]).edges, [{ source: source.id, target: plan.id }]);
});

test('reference locations return nothing for missing, deleted or unreferenced targets', () => {
  const plan = { id: 'plan', title: 'Plan', folder: 'Work', content: '' };
  const linked = { ...source, content: '[[Plan]]' };
  assert.deepEqual(model.referenceOccurrences(linked, plan, [linked]), []);
  assert.deepEqual(model.referenceOccurrences(linked, { ...plan, deleted: true }, [linked, plan]), []);
  assert.deepEqual(model.referenceOccurrences(linked, plan, [linked, { ...plan, deleted: true }]), []);
  assert.deepEqual(model.referenceOccurrences(linked, target, [linked, plan, target]), []);
  assert.deepEqual(model.referenceOccurrences(linked, null, [linked, plan]), []);
});

test('tag locations match complete case-insensitive hierarchical tags with original UTF-16 offsets', () => {
  const content = '😀 #Café/Ideas #café #CAFÉ/IDEAS #café/ideas/more #2026';
  assert.deepEqual(model.tagOccurrences(content, 'café/ideas'), [
    { start: 3, end: 14, text: '#Café/Ideas' },
    { start: 21, end: 32, text: '#CAFÉ/IDEAS' },
  ]);
  assert.deepEqual(model.tagOccurrences(content, 'CAFÉ'), [{ start: 15, end: 20, text: '#café' }]);
  assert.deepEqual(model.tagOccurrences(content, 'missing'), []);
  assert.deepEqual(model.tagOccurrences(content, '2026'), []);
});

test('tag locations share extraction exclusions without losing offsets after hidden text', () => {
  const prefix = '# Heading\n`#design` [#design](#design) ![#design](image.png) https://example.test/#design\n~~~md\n#design\n~~~\n    #design\n';
  const content = `${prefix}(#Design)`;
  assert.deepEqual(model.tagOccurrences(content, 'design'), [
    { start: prefix.length + 1, end: prefix.length + 8, text: '#Design' },
  ]);
  assert.deepEqual(model.extractTags(content), ['design']);
});
