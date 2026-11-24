import test from 'node:test';
import assert from 'node:assert/strict';
import { storageOverview } from '../src/projects.js';
import { updateFolderPreferences } from '../src/folder-preferences.js';

const session = (name, accountType, connected = true) => ({ name, connected, info: { accountType, folder: { id: 'real-folder', name: 'NitroBison', path: 'Apps/NitroBison', webUrl: 'https://onedrive.live.com/' } } });


test('expired credentials are not connected even with remembered provider folder metadata', () => {
  const entry = storageOverview({ configuredProvider: 'onedrive', connection: session('OneDrive', 'business', false) }).find(item => item.id === 'onedrive');
  assert.equal(entry.state, 'configured');
  assert.deepEqual(entry.folderReferences, []);
});

test('a verified device folder is distinct from OAuth and does not claim successful cloud uploads', () => {
  const link = { folder: 'Work', directory: 'C:\\Drive\\Notes', provider: 'onedrive', accountType: 'business', status: 'connected', fileCount: 1 };
  const entry = storageOverview({ folderConnections: [link] }).find(item => item.id === 'onedrive');
  assert.equal(entry.state, 'folder-connected');
  assert.equal(entry.projectBadge, null);
  assert.equal(entry.folderReferences.length, 1);
  assert.match(entry.folderReferences[0], /Work.*C:\\Drive\\Notes/);
  const failed = storageOverview({ folderConnections: [{ ...link, status: 'error' }] }).find(item => item.id === 'onedrive');
  assert.equal(failed.state, 'folder-error');
  assert.equal(storageOverview({ folderConnections: [{ ...link, status: 'selected' }] }).find(item => item.id === 'onedrive').state, 'folder-selected');
  assert.equal(storageOverview({ folderConnections: [{ ...link, status: 'pending' }] }).find(item => item.id === 'onedrive').state, 'folder-pending');
});


test('enabling filesystem saving requires a local path and changing or clearing the path revokes old write intent', () => {
  assert.throws(() => updateFolderPreferences({}, 'Work', { directory: 'browser-name', directorySync: true }), /absolute|path/i);
  let preferences = updateFolderPreferences({}, 'Work', { directory: 'C:\\Work', directorySync: true, directoryService: 'onedrive-ea' });
  assert.equal(preferences.Work.directorySync, true);
  preferences = updateFolderPreferences(preferences, 'Work', { directory: 'C:\\Other' });
  assert.equal(preferences.Work.directorySync, undefined);
  assert.equal(preferences.Work.directoryService, undefined);
  preferences = updateFolderPreferences(preferences, 'Work', { directory: null });
  assert.equal(preferences.Work, undefined);
  assert.throws(() => updateFolderPreferences({}, 'Work', { directory: 'C:\\Work', directorySync: 'yes' }), /boolean/i);
  assert.throws(() => updateFolderPreferences({}, 'Work', { directory: 'C:\\Work', directoryService: 'not-a-drive' }), /service/i);
});
