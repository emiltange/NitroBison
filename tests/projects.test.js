import test from 'node:test';
import assert from 'node:assert/strict';
const model = await import('../src/projects.js').catch(() => ({}));
const note = (id, folder, content, extra = {}) => ({ id, folder, title: id, content, updatedAt: 1, ...extra });

test('a direct README supplies project information and its banner without changing recency', () => {
  const banner = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6rXsAAAAASUVORK5CYII=';
  const projects = model.projectOverview({ notes: [
    note('root-readme', '', 'A root overview.', { title: 'readme' }),
    note('readme', 'Work', `# Work\n\nThe **project** introduction.\n\n![Folder banner](${banner})`, { title: 'ReadMe', updatedAt: 5 }),
    note('latest', 'Work/Plans', 'A newer page, not the overview.', { updatedAt: 20 }),
    note('child-readme', 'Other/Child', 'Nested information.', { title: 'README' }),
    note('deleted-readme', 'Other', 'Deleted overview.', { title: 'README', deleted: true }),
  ], folders: ['Work', 'Other'] });
  const work = projects.find(project => project.folder === 'Work');
  assert.equal(work.description, 'The project introduction.');
  assert.equal(work.banner, banner);
  assert.equal(work.overviewNote.id, 'readme');
  assert.equal(work.latestNote.id, 'latest');
  assert.equal(work.updatedAt, 20);
  assert.equal(projects.find(project => project.folder === '').description, 'A root overview.');
  assert.equal(projects.find(project => project.folder === 'Other').description, 'Nested information.');
  assert.equal(projects.find(project => project.folder === 'Other').overviewNote, null);
});

test('project overview groups nested notes without duplicating empty parent projects or including deletions', () => {
  assert.equal(typeof model.projectOverview, 'function', 'project overview is implemented');
  const snapshot = {
    notes: [note('root', '', 'A loose thought.'), note('research', 'Work/Research', 'Research in progress.'), note('plan', 'Work', 'A useful plan.'), note('gone', 'Deleted', 'Not visible.', {deleted:true})],
    folders: ['Work', 'Work/Research', 'Empty/Nested'],
  };
  const result = model.projectOverview(snapshot);
  assert.deepEqual(result.map(project => ({folder:project.folder,ids:project.noteIds.slice().sort(),count:project.noteCount})), [
    {folder:'',ids:['root'],count:1},
    {folder:'Empty',ids:[],count:0},
    {folder:'Work',ids:['plan','research'],count:2},
  ]);
  assert.equal(result.find(project => project.folder==='Work').description,'Research in progress.');
  assert.equal(model.projectOverview({notes:[],folders:[]}).length,0);
});

test('latest document previews omit Markdown decorations when no README exists', () => {
  const snapshot = {notes:[
    note('overview','Travel','An older overview.', {title:'Overview',updatedAt:10}),
    note('latest','Travel/Plans','# Summer plans\n\n```text\nInternal example, not the description.\n```\n\nA **small trip** with [friends](https://example.com) and [[Ideas|new ideas]].', {title:'Summer route',updatedAt:20}),
  ],folders:['Travel']};
  const [project] = model.projectOverview(snapshot);
  assert.equal(project.description,'A small trip with friends and new ideas.');
  assert.equal(project.latestNote.id,'latest');
  assert.equal(project.latestNote.title,'Summer route');
  assert.equal(project.latestNote.folder,'Travel/Plans');
  assert.equal(project.updatedAt,20);
});

test('latest document selection excludes tombstones and leaves empty projects without a document', () => {
  const projects = model.projectOverview({notes:[
    note('old','Work','Earlier work.',{updatedAt:10}),
    note('latest','Work/Research','Latest research.',{updatedAt:30}),
    note('deleted','Work','Deleted text.',{updatedAt:100,deleted:true}),
  ],folders:['Work','Empty']});
  const work = projects.find(project => project.folder === 'Work');
  assert.equal(work.latestNote.id,'latest');
  assert.equal(work.description,'Latest research.');
  assert.equal(work.updatedAt,30);
  const empty = projects.find(project => project.folder === 'Empty');
  assert.equal(empty.latestNote,null);
  assert.equal(empty.noteCount,0);
  assert.equal(empty.updatedAt,0);
});

test('document previews retain useful list and code content when there is no paragraph', () => {
  const projects = model.projectOverview({notes:[
    note('list','Checklist','# Checklist\n\n- **Read** notes\n- [[Garden|Plant ideas]]'),
    note('code','Code','```js\nconst ready = true;\n```'),
  ],folders:[]});
  assert.equal(projects.find(project => project.folder === 'Checklist').description,'Read notes Plant ideas');
  assert.equal(projects.find(project => project.folder === 'Code').description,'const ready = true;');
});

test('project selection includes slash descendants but never unrelated prefixes or root notes', () => {
  assert.equal(typeof model.projectContains, 'function');
  assert.equal(model.projectContains(note('a','Work',''),'Work'),true);
  assert.equal(model.projectContains(note('a','Work/Research',''),'Work'),true);
  assert.equal(model.projectContains(note('a','Workshop',''),'Work'),false);
  assert.equal(model.projectContains(note('a','',''),'Work'),false);
  assert.equal(model.projectContains(note('a','',''),''),true);
  assert.equal(model.projectContains(note('a','Work',''),''),false);
});

test('sample flags and recent activity reflect only surviving notes in each project', () => {
  assert.equal(typeof model.projectOverview, 'function');
  const result=model.projectOverview({notes:[note('10000000-0000-4000-8000-000000000001','Sample','Example.',{updatedAt:10}),note('mine','Personal','My note.',{updatedAt:20}),note('old','Personal','Deleted.',{updatedAt:100,deleted:true})],folders:[]});
  assert.equal(result.find(project=>project.folder==='Sample').sample,true);
  assert.equal(result.find(project=>project.folder==='Personal').sample,false);
  assert.equal(result.find(project=>project.folder==='Personal').updatedAt,20);
});

test('saved cloud setup is never displayed as a connected account and loses no local storage', () => {
  assert.equal(typeof model.storageOverview, 'function');
  const result=model.storageOverview({online:true,configuredProvider:'google',connection:null});
  assert.equal(result.find(drive=>drive.id==='local').state,'available');
  assert.equal(result.find(drive=>drive.id==='google').state,'configured');
  assert.equal(result.find(drive=>drive.id==='onedrive').state,'unconfigured');
  assert.equal(result.find(drive=>drive.id==='google').projectBadge.includes('reconnect'),true);
  assert.equal(result.find(drive=>drive.id==='onedrive').projectBadge,null);
});

test('live provider identity wins over a different saved form and offline state does not imply a sync', () => {
  assert.equal(typeof model.storageOverview, 'function');
  const connected=model.storageOverview({online:true,configuredProvider:'onedrive',connection:{name:'Google Drive',connected:true,info:{accountType:'unknown',folder:null}}});
  assert.equal(connected.find(drive=>drive.id==='google').state,'connected');
  assert.equal(connected.find(drive=>drive.id==='onedrive').state,'configured');
  const offline=model.storageOverview({online:false,configuredProvider:'google',connection:{name:'Google Drive',connected:true,info:{accountType:'unknown',folder:null}}});
  assert.equal(offline.find(drive=>drive.id==='google').state,'offline');
  assert.equal(offline.find(drive=>drive.id==='local').state,'available');
});


test('recent projects show only the latest six surviving updates without mutating the overview', () => {
  const projects = model.projectOverview({notes:[
    note('a','A','A.',{updatedAt:10}),
    note('b','B','B.',{updatedAt:80}),
    note('c','C','C.',{updatedAt:30}),
    note('d','D','D.',{updatedAt:70}),
    note('e','E','E.',{updatedAt:50}),
    note('f','F','F.',{updatedAt:60}),
    note('g','G','G.',{updatedAt:40}),
    note('h','H','H.',{updatedAt:20}),
    note('deleted','A','Deleted.',{updatedAt:100,deleted:true}),
  ],folders:['Empty']});
  assert.deepEqual(model.recentProjects(projects).map(project => project.folder),['B','D','F','E','G','C']);
  assert.deepEqual(projects.map(project => project.folder),['A','B','C','D','E','Empty','F','G','H']);
  assert.deepEqual(model.recentProjects([]),[]);
  assert.equal(model.recentProjects(projects.slice(0,2)).length,2);
});

test('favorite folders retain all saved nested paths and root while ignoring missing or deleted-only paths', () => {
  const snapshot = {notes:[
    note('seed','Ideas/Seeds','A new idea.'),
    note('deleted','Deleted','Not here.',{deleted:true}),
  ],folders:['Work/Research','Empty/Nested']};
  const favorites = model.favoriteFolders(snapshot,['Work/Research','','Work','Ideas','Ideas/Seeds','Missing','Deleted','Work/Research','Empty','Empty/Nested']);
  assert.deepEqual(favorites.map(folder => folder.folder),['Work/Research','','Work','Ideas','Ideas/Seeds','Empty','Empty/Nested']);
  assert.equal(favorites.find(folder => folder.folder === 'Work/Research').title,'Work/Research');
  assert.deepEqual(model.favoriteFolders({notes:[],folders:[]},['Missing','']).map(folder => folder.folder),['']);
  assert.deepEqual(model.favoriteFolders(snapshot,[]),[]);
});
