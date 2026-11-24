import test from 'node:test';
import assert from 'node:assert/strict';
import { folderOverview, withFolderBanner } from '../src/folders.js';

const banner = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6rXsAAAAASUVORK5CYII=';
const note = (folder, title = 'README', content = '# About this folder') => ({ id: `${folder}/${title}`, folder, title, content });

test('folder overviews use only a surviving README in the exact folder', () => {
  const notes = [note('Project/Child'), { ...note('Project'), deleted: true }, note('Other'), note('Project', 'ReadMe', 'Real overview')];
  assert.equal(folderOverview(notes, 'Project').body, 'Real overview');
  assert.equal(folderOverview(notes, '').note, undefined);
  assert.equal(folderOverview(notes, 'Missing').body, '');
});

test('folder banners replace without losing Markdown or unrelated images and survive JSON roundtrip', () => {
  const body = '# A folder\n\nRich **Markdown** and [[a note]].\n\n![A diagram](diagram.png)';
  const content = withFolderBanner(body, banner);
  const overview = folderOverview(JSON.parse(JSON.stringify([note('Project', 'README', content)])), 'Project');
  assert.equal(overview.banner, banner);
  assert.equal(overview.body, body);
  assert.equal(withFolderBanner(content, null), body);
  assert.equal(withFolderBanner(content, banner), content);
});

test('folder banners never accept remote images, executable formats, spoofed bytes or oversized data', () => {
  for (const unsafe of ['https://tracker.example/banner.png', 'data:image/svg+xml;base64,PHN2Zy8+', 'data:image/png;base64,PHN2Zy8+', `data:image/png;base64,${'A'.repeat(800000)}`]) {
    assert.throws(() => withFolderBanner('Keep this text', unsafe), /banner/i);
    const content = `Keep this text\n\n![Folder banner](${unsafe})`;
    const overview = folderOverview([note('Project', 'README', content)], 'Project');
    assert.equal(overview.banner, null);
    assert.equal(overview.body, content);
  }
});
