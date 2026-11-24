import { Lexer } from 'marked';
import { folderOverview } from './folders.js';

export function projectContains(note, folder) {
  return folder === '' ? note.folder === '' : note.folder === folder || note.folder.startsWith(`${folder}/`);
}

function plainText(tokens) {
  return tokens.map(token => {
    if (token.type === 'html') return '';
    if (token.type === 'br') return ' ';
    if (token.type === 'list') return token.items.map(item => plainText(item.tokens)).join(' ');
    return token.tokens ? plainText(token.tokens) : token.text || '';
  }).join('');
}

function description(content) {
  if (content === undefined) return 'A new space for your next idea. Add a note to get started.';
  const tokens = Lexer.lex(content);
  const paragraph = tokens.find(token => token.type === 'paragraph');
  const preview = paragraph ? [paragraph] : tokens.filter(token => token.type !== 'heading');
  const text = preview.map(token => plainText([token])).join(' ').replace(/\[\[([^\]|]*)(?:\|([^\]]*))?\]\]/g, (_, target, alias) => alias || target).replace(/\s+/g, ' ').trim();
  if (!text) return 'This note has no preview text yet.';
  const characters = Array.from(text);
  return characters.length > 200 ? `${characters.slice(0, 199).join('').trimEnd()}…` : text;
}

export function projectOverview(snapshot) {
  const active = snapshot.notes.filter(note => !note.deleted);
  const roots = new Set(snapshot.folders.filter(Boolean).map(folder => folder.split('/')[0]));
  for (const note of active) if (note.folder) roots.add(note.folder.split('/')[0]);
  const folders = [...roots].sort((a, b) => a.localeCompare(b));
  if (active.some(note => !note.folder)) folders.unshift('');
  return folders.map(folder => {
    const notes = active.filter(note => projectContains(note, folder));
    const latestNote = notes.reduce((latest, note) => !latest || note.updatedAt > latest.updatedAt ? note : latest, null);
    const overview = folderOverview(notes, folder);
    return {
      folder,
      title: folder || 'Unfiled pages',
      description: description(overview.note ? overview.body : latestNote?.content),
      overviewNote: overview.note || null,
      banner: overview.banner,
      latestNote,
      noteIds: notes.map(note => note.id),
      noteCount: notes.length,
      updatedAt: latestNote?.updatedAt || 0,
      sample: notes.some(note => note.id.startsWith('10000000-0000-4000-8000-')),
    };
  });
}

export function storageOverview({ online = true, configuredProvider = null, connection = null, folderConnections = [] } = {}) {
  const folderReference = link => `${link.folder || 'Unfiled pages'} → ${link.directory}${link.provider === 'google' && link.accountType === 'business' ? ' · EA' : ''}${link.status === 'error' ? ' · Save failed' : link.status === 'selected' ? ' · Enable Markdown saving' : link.status === 'pending' ? ' · Saving…' : ''}`;
  const result = [{
    id: 'local', label: 'On this device', state: 'available',
    detail: 'Your notes save here first and remain available offline.',
    scope: 'Every project', projectBadge: 'Local',
    folderReferences: folderConnections.filter(link => !link.provider).map(folderReference),
  }];
  const connectedProvider = connection?.connected ? connection.name === 'Google Drive' ? 'google' : connection.name === 'OneDrive' ? 'onedrive' : null : null;
  for (const [id, name] of [['google', 'Google Drive'], ['onedrive', 'OneDrive']]) {
    const active = connectedProvider === id;
    const links = folderConnections.filter(link => link.provider === id);
    const linked = links.filter(link => link.status === 'connected');
    const accountType = active ? connection.info.accountType : links.length && links.every(link => link.accountType === 'business') ? 'business' : 'unknown';
    const label = `${name}${id === 'google' && accountType === 'business' ? ' EA' : ''}`;
    const state = active ? (online ? 'connected' : 'offline') : linked.length ? 'folder-connected' : links.some(link => link.status === 'error') ? 'folder-error' : links.some(link => link.status === 'pending') ? 'folder-pending' : links.length ? 'folder-selected' : configuredProvider === id ? 'configured' : 'unconfigured';
    const detail = {
      connected: `Account verified in this session. Nothing uploads until you choose sync.${accountType === 'unknown' ? ' Account type could not be verified.' : ''}`,
      offline: 'This session is authorized, but cloud sync needs a network connection.',
      'folder-connected': 'Markdown folder connected on this device. The provider desktop client manages cloud uploads; this is not OAuth sign-in.',
      'folder-error': 'Notes remain saved locally, but the linked Markdown folder could not be updated.',
      'folder-selected': 'Folder selected. Enable Markdown saving in its folder details; selecting a path alone does not write files or sign in.',
      'folder-pending': 'Writing Markdown files to the selected device folder. Cloud uploads remain the desktop client’s responsibility.',
      configured: 'Setup is saved. Reconnect to authorize this session before syncing.',
      unconfigured: 'Not integrated. Add your own account or link its desktop folder.',
    }[state];
    const folderReferences = [...(active && connection.info.folder ? [connection.info.folder.path || connection.info.folder.name] : []), ...links.map(folderReference)];
    result.push({
      id, label, state, detail, accountType, folderReferences,
      scope: active ? connection.info.folder ? 'Whole personal vault · verified cloud folder' : 'Whole personal vault · cloud folder created on first sync' : 'Whole-vault OAuth sync or explicit linked device folders',
      projectBadge: active ? `${label} · ${online ? 'connected this session' : 'offline'}` : state === 'configured' ? `${name} · reconnect` : null,
    });
  }
  return result;
}

export function recentProjects(projects) {
  return [...projects].sort((a, b) => b.updatedAt - a.updatedAt || a.folder.localeCompare(b.folder)).slice(0, 6);
}

export function favoriteFolders(snapshot, bookmarks) {
  const folders = new Set(['']);
  const paths = [...snapshot.folders, ...snapshot.notes.filter(note => !note.deleted).map(note => note.folder)];
  for (const path of paths) {
    const parts = path.split('/');
    for (let depth = 1; depth <= parts.length; depth++) folders.add(parts.slice(0, depth).join('/'));
  }
  return [...new Set(bookmarks)].filter(folder => folders.has(folder)).map(folder => ({ folder, title: folder || 'Unfiled pages' }));
}
