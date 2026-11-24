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

export function storageOverview({ mode = 'personal', online = true, configuredProvider = null, connectedProvider = null } = {}) {
  const result = [{
    id: 'local', label: 'On this device', state: 'available',
    detail: 'Your notes save here first and remain available offline.',
    scope: 'Every project', projectBadge: 'Local',
  }];
  if (mode === 'team') result.push({
    id: 'team', label: 'Shared server', state: online ? 'available' : 'offline',
    detail: online ? 'Use team sync to fetch and merge shared changes.' : 'Team sync needs a connection. Your cached notes remain on this device.',
    scope: 'All team projects', projectBadge: 'Shared server',
  });
  for (const [id, label] of [['google', 'Google Drive'], ['onedrive', 'OneDrive']]) {
    const state = mode === 'team' ? 'personal-only' : connectedProvider === id ? (online ? 'connected' : 'offline') : configuredProvider === id ? 'configured' : 'unconfigured';
    const detail = {
      'personal-only': 'Personal cloud connections are not used by team projects.',
      connected: 'Connected in this session. Nothing uploads until you choose sync.',
      offline: 'This session is connected, but cloud sync needs a network connection.',
      configured: 'Setup is saved. Reconnect to authorize this session before syncing.',
      unconfigured: 'Not integrated. Add your own account in storage settings.',
    }[state];
    result.push({
      id, label, state, detail,
      scope: 'Whole personal vault · all projects',
      projectBadge: ['connected', 'offline', 'configured'].includes(state) ? `${label} · ${state === 'configured' ? 'reconnect' : state === 'offline' ? 'offline' : 'connected this session'}` : null,
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
