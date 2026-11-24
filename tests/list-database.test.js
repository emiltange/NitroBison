import test from 'node:test';
import assert from 'node:assert/strict';
import { withProperties } from '../src/collections.js';
import {
  parseListDatabaseConfig, serializeListDatabaseBlock, findListCommand,
  insertListDatabaseMarkdown, updateListDatabaseBlock, queryListDatabase,
} from '../src/list-database.js';

const defaults = { title: 'Tasks', folder: '', tag: '', status: '', sort: 'updated' };
const fence = '```nitrobison-list\n{"title":"Tasks","folder":"","tag":"","status":"","sort":"updated"}\n```';

test('empty list config defaults while supplied filters retain their meaning', () => {
  assert.deepEqual(parseListDatabaseConfig(' \n\t'), { config: defaults, error: null });
  assert.deepEqual(parseListDatabaseConfig('{"title":" Sprint tasks ","folder":"Projects/Launch","tag":"SPRINT","status":"Doing","sort":"start"}'), {
    config: { title: 'Sprint tasks', folder: 'Projects/Launch', tag: 'sprint', status: 'Doing', sort: 'start' }, error: null,
  });
  for (const folder of ['', '*', '/']) assert.equal(parseListDatabaseConfig(JSON.stringify({ folder })).config.folder, folder);
  assert.equal(parseListDatabaseConfig('{"status":"Blocked"}').config.status, 'Blocked');
});

test('invalid list config reports errors without throwing or retaining partial filters', () => {
  for (const source of ['{bad', '[]', 'null', '{"title":""}', '{"title":42}', JSON.stringify({ title: 'x'.repeat(121) }), '{"unknown":true}', '{"folder":"../secret"}', '{"folder":"bad//path"}', '{"tag":"#work"}', '{"status":false}', '{"sort":"random"}']) {
    const result = parseListDatabaseConfig(source);
    assert.deepEqual(result.config, defaults, source);
    assert.equal(typeof result.error, 'string', source);
    assert.ok(result.error.length > 0, source);
  }
});

test('serialization emits canonical JSON with escaped user text and complete defaults', () => {
  assert.equal(serializeListDatabaseBlock({}), fence);
  assert.equal(serializeListDatabaseBlock({ title: 'Ship "ready"' }), '```nitrobison-list\n{"title":"Ship \\"ready\\"","folder":"","tag":"","status":"","sort":"updated"}\n```');
  assert.throws(() => serializeListDatabaseBlock({ folder: '../unsafe' }), /folder|path/i);
});

test('list commands match their own line at the cursor with optional titles', () => {
  for (const [content, title] of [['/list', ''], ['/List view', ''], ['/LIST Sprint tasks', 'Sprint tasks'], ['  /lIsT ViEw Sprint tasks  ', 'Sprint tasks']]) {
    assert.deepEqual(findListCommand(content, content.length), { start: 0, end: content.length, title });
  }
  const content = 'Before\r\n/list Delivery\r\nAfter';
  assert.deepEqual(findListCommand(content, 16), { start: 8, end: 22, title: 'Delivery' });
  for (const content of ['Use /list here', '/listing', '    /list', '\t/list', '> /list', '- /list']) assert.equal(findListCommand(content, content.length), null);
});

test('list commands ignore fenced examples including longer and tilde fences', () => {
  for (const content of ['```md\n/list\n```', '~~~markdown\n/List view\n~~~', '````md\n```nitrobison-list\n/list\n```\n````', '```md\n/list\n```not-a-close\n/list']) {
    const cursor = content.indexOf('/list') >= 0 ? content.indexOf('/list') + 5 : content.indexOf('/List view') + 10;
    assert.equal(findListCommand(content, cursor), null, content);
  }
  const content = '~~~md\n/list\n~~~\n/list Real';
  assert.equal(findListCommand(content, content.length)?.title, 'Real');
});

test('insertion replaces only the command line and otherwise separates Markdown blocks', () => {
  assert.deepEqual(insertListDatabaseMarkdown('Before\n/list\nAfter', 12), { content: `Before\n${fence}\nAfter` });
  assert.equal(insertListDatabaseMarkdown('/List view Sprint tasks', 23).content, '```nitrobison-list\n{"title":"Sprint tasks","folder":"","tag":"","status":"","sort":"updated"}\n```');
  assert.equal(insertListDatabaseMarkdown('Before', 6).content, `Before\n\n${fence}`);
  assert.equal(insertListDatabaseMarkdown('BeforeAfter', 6).content, `Before\n\n${fence}\n\nAfter`);
  assert.equal(insertListDatabaseMarkdown('Before\n\nAfter', 8).content, `Before\n\n${fence}\n\nAfter`);
  assert.equal(insertListDatabaseMarkdown('').content, fence);
});

test('updating a list block preserves other lists and unrelated fenced examples byte for byte', () => {
  const content = '# Intro\r\n\r\n````md\r\n```nitrobison-list\r\n{}\r\n```\r\n````\r\n\r\n```nitrobison-list\r\n{"title":"One"}\r\n```\r\n\r\n~~~list-database\r\n{}\r\n~~~\r\n\r\n```js\r\nconst untouched = true;\r\n```';
  const updated = updateListDatabaseBlock(content, 1, { title: 'Second' });
  assert.equal(updated.content, content.replace('~~~list-database\r\n{}\r\n~~~', '```nitrobison-list\n{"title":"Second","folder":"","tag":"","status":"","sort":"updated"}\n```'));
  assert.deepEqual(updateListDatabaseBlock(content, 8, {}), { content });
  assert.deepEqual(updateListDatabaseBlock(content, -1, {}), { content });
  assert.equal(updateListDatabaseBlock('```list-database\n{}', 0, {}).content, fence);
});

const notes = [
  { id: 'host', title: 'Project overview', folder: 'Projects', content: '', updatedAt: 20 },
  { id: 'alpha', title: 'Alpha', folder: 'Projects', content: withProperties('#sprint', { status: 'Doing', start: '2026-11-16' }), updatedAt: 3 },
  { id: 'bravo', title: 'Bravo', folder: 'Projects/Launch', content: withProperties('#sprint #work', { status: 'In review', start: '2026-11-14' }), updatedAt: 9 },
  { id: 'charlie', title: 'Charlie', folder: 'Projects', content: withProperties('#later', { status: 'Not started' }), updatedAt: 1 },
  { id: 'done', title: 'Delta', folder: 'Projects', content: withProperties('#sprint', { status: 'Done' }), updatedAt: 2 },
  { id: 'root', title: 'Root page', folder: '', content: '#sprint', updatedAt: 4 },
  { id: 'other', title: 'Other project', folder: 'ProjectsElsewhere', content: '#sprint', updatedAt: 5 },
  { id: 'deleted', title: 'Deleted', folder: 'Projects', content: '#sprint', updatedAt: 99, deleted: true },
];
const ids = records => records.map(record => record.note.id);

test('default scope includes the host folder descendants but excludes host and tombstones', () => {
  assert.deepEqual(ids(queryListDatabase(notes, {}, notes[0])), ['bravo', 'alpha', 'done', 'charlie']);
  assert.deepEqual(ids(queryListDatabase(notes, {})), ['root']);
  assert.deepEqual(ids(queryListDatabase(notes, { folder: '/' }, notes[0])), ['root']);
  assert.deepEqual(ids(queryListDatabase(notes, { folder: 'Projects/Launch' }, notes[0])), ['bravo']);
  assert.deepEqual(ids(queryListDatabase(notes, { folder: '*' }, notes[0])), ['bravo', 'other', 'root', 'alpha', 'done', 'charlie']);
});

test('tag and status filters combine with live title, folder, tag and status-label search', () => {
  assert.deepEqual(ids(queryListDatabase(notes, { tag: 'SPRINT', status: 'Doing' }, notes[0])), ['alpha']);
  assert.deepEqual(ids(queryListDatabase(notes, {}, notes[0], 'IN PROGRESS')), ['alpha']);
  assert.deepEqual(ids(queryListDatabase(notes, {}, notes[0], 'doing')), ['alpha']);
  assert.deepEqual(ids(queryListDatabase(notes, {}, notes[0], 'complete')), ['done']);
  assert.deepEqual(ids(queryListDatabase(notes, {}, notes[0], 'launch')), ['bravo']);
  assert.deepEqual(ids(queryListDatabase(notes, {}, notes[0], '#work')), ['bravo']);
  assert.deepEqual(ids(queryListDatabase(notes, {}, notes[0], 'Alpha')), ['alpha']);
});

test('sorting respects title, workflow order, newest update and unscheduled-last start dates', () => {
  assert.deepEqual(ids(queryListDatabase(notes, { sort: 'title' }, notes[0])), ['alpha', 'bravo', 'charlie', 'done']);
  assert.deepEqual(ids(queryListDatabase(notes, { sort: 'status' }, notes[0])), ['charlie', 'alpha', 'bravo', 'done']);
  assert.deepEqual(ids(queryListDatabase(notes, { sort: 'start' }, notes[0])), ['bravo', 'alpha', 'charlie', 'done']);
  const original = notes.map(note => note.id);
  queryListDatabase(notes, { sort: 'status' }, notes[0]);
  assert.deepEqual(notes.map(note => note.id), original);
});

test('malformed note metadata remains visible and reports its source error', () => {
  const broken = { id: 'broken', title: 'Broken', folder: 'Projects', content: '```nitrobison-properties\n{broken}\n```\n\n#sprint', updatedAt: 50 };
  const records = queryListDatabase([broken], { tag: 'sprint' }, notes[0]);
  assert.equal(records[0].note, broken);
  assert.equal(records[0].properties.status, 'Not started');
  assert.deepEqual(records[0].tags, ['sprint']);
  assert.match(records[0].error, /JSON|metadata/i);
});
