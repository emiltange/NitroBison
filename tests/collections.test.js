import test from 'node:test';
import assert from 'node:assert/strict';
import { extractTags } from '../src/markdown-model.js';
import * as model from '../src/collections.js';
const body = '# Delivery\n\nKeep this body and [[Related]] intact. #work\n';
const note = { id: 'stable-id', title: 'Delivery', folder: 'Projects', content: body, updatedAt: 1 };

test('the four-stage workflow keeps stored status names and exposes readable labels and tones', () => {
  assert.deepEqual(model.NOTE_STATUSES, ['Not started', 'Doing', 'In review', 'Done']);
  for (const [status, label, tone] of [
    ['Not started', 'To-do', 'todo'],
    ['Doing', 'In progress', 'doing'],
    ['In review', 'In review', 'review'],
    ['Done', 'Complete', 'done'],
  ]) {
    const properties = model.readProperties(model.withProperties(body, { status }));
    assert.equal(properties.status, status);
    assert.equal(properties.body, body);
    assert.equal(model.statusLabel(properties.status), label);
    assert.equal(model.statusTone(properties.status), tone);
  }
  assert.equal(model.statusLabel('Waiting'), 'Waiting');
  assert.equal(model.statusTone('Waiting'), 'custom');
});

test('moving into review preserves existing dates, tags and record identity', () => {
  const started = model.withProperties(body, { status: 'Doing', start: '2026-11-13', end: '2026-11-14' });
  const content = model.withProperties(started, { status: 'In review' });
  const [record] = model.collectionRecords([{ ...note, content }], { folder: 'Projects', tag: 'work' });
  assert.equal(record.note.id, 'stable-id');
  assert.equal(record.properties.status, 'In review');
  assert.equal(record.properties.start, '2026-11-13');
  assert.equal(record.properties.end, '2026-11-14');
  assert.equal(record.properties.body, body);
  assert.deepEqual(record.tags, ['work']);
  assert.equal(record.error, null);
});

test('view properties stay in the same Markdown note and retain its body and tags', () => {
  const content = model.withProperties(body, { status: 'Doing', start: '2026-11-13', end: '2026-11-14' });
  const properties = model.readProperties(content);
  assert.equal(properties.body, body);
  assert.equal(properties.status, 'Doing');
  assert.equal(properties.start, '2026-11-13');
  assert.equal(properties.end, '2026-11-14');
  assert.deepEqual(extractTags(content), ['work']);
  const changed = model.withProperties(content, { status: 'Done' });
  assert.equal(model.readProperties(changed).body, body);
  assert.equal(model.readProperties(changed).start, '2026-11-13');
  assert.equal(model.readProperties(changed).status, 'Done');
});

test('tag-filtered records retain note IDs and exclude code-only tags and tombstones', () => {
  const records = model.collectionRecords([note, { ...note, id: 'example', content: '```md\n#work\n```' }, { ...note, id: 'deleted', deleted: true }], { tag: 'WORK' });
  assert.deepEqual(records.map(record => record.note.id), ['stable-id']);
  assert.equal(records[0].note.content, body);
  assert.deepEqual(model.collectionRecords([note], { tag: 'elsewhere' }), []);
});

test('date properties reject impossible days and reversed ranges without changing source', () => {
  for (const patch of [{ start: '2026-02-29' }, { start: '2026-11-14', end: '2026-11-13' }, { end: '2026-11-13' }, { start: '2026-13-01' }]) {
    assert.throws(() => model.withProperties(body, patch), /date|range|start|end/i);
  }
  const valid = model.withProperties(body, { start: '2028-02-29', end: '2028-02-29' });
  assert.equal(model.readProperties(valid).end, '2028-02-29');
  assert.equal(model.addDays('2028-02-29', 1), '2028-03-01');
  assert.equal(model.addDays('2026-12-31', 1), '2027-01-01');
});

test('malformed owned metadata is reported rather than discarded on property edits', () => {
  const broken = '```nitrobison-properties\n{bad JSON}\n```\n\n' + body;
  assert.throws(() => model.withProperties(broken, { status: 'Done' }), /properties|metadata|JSON/i);
  assert.throws(() => model.withProperties(body, { start: 42 }), /date|start/i);
  assert.throws(() => model.withProperties(body, { status: 'Done', unknown: 'ignored' }), /property|properties|unsupported/i);
});

test('custom swimlane statuses receive custom tone and preserve exact label', () => {
  assert.equal(model.statusTone('Blocked'), 'custom');
  assert.equal(model.statusLabel('Blocked'), 'Blocked');
  const content = model.withProperties(body, { status: 'Blocked' });
  assert.equal(model.readProperties(content).status, 'Blocked');
});
