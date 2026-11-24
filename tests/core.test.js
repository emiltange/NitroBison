import test from 'node:test';
import assert from 'node:assert/strict';
const core = await import('../src/core.js').catch(() => ({}));
const note = (id, content, folder = '') => ({id, title: id, folder, content, updatedAt: 1});

test('concurrent edits preserve the remote version and a recoverable local conflict copy', () => {
  assert.equal(typeof core.mergeSnapshots, 'function', 'snapshot merge must exist');
  const base = {notes:[note('A','base'),note('B','unchanged')],folders:[]};
  const local = {notes:[note('A','local edit'),note('B','unchanged')],folders:[]};
  const remote = {notes:[note('A','remote edit'),note('B','unchanged')],folders:[]};
  const merged = core.mergeSnapshots(base,local,remote);
  assert.equal(merged.notes.find(n=>n.id==='A').content,'remote edit');
  assert.equal(merged.notes.find(n=>n.id!=='A' && n.content==='local edit').title,'A (conflict)');
  assert.equal(merged.notes.filter(n=>n.id==='B').length,1);
});

test('an offline deletion does not destroy a concurrent remote edit', () => {
  assert.equal(typeof core.mergeSnapshots, 'function', 'snapshot merge must exist');
  const base = {notes:[note('A','base')],folders:[]};
  const local = {notes:[{...note('A','base'),deleted:true}],folders:[]};
  const remote = {notes:[note('A','remote edit')],folders:[]};
  const merged = core.mergeSnapshots(base,local,remote);
  assert.ok(merged.notes.some(n=>!n.deleted && n.content==='remote edit'));
});

test('independent edits combine and unchanged remote data accepts local deletion', () => {
  assert.equal(typeof core.mergeSnapshots, 'function', 'snapshot merge must exist');
  const base = {notes:[note('A','base'),note('B','base')],folders:['Old']};
  const local = {notes:[{...note('A','base'),deleted:true},note('B','base')],folders:[]};
  const remote = {notes:[note('A','base'),note('B','remote')],folders:['Old','New']};
  const merged=core.mergeSnapshots(base,local,remote);
  assert.equal(merged.notes.find(n=>n.id==='A').deleted,true);
  assert.equal(merged.notes.find(n=>n.id==='B').content,'remote');
  assert.deepEqual(merged.folders,['New']);
});

test('snapshot validation rejects path traversal and duplicate note identity', () => {
  assert.equal(typeof core.validateSnapshot, 'function', 'snapshot validation must exist');
  assert.throws(()=>core.validateSnapshot({notes:[note('A','x','../private')],folders:[]}));
  assert.throws(()=>core.validateSnapshot({notes:[note('A','x'),note('A','y')],folders:[]}));
  assert.throws(()=>core.validateSnapshot({notes:[{...note('A','x'),title:'../../secret'}],folders:[]}));
  assert.throws(()=>core.validateSnapshot({notes:[],folders:['A//B']}));
});

test('wiki and relative markdown links resolve with folder context, not fenced examples', () => {
  assert.equal(typeof core.linksFor, 'function', 'note link resolution must exist');
  const notes=[{...note('a','[[Target]] and [Other](../Other.md)\n```md\n[[Ignored]]\n```','Projects'),title:'Source'}, {...note('b','','Projects'),title:'Target'}, {...note('c',''),title:'Other'}, {...note('d',''),title:'Ignored'}];
  assert.deepEqual(core.linksFor(notes[0],notes),['b','c']);
});
