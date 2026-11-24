import test from 'node:test';
import assert from 'node:assert/strict';
import { buildGraph, buildFolderGraph, scopeGraph, filterRelatedGraph } from '../src/graph.js';

const notes = [
  { id: 'root', title: 'Start', folder: '', content: '[Plan](Work/Plan.md) [[Missing]] [[Deleted]]' },
  { id: 'plan', title: 'Plan', folder: 'Work', content: '[[Work/Deep/Research]] [Research](Deep/Research.md) [[Other/Contact]]' },
  { id: 'research', title: 'Research', folder: 'Work/Deep', content: '[[Work/Plan]]' },
  { id: 'incoming', title: 'Contact', folder: 'Other', content: '[[Work/Plan]] [[Elsewhere/Unrelated]]' },
  { id: 'unrelated', title: 'Unrelated', folder: 'Elsewhere', content: '' },
  { id: 'prefix', title: 'Separate', folder: 'Workshop', content: '' },
  { id: 'deleted', title: 'Deleted', folder: '', content: '[[Start]]', deleted: true },
];

test('manual Markdown and wiki links resolve to the same real edge without dangling or deleted nodes', () => {
  const graph = buildGraph(notes);
  assert.deepEqual(graph.nodes.map(node => node.id), ['root', 'plan', 'research', 'incoming', 'unrelated', 'prefix']);
  assert.deepEqual(graph.edges, [
    { source: 'root', target: 'plan' },
    { source: 'plan', target: 'research' },
    { source: 'plan', target: 'incoming' },
    { source: 'research', target: 'plan' },
    { source: 'incoming', target: 'plan' },
    { source: 'incoming', target: 'unrelated' },
  ]);
});

test('folder scope includes slash descendants and one-hop incoming/outgoing neighbors, not prefix matches or two-hop nodes', () => {
  const graph = scopeGraph(buildGraph(notes), 'Work');
  assert.deepEqual(graph.nodes.map(({ id, external }) => ({ id, external })), [
    { id: 'root', external: true },
    { id: 'plan', external: false },
    { id: 'research', external: false },
    { id: 'incoming', external: true },
  ]);
  assert.equal(graph.edges.length, 5);
  assert.ok(graph.edges.every(edge => edge.target !== 'unrelated'));
});

test('root scope differs from all folders and retains its real cross-folder neighbor', () => {
  const root = scopeGraph(buildGraph(notes), '');
  assert.deepEqual(root.nodes.map(({ id, external }) => ({ id, external })), [
    { id: 'root', external: false },
    { id: 'plan', external: true },
  ]);
  assert.deepEqual(root.edges, [{ source: 'root', target: 'plan' }]);
  const all = scopeGraph(buildGraph(notes), null);
  assert.equal(all.nodes.length, 6);
  assert.ok(all.nodes.every(node => !node.external));
});

test('empty and nonexistent folder scopes never manufacture note nodes', () => {
  assert.deepEqual(scopeGraph(buildGraph(notes), 'Empty'), { nodes: [], edges: [] });
  assert.deepEqual(scopeGraph(buildGraph([]), ''), { nodes: [], edges: [] });
});

test('folder overview groups exact paths and counts real references in both directions once each', () => {
  const graph = buildFolderGraph(notes, ['Empty', 'Work/Deep', 'all', 'Vault root']);
  const work = graph.nodes.find(node => node.id === 'Work');
  assert.equal(work.noteCount, 1);
  assert.equal(work.internalLinks, 0);
  assert.equal(graph.nodes.find(node => node.id === '').noteCount, 1);
  assert.equal(graph.nodes.find(node => node.id === 'Work/Deep').noteCount, 1);
  assert.equal(graph.nodes.find(node => node.id === 'Empty').noteCount, 0);
  assert.ok(graph.nodes.some(node => node.id === 'all'));
  assert.ok(graph.nodes.some(node => node.id === 'Vault root'));
  assert.equal(graph.nodes.filter(node => node.id === '').length, 1);
  assert.deepEqual(graph.edges, [
    { source: '', target: 'Work', count: 1 },
    { source: 'Work', target: 'Work/Deep', count: 2 },
    { source: 'Other', target: 'Work', count: 2 },
    { source: 'Elsewhere', target: 'Other', count: 1 },
  ]);
});

test('folder overview retains empty nested parents and reports same-folder links without fake inter-folder edges', () => {
  const graph = buildFolderGraph([
    { id: 'a', title: 'A', folder: 'Notes', content: '[[B]] [[A]]' },
    { id: 'b', title: 'B', folder: 'Notes', content: '' },
    { id: 'gone', title: 'Gone', folder: 'DeletedOnly', deleted: true, content: '' },
  ], ['Empty/Nested']);
  assert.deepEqual(graph.edges, []);
  assert.equal(graph.nodes.find(node => node.id === 'Notes').internalLinks, 2);
  assert.equal(graph.nodes.find(node => node.id === 'Notes').noteCount, 2);
  assert.ok(graph.nodes.some(node => node.id === 'Empty'));
  assert.ok(graph.nodes.some(node => node.id === 'Empty/Nested'));
  assert.ok(!graph.nodes.some(node => node.id === 'DeletedOnly'));
});

test('folder graph scoping keeps external folder groups and their aggregated counts', () => {
  const graph = scopeGraph(buildFolderGraph(notes, ['Work/Empty']), 'Work');
  assert.deepEqual(graph.nodes.filter(node => node.external).map(node => node.id).sort(), ['', 'Other']);
  assert.ok(graph.nodes.some(node => node.id === 'Work/Empty' && !node.external));
  assert.equal(graph.edges.find(edge => edge.source === 'Other' && edge.target === 'Work').count, 2);
});

test('linked directory references retain every logical folder without duplicating entities or document counts', () => {
  const graph = buildFolderGraph([
    { id: 'plan', title: 'Plan', folder: 'Work', content: '' },
  ], ['Work'], [
    { folder: '', directory: 'Root backup', provider: null, accountType: null, status: 'connected' },
    { folder: 'Work', directory: 'Local work', provider: null, accountType: null, status: 'connected' },
    { folder: 'Work', directory: 'OneDrive work', provider: 'onedrive', accountType: 'business', status: 'connected' },
    { folder: 'Archive/Empty', directory: 'Google archive', provider: 'google', accountType: 'business', status: 'selected' },
  ]);
  assert.deepEqual(graph.nodes.map(({ id, noteCount }) => ({ id, noteCount })), [
    { id: '', noteCount: 0 },
    { id: 'Work', noteCount: 1 },
    { id: 'Archive/Empty', noteCount: 0 },
    { id: 'Archive', noteCount: 0 },
  ]);
  assert.deepEqual(graph.edges, []);
});

test('an empty linked folder remains selectable in scoped folder graphs without manufacturing notes', () => {
  const graph = buildFolderGraph([], [], [
    { folder: '', directory: 'Root backup', provider: null, accountType: null, status: 'connected' },
    { folder: 'Empty/Nested', directory: 'Nested backup', provider: null, accountType: null, status: 'connected' },
  ]);
  assert.deepEqual(scopeGraph(graph, 'Empty').nodes.map(({ id, external }) => ({ id, external })), [
    { id: 'Empty/Nested', external: false },
    { id: 'Empty', external: false },
  ]);
  assert.deepEqual(scopeGraph(graph, '').nodes.map(({ id, external }) => ({ id, external })), [
    { id: '', external: false },
  ]);
  assert.deepEqual(scopeGraph(buildGraph([]), 'Empty'), { nodes: [], edges: [] });
});

test('linked folders do not change real note references or aggregated cross-folder link counts', () => {
  const graph = buildFolderGraph([
    { id: 'root', title: 'Root', folder: '', content: '[[Work/Plan]]' },
    { id: 'plan', title: 'Plan', folder: 'Work', content: '[[Root]]' },
  ], [], [
    { folder: '', directory: 'Root copy', provider: null, status: 'connected' },
    { folder: 'Work', directory: 'Work copy', provider: 'onedrive', status: 'connected' },
    { folder: 'Work', directory: 'Another work copy', provider: 'google', status: 'connected' },
  ]);
  assert.deepEqual(graph.edges, [{ source: '', target: 'Work', count: 2 }]);
  assert.equal(graph.nodes.find(node => node.id === '').noteCount, 1);
  assert.equal(graph.nodes.find(node => node.id === 'Work').noteCount, 1);
});

test('relationship filters retain the original graph arrays when no valid criteria are selected', () => {
  const graph = buildGraph(notes);
  const result = filterRelatedGraph(notes, graph, { tags: ['', '#'], links: ['deleted', 'missing'] });
  assert.equal(result.active, false);
  assert.equal(result.nodes, graph.nodes);
  assert.equal(result.edges, graph.edges);
  assert.deepEqual(result.matchedIds, []);
  assert.deepEqual(result.anchorIds, []);
  assert.ok(result.linkOptions.every(note => note.id !== 'deleted'));
});

test('two link anchors intersect incoming and outgoing relationships while retaining the anchors and real edges', () => {
  const result = filterRelatedGraph(notes, buildGraph(notes), { links: ['plan', 'unrelated', 'plan'] });
  assert.equal(result.active, true);
  assert.equal(result.match, 'all');
  assert.deepEqual(result.selectedLinks, ['plan', 'unrelated']);
  assert.deepEqual(result.matchedIds, ['incoming']);
  assert.deepEqual(result.matchedNotes.map(note => note.id), ['incoming']);
  assert.deepEqual(result.anchorIds, ['plan', 'unrelated']);
  assert.ok(result.anchorNotes.every(note => note.anchor && note.role === 'anchor'));
  assert.equal(result.nodes.find(note => note.id === 'incoming').matched, true);
  assert.deepEqual(result.edges, [
    { source: 'plan', target: 'incoming' },
    { source: 'incoming', target: 'plan' },
    { source: 'incoming', target: 'unrelated' },
  ]);
});

test('any-link matching returns the union rather than requiring both anchors', () => {
  const result = filterRelatedGraph(notes, buildGraph(notes), { links: new Set(['plan', 'unrelated']), match: 'any' });
  assert.deepEqual(result.matchedIds, ['root', 'research', 'incoming']);
  assert.deepEqual(result.nodes.map(note => note.id), ['root', 'plan', 'research', 'incoming', 'unrelated']);
});

const taggedNotes = [
  { id: 'plan', title: 'Plan', folder: 'Work', content: '#Urgent #roadmap [[Work/Plan]] [[Elsewhere/Archive]]' },
  { id: 'shared', title: 'Shared', folder: 'Work', content: '[[Work/Plan]] #urgent #Roadmap #urgent' },
  { id: 'topic', title: 'Topic', folder: 'Work', content: '#roadmap' },
  { id: 'urgent', title: 'Urgent', folder: 'Other', content: '#urgent' },
  { id: 'code', title: 'Code', folder: 'Work', content: '```md\n#urgent #roadmap\n```\n`#urgent` [#roadmap](https://example.com) #123' },
  { id: 'archive', title: 'Archive', folder: 'Elsewhere', content: '' },
  { id: 'deleted', title: 'Deleted', folder: '', content: '#urgent #roadmap [[Work/Plan]]', deleted: true },
];

test('multiple tags normalize and intersect without counting fenced code, inline code, links, or deleted notes', () => {
  const result = filterRelatedGraph(taggedNotes, buildGraph(taggedNotes), { tags: new Set(['#URGENT', 'roadmap', 'urgent']) });
  assert.deepEqual(result.selectedTags, ['urgent', 'roadmap']);
  assert.deepEqual(result.matchedIds, ['plan', 'shared']);
  assert.deepEqual(result.tagCounts, [{ tag: 'roadmap', count: 3 }, { tag: 'urgent', count: 3 }]);
  assert.deepEqual(result.anchorIds, []);
});

test('any-tag matching returns notes with either tag and preserves their real edges', () => {
  const result = filterRelatedGraph(taggedNotes, buildGraph(taggedNotes), { tags: ['urgent', 'roadmap'], match: 'any' });
  assert.deepEqual(result.matchedIds, ['plan', 'shared', 'topic', 'urgent']);
  assert.deepEqual(result.edges, [{ source: 'plan', target: 'plan' }, { source: 'shared', target: 'plan' }]);
});

test('combined link and tag criteria require both and do not count an anchor self-link', () => {
  const result = filterRelatedGraph(taggedNotes, buildGraph(taggedNotes), { links: ['plan'], tags: ['urgent'] });
  assert.deepEqual(result.matchedIds, ['shared']);
  assert.deepEqual(result.matchedNotes.map(note => note.id), ['shared']);
  assert.equal(result.anchorNotes[0].matched, false);
  assert.deepEqual(result.nodes.find(note => note.id === 'shared').matchedTags, ['urgent']);
  assert.deepEqual(result.nodes.find(note => note.id === 'shared').matchedLinks, ['plan']);
});

test('any matching can satisfy either a tag or link, with matching anchors clearly separated from results', () => {
  const result = filterRelatedGraph(taggedNotes, buildGraph(taggedNotes), { links: ['plan'], tags: ['urgent'], match: 'any' });
  assert.deepEqual(result.matchedIds, ['plan', 'shared', 'urgent', 'archive']);
  assert.equal(result.anchorNotes[0].matched, true);
  assert.deepEqual(result.matchedNotes.map(note => note.id), ['shared', 'urgent', 'archive']);
});

test('empty intersections keep only anchors and never manufacture connecting edges', () => {
  const result = filterRelatedGraph(notes, buildGraph(notes), { links: ['plan', 'prefix'] });
  assert.deepEqual(result.matchedNotes, []);
  assert.deepEqual(result.matchedIds, []);
  assert.deepEqual(result.nodes.map(note => note.id), ['plan', 'prefix']);
  assert.deepEqual(result.edges, []);
});

test('directly connected selected anchors remain visible without counting as shared documents', () => {
  const result = filterRelatedGraph(notes, buildGraph(notes), { links: ['plan', 'research'] });
  assert.deepEqual(result.matchedNotes, []);
  assert.ok(result.nodes.every(note => note.anchor && !note.matched));
  assert.deepEqual(result.edges, [
    { source: 'plan', target: 'research' },
    { source: 'research', target: 'plan' },
  ]);
});

test('folder-scoped matches use full-note relationships and retain selected anchors beyond the scope', () => {
  const graph = scopeGraph(buildGraph(notes), 'Work');
  const result = filterRelatedGraph(notes, graph, { links: ['plan', 'unrelated'] });
  assert.deepEqual(result.matchedIds, ['incoming']);
  assert.equal(result.nodes.find(note => note.id === 'incoming').external, true);
  assert.equal(result.nodes.find(note => note.id === 'unrelated').anchor, true);
  assert.equal(result.nodes.find(note => note.id === 'unrelated').external, true);
  assert.ok(result.edges.some(edge => edge.source === 'incoming' && edge.target === 'unrelated'));
  assert.ok(!result.nodes.some(note => note.id === 'prefix'));
});
