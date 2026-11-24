import './gn-tokens.css';
import './gn-components.css';
import './styles.css';
import { openWorkspace } from './workspace.js';
import { connectCloud, importMarkdownFiles, exportMarkdownFolder as exportFolder } from './cloud.js';
import { installApp, registerOffline } from './install.js';
import { renderMarkdown } from './markdown.js';
import { buildGraph, mountGraph } from './graph.js';
import { escapeHtml, extractOutline, extractTags, withNoteLink } from './markdown-model.js';
import { projectContains } from './projects.js';
import { folderOverview, withFolderBanner, readFolderBanner } from './folders.js';
import { renderHome } from './home.js';
import { chooseDirectory } from './directory.js';

const $ = (selector, root = document) => root.querySelector(selector);
const icons = {
  home: '<path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-8H9v8H4a1 1 0 0 1-1-1z"/>',
  device: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/>',
  notes: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  graph: '<circle cx="5" cy="6" r="3"/><circle cx="19" cy="6" r="3"/><circle cx="12" cy="19" r="3"/><path d="m7 8 4 8m6-8-4 8M8 6h8"/>',
  settings: '<path d="m9 3 1-1h4l1 3 3 1 3 2-1 4 1 3-3 3-3-1-2 3h-4l-1-3-3-1-3-2 1-4-1-3 3-3 3 1z"/><circle cx="12" cy="11" r="3"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  folder: '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>',
  share: '<circle cx="9" cy="8" r="3"/><path d="M3 21v-3a6 6 0 0 1 12 0v3M16 3a3 3 0 0 1 0 6m2 5a5 5 0 0 1 3 5v2"/>',
  cloud: '<path d="M7 18a5 5 0 1 1 1-10 7 7 0 0 1 13 3 4 4 0 0 1-1 8H7z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  panel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>',
  download: '<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  book: '<path d="M12 5c-3-2-7-2-10-1v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1zm0 0v15"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2"/>',
};
const icon = name => `<svg class="gn-icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.notes}</svg>`;
const button = (action, label, name, extra = '') => `<button class="gn-icon-btn" data-action="${action}" aria-label="${label}" title="${label}" ${extra}>${icon(name)}</button>`;
const html = escapeHtml;
let workspace;
let selected = null;
let view = 'home';
let mode = 'preview';
let query = '';
let folderFilter = null;
let creationFolder = null;
let graphMode = 'notes';
let disposeGraph;
let cloudConnection = null;
let lastRetry = null;
let previewTimer;
let pending = 0;
let activeDialogTrigger;
let bannerTarget = null;
const drafts = new Map();
const failedDrafts = new Set();
let lastRendered = null;

function notes() {
  const stored = workspace.snapshot.notes;
  return [...stored.map(note => drafts.get(note.id) || note), ...[...drafts.values()].filter(note => !stored.some(item => item.id === note.id))].filter(note => !note.deleted);
}
function currentNote() { return notes().find(note => note.id === selected); }
function scopedNotes() { return notes().filter(note => folderFilter === null || projectContains(note, folderFilter)); }
function readonly() { return workspace.mode === 'team' ? workspace.user?.role === 'viewer' : cloudConnection?.readOnly === true; }
function permissionNotice() { return workspace.mode === 'team' ? 'Read-only · Your team invitation does not grant editing access.' : `Read-only · You can read this ${cloudConnection?.name || 'cloud'} vault, but cannot write to it.`; }
function storageGet(key, fallback) { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } }
function storageSet(key, value) { try { localStorage.setItem(key, value); } catch { /* The vault uses IndexedDB, not preferences storage. */ } }
function bookmarkKey() { return `nitrobison-bookmarks:${workspace.mode === 'team' ? `team:${workspace.user.id}` : 'personal'}`; }
function projectBookmarks() {
  try {
    const saved = JSON.parse(localStorage.getItem(bookmarkKey()) || '[]');
    return Array.isArray(saved) ? saved.filter(folder => typeof folder === 'string') : [];
  } catch { return []; }
}
function saveProjectBookmarks(bookmarks) {
  try { localStorage.setItem(bookmarkKey(), JSON.stringify([...new Set(bookmarks)])); }
  catch (error) { throw new Error(`Bookmarks could not be saved in this browser. ${error.message}`); }
  const focusedBookmark = document.activeElement?.dataset.bookmark;
  renderChrome();
  if (focusedBookmark !== undefined) ([...document.querySelectorAll('[data-bookmark]')].find(control => control.dataset.bookmark === focusedBookmark) || [...document.querySelectorAll('[data-project]')].find(control => control.dataset.project === focusedBookmark) || $('#main')).focus();
}
function notice(message) { $('#announcement').textContent = message; }
function report(error, retry) {
  $('#error-text').textContent = error?.message || String(error);
  $('#error-banner').hidden = false;
  lastRetry = retry;
  $('#retry-error').hidden = !retry;
  const modal = $('#modal');
  if (modal.open) {
    $('.dialog-error', modal)?.remove();
    const message = document.createElement('div');
    message.className = 'gn-error dialog-error';
    message.setAttribute('role', 'alert');
    const text = document.createElement('span');
    text.textContent = error?.message || String(error);
    message.append(text);
    if (retry) {
      const control = document.createElement('button');
      control.className = 'gn-btn gn-btn--secondary';
      control.textContent = 'Try again';
      control.addEventListener('click', retry);
      message.append(control);
    }
    $('.gn-dialog-body', modal).prepend(message);
  }
}
async function run(action, success) {
  try {
    const result = await action();
    $('#error-banner').hidden = true;
    $('.dialog-error')?.remove();
    if (success) notice(success);
    return result;
  } catch (error) { report(error, () => run(action, success)); return undefined; }
}
function download(name, content, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30000);
}
function filename(value) { return value.replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-').replace(/[. ]+$/, '') || 'Untitled'; }

function buildShell() {
  $('#app').innerHTML = `<div class="workspace-shell">
    <nav class="app-rail" aria-label="Primary navigation"><a class="brand-mark" href="${html(location.pathname + location.search)}" data-action="home" aria-label="NitroBison home"><img src="/logo.jpg" alt="" /></a><div class="rail-main">${button('home', 'Home', 'home')}${button('notes', 'Notes', 'notes')}${button('graph', 'Knowledge graph', 'graph')}${button('team', 'Team workspace', 'share')}</div><div class="rail-bottom">${button('install', 'Install NitroBison', 'download')}${button('settings', 'Settings and cloud sync', 'settings')}</div></nav>
    <header class="topbar"><div class="topbar-brand">${button('sidebar', 'Toggle note browser', 'menu', 'aria-controls="sidebar" aria-expanded="false"')}<a href="${html(location.pathname + location.search)}" data-action="home" class="wordmark" aria-label="NitroBison home">NitroBison<span class="brand-period">.</span></a><span class="brand-divider"></span><span id="workspace-label">Personal workspace</span></div><div class="topbar-actions"><span class="local-indicator"><span class="status-dot"></span><span id="save-status" role="status">Opening vault…</span></span><button class="gn-btn gn-btn--secondary" data-action="team" aria-label="Share workspace">${icon('share')}<span>Share workspace</span></button></div></header>
    <aside class="sidebar" id="sidebar" aria-label="Note browser"><div class="vault-heading"><div><span class="gn-eyebrow">A home for your thoughts</span><h1 class="gn-title" id="vault-name">My knowledge garden</h1></div><span id="note-count" class="gn-meta"></span></div><label class="search-box">${icon('search')}<input id="search" type="search" placeholder="Search your notes…" autocomplete="off" aria-label="Search notes" /><kbd>⌘ K</kbd></label><button class="gn-btn gn-btn--primary new-note" data-action="new-note">${icon('plus')}New note</button><div class="sidebar-section"><span class="gn-eyebrow" id="browser-heading">Your notes</span>${button('new-folder', 'Create folder', 'folder')}</div><div id="note-tree" class="note-tree"></div><div class="sidebar-footer"><div class="sidebar-footer-icon">${icon('cloud')}</div><div><b id="vault-location">Local, by default</b><p id="vault-location-description">Your ideas. In your hands.</p></div><button class="gn-icon-btn" data-action="settings" aria-label="Open storage settings">→</button></div></aside>
    <main id="main" class="main-workspace" tabindex="-1"><div id="error-banner" class="error-banner" role="alert" hidden><span id="error-text"></span><button id="retry-error" class="gn-btn gn-btn--secondary">Try again</button><button class="gn-icon-btn" data-action="dismiss-error" aria-label="Dismiss error">×</button></div><div id="sample-banner" class="sample-banner" hidden><span class="gn-pill">Sample vault</span><span>A few ideas to help you find your feet. Make them yours.</span></div><div id="note-view" class="note-view"><div class="note-toolbar"><div class="breadcrumb" id="breadcrumb"></div><div class="note-toolbar-actions"><div class="view-switch" role="group" aria-label="Note display mode"><button data-mode="edit" aria-pressed="false">Write</button><button data-mode="preview" aria-pressed="true">Read</button><button data-mode="split" aria-pressed="false">Split</button></div>${button('note-details', 'Toggle outline and backlinks', 'panel', 'aria-controls="context-panel" aria-expanded="false"')}${button('export-note', 'Export note as Markdown', 'download')}${button('delete-note', 'Delete note', 'trash')}</div></div><div class="note-heading"><label class="sr-only" for="note-title">Note title</label><input id="note-title" class="note-title" placeholder="Untitled note" maxlength="200" /><div class="note-metadata"><span id="note-date"></span><span>·</span><span id="word-count"></span><span id="role-indicator" class="gn-pill" hidden>Read-only</span><label class="note-folder-label">Folder <select id="note-folder" aria-label="Move note to folder"></select></label></div></div><div class="note-content" data-mode="preview"><section class="editor-pane" aria-label="Markdown editor"><div class="pane-label">Markdown <span>Plain text. Endless possibility.</span></div><textarea id="editor" aria-label="Markdown content" spellcheck="true" placeholder="Start with a thought…"></textarea></section><article id="preview" class="markdown-body" aria-label="Rendered note"></article></div><footer class="note-footer"><span>${icon('book')} <span id="note-footer-label">A little more connected.</span></span><span>Markdown, made yours.</span></footer></div><div id="graph-view" class="graph-view" hidden></div><div id="empty-view" class="empty-view" hidden><div class="empty-symbol">${icon('notes')}</div><span class="gn-eyebrow">Room for something new</span><h2>No notes yet.</h2><p>A thought, a question, a little spark.<br />Your next idea can start right here.</p><button class="gn-btn gn-btn--primary" data-action="new-note">${icon('plus')}Create your first note</button></div></main>
    <aside id="context-panel" class="context-panel" aria-label="Note connections"><div class="context-title"><span class="gn-eyebrow">In this note</span>${button('note-details', 'Close note details', 'panel')}</div><div id="outline"></div><details class="context-section" id="note-tags"><summary>Tags <span id="tag-count" class="gn-pill">0</span></summary><div id="tag-list" class="note-tags"></div></details><details class="context-section" id="linked-documents"><summary>Linked documentation <span id="connection-count" class="gn-pill">0</span></summary><h3 class="gn-heading">References <span id="outgoing-count" class="gn-meta"></span></h3><div id="outgoing-links"></div><h3 class="gn-heading">Backlinks <span id="backlink-count" class="gn-meta"></span></h3><div id="backlinks"></div></details><button class="gn-btn gn-btn--secondary context-link-action" data-action="link-note">${icon('link')}Link documentation</button><div class="context-tip"><span class="gn-eyebrow">Connected ideas</span><p>Use <code>[[a note title]]</code> or Link documentation to connect notes. Add <code>#topic</code> tags to organize them.</p></div></aside>
  </div><div id="announcement" class="announcement" role="status" aria-live="polite"></div><dialog id="modal" class="gn-dialog"></dialog><input id="markdown-files" type="file" accept=".md,text/markdown" multiple hidden /><input id="markdown-folder" type="file" webkitdirectory multiple hidden /><input id="backup-file" type="file" accept=".json,application/json" hidden />`;
  $('#sidebar').insertAdjacentHTML('afterbegin', '<button class="gn-btn gn-btn--text sidebar-back" data-action="home" aria-label="Back to overview"><span aria-hidden="true">←</span>Back to overview</button>');
  const home = document.createElement('section');
  home.id = 'home-view';
  home.className = 'passport-home';
  $('#main').insertBefore(home, $('#sample-banner'));
  const folderPage = document.createElement('section');
  folderPage.id = 'folder-view';
  folderPage.className = 'folder-frontpage';
  folderPage.hidden = true;
  $('#main').insertBefore(folderPage, $('#note-view'));
  const toolbarInfo = document.createElement('div');
  toolbarInfo.className = 'note-toolbar-info';
  const breadcrumb = $('#breadcrumb');
  breadcrumb.replaceWith(toolbarInfo);
  toolbarInfo.append(breadcrumb, $('#role-indicator'));
  $('#role-indicator').className = 'permission-notice';
  $('#role-indicator').setAttribute('role', 'status');
  $('#app').insertAdjacentHTML('beforeend', '<input id="folder-banner-file" type="file" accept="image/png,image/jpeg,image/webp" hidden />');
  $('#folder-banner-file').addEventListener('change', attachFolderBanner);
  $('.new-note').setAttribute('aria-describedby', 'creation-target');
  $('.new-note').insertAdjacentHTML('afterend', '<p id="creation-target" class="creation-target"></p>');
  $('.note-toolbar-actions').insertAdjacentHTML('beforeend', button('link-note', 'Link documentation', 'link'));
  $('#app').insertAdjacentHTML('beforeend', '<div id="folder-menu" class="gn-popover folder-menu" popover role="menu" aria-label="Folder actions"></div>');
  const scope = document.createElement('div');
  scope.id = 'project-scope';
  scope.className = 'project-scope';
  scope.hidden = true;
  $('#main').insertBefore(scope, $('#note-view'));
  document.addEventListener('click', handleClick);
  document.addEventListener('contextmenu', event => {
    const summary = event.target.closest('.tree-folder > summary');
    if (!summary) return;
    event.preventDefault();
    showFolderMenu(summary.parentElement.dataset.folder, summary, event.clientX, event.clientY);
  });
  $('#search').addEventListener('input', event => { query = event.target.value; renderTree(); });
  $('#editor').addEventListener('input', () => updateDraft({ content: $('#editor').value }));
  $('#note-title').addEventListener('input', () => updateDraft({ title: $('#note-title').value.trim() || 'Untitled note' }));
  $('#note-folder').addEventListener('change', () => updateDraft({ folder: $('#note-folder').value }));
  $('#retry-error').addEventListener('click', () => lastRetry?.());
  $('#markdown-files').addEventListener('change', importMarkdown);
  $('#markdown-folder').addEventListener('change', importMarkdown);
  $('#backup-file').addEventListener('change', restoreBackup);
  $('#modal').addEventListener('close', () => (activeDialogTrigger?.isConnected ? activeDialogTrigger : $('#main')).focus());
  document.addEventListener('keydown', handleKeyboard);
  window.addEventListener('beforeunload', event => { if (pending || failedDrafts.size) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('online', renderChrome);
  window.addEventListener('offline', renderChrome);
  window.addEventListener('popstate', readRoute);
  window.addEventListener('hashchange', readRoute);
}

function renderChrome() {
  const active = notes();
  const scoped = scopedNotes();
  if (!selected || !scoped.some(note => note.id === selected)) selected = scoped[0]?.id || null;
  if (creationFolder && !workspace.snapshot.folders.includes(creationFolder) && !active.some(note => note.folder === creationFolder)) creationFolder = null;
  const isTeam = workspace.mode === 'team';
  $('.workspace-shell').classList.toggle('is-home', view === 'home');
  $('.workspace-shell').classList.toggle('is-graph', view === 'graph');
  $('.workspace-shell').classList.toggle('is-folder', view === 'folder');
  $('#folder-view').hidden = view !== 'folder';
  $('#home-view').hidden = view !== 'home';
  $('#workspace-label').textContent = isTeam ? 'Team workspace' : 'Personal workspace';
  $('#vault-name').textContent = folderFilter === null ? (isTeam ? workspace.workspaceName : 'My knowledge garden') : folderFilter || 'Unfiled pages';
  $('#note-count').textContent = `${scoped.length}`;
  const back = $('.sidebar-back');
  back.dataset.action = folderFilter === null ? 'home' : 'all-folders';
  back.setAttribute('aria-label', folderFilter === null ? 'Back to overview' : 'Back to all folders');
  back.innerHTML = `<span aria-hidden="true">←</span>${folderFilter === null ? 'Back to overview' : 'All folders'}`;
  $('#save-status').textContent = pending ? 'Saving on this device…' : failedDrafts.size ? 'Some edits need saving' : workspace.status;
  $('.status-dot').classList.toggle('is-pending', Boolean(pending || failedDrafts.size));
  $('#vault-location').textContent = isTeam ? `${workspace.user?.role || 'Member'} · Team vault` : cloudConnection ? cloudConnection.name : 'Local, by default';
  $('#vault-location-description').textContent = isTeam ? (navigator.onLine ? 'Explicit sync keeps you connected.' : 'Offline · edits stay on this device.') : cloudConnection ? (readonly() ? 'Read-only cloud vault · refresh to update.' : navigator.onLine ? 'Whole personal vault · explicit sync.' : 'Offline · local notes still available.') : 'Your ideas. In your hands.';
  $('#sample-banner').hidden = view === 'home' || view === 'folder' || isTeam || !scoped.some(note => note.id.startsWith('10000000-0000-4000-8000-'));
  if (view === 'home') {
    const config = cloudConfig();
    const returnAction = activeDialogTrigger?.closest('#home-view') ? { ...activeDialogTrigger.dataset } : null;
    renderHome($('#home-view'), {
      snapshot: { ...workspace.snapshot, notes: active }, mode: workspace.mode, online: navigator.onLine,
      configuredProvider: typeof config.clientId === 'string' && config.clientId.trim() && ['google', 'onedrive'].includes(config.provider) ? config.provider : null,
      connectedProvider: cloudConnection?.name === 'Google Drive' ? 'google' : cloudConnection?.name === 'OneDrive' ? 'onedrive' : null,
      readonly: readonly(), bookmarks: projectBookmarks(), icon, folderPreferences: workspace.folderPreferences,
    });
    if (returnAction) activeDialogTrigger = [...$('#home-view').querySelectorAll('[data-action]')].find(control => control.dataset.action === returnAction.action && control.dataset.provider === returnAction.provider) || $('#main');
  }
  $('#project-scope').hidden = view === 'home' || view === 'folder' || folderFilter === null;
  $('#project-scope').innerHTML = folderFilter === null ? '' : `<span>${icon('folder')}<button class="project-scope-folder" data-project="${html(folderFilter)}">${html(folderFilter || 'Unfiled pages')}</button><span>${scoped.length} ${scoped.length === 1 ? 'note' : 'notes'} · Project ${view === 'graph' ? 'graph' : 'notes'}</span></span><button class="gn-btn gn-btn--text" data-action="all-folders"><span aria-hidden="true">←</span>All folders</button>`;
  $('#empty-view h2').textContent = folderFilter === null ? 'No notes yet.' : 'No notes in this project yet.';
  $('#empty-view p').textContent = folderFilter === null ? 'A thought, a question, a little spark. Your next idea can start right here.' : 'Create your first note here. It will stay in this project.';
  document.querySelectorAll('[data-action="new-note"], [data-action="new-folder"], [data-action="new-project"], [data-action="delete-note"], [data-action="link-note"]').forEach(control => { control.disabled = readonly(); });
  for (const [action, target] of [['home', 'home'], ['notes', 'note'], ['graph', 'graph']]) $('.app-rail button[data-action="' + action + '"]').setAttribute('aria-current', view === target ? 'page' : 'false');
  renderTree();
  renderNote();
  if (view === 'folder') renderFolderPage();
}

function renderTree() {
  const active = scopedNotes();
  const filtered = active.filter(note => `${note.title}\n${note.folder}\n${note.content}`.toLowerCase().includes(query.toLowerCase()));
  $('#browser-heading').textContent = query ? `${filtered.length} search results` : 'Your notes';
  const tree = $('#note-tree');
  const previous = new Map([...tree.querySelectorAll('details')].map(item => [item.dataset.folder, item.open]));
  const noteButton = note => `<button class="tree-note ${view === 'note' && note.id === selected ? 'is-selected' : ''}" data-note="${html(note.id)}" ${view === 'note' && note.id === selected ? 'aria-current="page"' : ''}>${icon('notes')}<span>${html(note.title)}</span>${view === 'note' && note.id === selected ? '<span class="current-dot"></span>' : ''}</button>`;
  if (query) {
    tree.innerHTML = `<button class="tree-all" data-action="all-notes">${icon('book')}All notes<span>${notes().length}</span></button>` + (filtered.length ? filtered.map(note => `<div class="search-result">${noteButton(note)}<small>${html(note.folder || 'Vault root')}</small></div>`).join('') : '<p class="sidebar-empty">No notes match your search.<br />Try another word or phrase.</p>');
    return;
  }
  const folders = [...new Set([...workspace.snapshot.folders, ...active.map(note => note.folder).filter(Boolean)])].filter(folder => folderFilter === null || (folderFilter !== '' && projectContains({ folder }, folderFilter))).sort();
  const bookmarks = new Set(projectBookmarks());
  const rootNotes = notes().filter(note => !note.folder);
  tree.innerHTML = `<button class="tree-all" data-action="all-notes">${icon('book')}All notes<span>${notes().length}</span></button><section class="unfiled-pages" aria-label="Unfiled pages"><button class="tree-all unfiled-heading" data-project="" ${view === 'folder' && folderFilter === '' ? 'aria-current="page"' : ''}>${icon('notes')}Unfiled pages<span>${rootNotes.length}</span></button>${rootNotes.map(noteButton).join('') || '<p class="folder-empty">Pages without a folder appear here.</p>'}</section>${folders.map(folder => {
    const children = active.filter(note => note.folder === folder);
    const open = previous.has(folder) ? previous.get(folder) : false;
    return `<details class="tree-folder" data-folder="${html(folder)}" ${open ? 'open' : ''}><summary><button class="folder-toggle" data-action="folder-toggle" aria-label="${open ? 'Collapse' : 'Expand'} ${html(folder)} pages" aria-expanded="${open}"><span class="folder-chevron" aria-hidden="true">›</span></button><button class="folder-open" data-project="${html(folder)}" ${view === 'folder' && folderFilter === folder ? 'aria-current="page"' : ''}>${icon('folder')}<span>${html(folder)}</span></button><small>${children.length}</small><button class="gn-icon-btn folder-favorite" data-bookmark="${html(folder)}" aria-pressed="${bookmarks.has(folder)}" aria-label="${bookmarks.has(folder) ? 'Unfavorite' : 'Favorite'} ${html(folder)}">${icon('star')}</button>${button('folder-menu', `Folder actions for ${html(folder)}`, 'menu', `data-folder="${html(folder)}" aria-haspopup="menu"`)}</summary><div class="folder-notes">${children.map(noteButton).join('') || '<p class="folder-empty">A little room to grow.</p>'}<button class="folder-manage" data-action="manage-folder" data-folder="${html(folder)}" ${readonly() ? 'disabled' : ''}>Manage folder</button></div></details>`;
  }).join('')}${!active.length && !folders.length ? '<p class="sidebar-empty">Your next idea starts with a new note.</p>' : ''}`;
  selectCreationFolder(creationFolder);
}

function selectCreationFolder(folder) {
  creationFolder = folder;
  $('#creation-target').textContent = `New notes in ${folder || 'Vault root'}`;
  document.querySelectorAll('.tree-folder').forEach(item => item.querySelector('summary').classList.toggle('is-folder-selected', item.dataset.folder === folder));
}

function showFolderMenu(folder, trigger, x, y) {
  selectCreationFolder(folder);
  const menu = $('#folder-menu');
  menu.innerHTML = `<span class="gn-eyebrow">${html(folder)}</span><button role="menuitem" data-action="folder-new-note" data-folder="${html(folder)}" ${readonly() ? 'disabled' : ''}>${icon('notes')}New note</button><button role="menuitem" data-action="folder-new-folder" data-folder="${html(folder)}" ${readonly() ? 'disabled' : ''}>${icon('folder')}New folder</button><button role="menuitem" data-bookmark="${html(folder)}">${icon('star')}${projectBookmarks().includes(folder) ? 'Unfavorite folder' : 'Favorite folder'}</button><button role="menuitem" data-action="folder-graph" data-folder="${html(folder)}">${icon('graph')}View linked graph</button>`;
  const rect = trigger.getBoundingClientRect();
  menu.showPopover({ source: trigger });
  menu.style.left = `${Math.max(8, Math.min(x ?? rect.left, innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y ?? rect.bottom, innerHeight - menu.offsetHeight - 8))}px`;
  $('button:not(:disabled)', menu)?.focus({ preventScroll: true });
}

function openGraphFolder(folder) {
  folderFilter = folder;
  creationFolder = folder;
  graphMode = 'notes';
  view = 'graph';
  renderChrome();
  syncRoute();
}

function renderNote() {
  disposeGraph?.();
  disposeGraph = null;
  const note = currentNote();
  $('#note-view').hidden = view !== 'note' || !note;
  $('#empty-view').hidden = view !== 'note' || Boolean(note);
  $('#graph-view').hidden = view !== 'graph';
  $('#context-panel').classList.toggle('has-no-note', view !== 'note' || !note);
  if (view === 'graph') {
    const graphHost = document.createElement('div');
    $('#graph-view').replaceChildren(graphHost);
    disposeGraph = mountGraph(graphHost, notes(), openNote, { folder: folderFilter, folders: workspace.snapshot.folders, mode: graphMode, onFolder: openGraphFolder, onOpenFolder: openProject, onMode: value => { graphMode = value; } });
  }
  if (view !== 'note') return;
  if (!note) { lastRendered = null; return; }
  const changedNote = lastRendered !== note.id;
  if (changedNote) document.querySelectorAll('.context-section').forEach(section => { section.open = false; });
  if (changedNote || document.activeElement !== $('#note-title')) $('#note-title').value = note.title;
  if (changedNote || document.activeElement !== $('#editor')) $('#editor').value = note.content;
  lastRendered = note.id;
  $('#editor').readOnly = readonly();
  $('#note-title').readOnly = readonly();
  $('#note-folder').disabled = readonly();
  $('#role-indicator').hidden = !readonly();
  $('#role-indicator').textContent = readonly() ? permissionNotice() : '';
  $('#breadcrumb').innerHTML = `${icon('folder')}<span>${html(note.folder || 'My knowledge garden')}</span><span class="breadcrumb-separator">/</span><span>${html(note.title)}</span>`;
  $('#note-date').textContent = `Updated ${new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(note.updatedAt || Date.now())}`;
  $('#word-count').textContent = `${note.content.trim().split(/\s+/).filter(Boolean).length} words`;
  const folders = [...new Set(['', ...workspace.snapshot.folders, ...notes().map(item => item.folder)])].sort();
  if (document.activeElement !== $('#note-folder')) $('#note-folder').innerHTML = folders.map(folder => `<option value="${html(folder)}" ${folder === note.folder ? 'selected' : ''}>${html(folder || 'Vault root')}</option>`).join('');
  const displayMode = readonly() ? 'preview' : mode;
  $('.note-content').dataset.mode = displayMode;
  document.querySelectorAll('button[data-mode]').forEach(control => { control.hidden = readonly() && control.dataset.mode !== 'preview'; control.setAttribute('aria-pressed', String(control.dataset.mode === displayMode)); });
  document.querySelectorAll('[data-action="delete-note"], [data-action="link-note"]').forEach(control => { control.hidden = readonly(); });
  clearTimeout(previewTimer);
  previewTimer = setTimeout(renderPreview, changedNote ? 0 : 160);
}

function renderPreview() {
  const note = currentNote();
  if (!note) return;
  const overview = folderOverview([note], note.folder);
  const preference = overview.note ? workspace.folderPreferences[note.folder] : null;
  const banner = preference && Object.hasOwn(preference, 'banner') ? preference.banner : overview.banner;
  renderMarkdown($('#preview'), overview.note ? overview.body : note.content, notes(), note);
  if (banner) {
    const image = document.createElement('img');
    image.className = 'folder-note-banner';
    image.alt = `${note.folder || 'Unfiled pages'} banner`;
    image.src = banner;
    $('#preview').prepend(image);
  }
  $('#outline').innerHTML = extractOutline(note.content).map(heading => `<button class="outline-link" data-heading="${html(heading.id)}" style="--heading-depth:${heading.level - 1}">${html(heading.text)}</button>`).join('') || '<p class="context-empty">Headings give your thoughts a little structure.</p>';
  const edges = buildGraph(notes()).edges;
  const backlinks = notes().filter(item => item.id !== note.id && edges.some(edge => edge.source === item.id && edge.target === note.id));
  const outgoing = notes().filter(item => item.id !== note.id && edges.some(edge => edge.source === note.id && edge.target === item.id));
  const connectionButton = item => `<button class="backlink-note" data-note="${html(item.id)}">${icon('notes')}<span>${html(item.title)}<small>${html(item.folder || 'Vault root')}</small></span><span>↗</span></button>`;
  $('#connection-count').textContent = `${new Set([...backlinks, ...outgoing].map(item => item.id)).size}`;
  $('#backlink-count').textContent = `${backlinks.length}`;
  $('#outgoing-count').textContent = `${outgoing.length}`;
  $('#backlinks').innerHTML = backlinks.map(connectionButton).join('') || '<p class="context-empty">No notes reference this document yet.</p>';
  $('#outgoing-links').innerHTML = outgoing.map(connectionButton).join('') || '<p class="context-empty">Link another document to connect your ideas.</p>';
  const tags = extractTags(note.content);
  $('#tag-count').textContent = `${tags.length}`;
  $('#tag-list').innerHTML = tags.map(tag => `<span class="gn-pill">#${html(tag)}</span>`).join('') || '<p class="context-empty">Add #topic tags to your note.</p>';
  $('#note-footer-label').textContent = `${backlinks.length} backlink${backlinks.length === 1 ? '' : 's'} · ${edges.filter(edge => edge.source === note.id).length} outgoing link${edges.filter(edge => edge.source === note.id).length === 1 ? '' : 's'}`;
}

function syncRoute() {
  const route = new URLSearchParams();
  if (view !== 'home') {
    if (folderFilter !== null) route.set('project', folderFilter);
    if (view === 'graph') route.set('graph', '');
    else if (view === 'folder') route.set('folder', '');
    else if (selected) route.set('note', selected);
    else route.set('notes', '');
  }
  const url = `${location.pathname}${location.search}${route.size ? `#${route}` : ''}`;
  if (url !== `${location.pathname}${location.search}${location.hash}`) history.pushState(null, '', url);
}
function readRoute() {
  const route = new URLSearchParams(location.hash.slice(1));
  folderFilter = route.has('project') ? route.get('project') : null;
  selected = route.get('note');
  const note = currentNote();
  if (note && folderFilter !== null && !projectContains(note, folderFilter)) folderFilter = null;
  creationFolder = folderFilter;
  view = route.has('graph') ? 'graph' : route.has('folder') && folderFilter !== null ? 'folder' : route.has('note') || route.has('notes') || route.has('project') ? 'note' : 'home';
  query = '';
  $('#search').value = '';
  $('.workspace-shell').classList.remove('sidebar-open', 'context-open');
  $('[data-action="sidebar"]').setAttribute('aria-expanded', 'false');
  renderChrome();
  if (route.has('invite') && !$('#modal').open) void teamDialog();
}
function openProject(folder) {
  folderFilter = folder;
  creationFolder = folder;
  selected = null;
  query = '';
  $('#search').value = '';
  view = 'folder';
  $('.workspace-shell').classList.remove('sidebar-open', 'context-open');
  $('[data-action="sidebar"]').setAttribute('aria-expanded', 'false');
  renderChrome();
  syncRoute();
  $('#main').focus();
}
function openNote(id) {
  const note = notes().find(item => item.id === id);
  if (!note) return;
  if (folderFilter !== null && !projectContains(note, folderFilter)) folderFilter = null;
  selected = id;
  view = 'note';
  $('.workspace-shell').classList.remove('sidebar-open', 'context-open');
  $('[data-action="sidebar"]').setAttribute('aria-expanded', 'false');
  renderChrome();
  syncRoute();
}

function renderFolderPage() {
  const overview = folderOverview(notes(), folderFilter);
  const title = folderFilter?.split('/').at(-1) || 'Unfiled pages';
  const page = $('#folder-view');
  const preference = workspace.folderPreferences[folderFilter] || {};
  const banner = Object.hasOwn(preference, 'banner') ? preference.banner : overview.banner;
  page.innerHTML = `
    <header class="folder-page-heading"><div><span class="gn-eyebrow">Folder frontpage</span><p>${html(folderFilter || 'Vault root')}</p></div><button class="gn-btn gn-btn--text" data-action="all-folders"><span aria-hidden="true">←</span>All folders</button></header>
    ${readonly() ? `<p class="permission-notice" role="status">${html(permissionNotice())}</p>` : ''}
    <div class="folder-overview-card"><div class="folder-banner">${banner ? `<img src="${html(banner)}" alt="${html(title)} banner" />` : `<div class="folder-banner-empty">${icon('folder')}<span>A little room for a picture</span></div>`}</div><div class="folder-overview-content"><span class="gn-eyebrow">${scopedNotes().length} ${scopedNotes().length === 1 ? 'note' : 'notes'} · Markdown workspace</span><h1>${html(title)}</h1><div id="folder-overview-body" class="markdown-body folder-overview-copy"></div><div class="folder-overview-actions">${!readonly() ? '<button class="gn-btn gn-btn--primary" data-action="folder-edit">Edit overview</button>' : ''}${overview.note ? `<button class="gn-btn gn-btn--text" data-note="${html(overview.note.id)}">Read full overview →</button>` : ''}</div></div></div>
    <section class="folder-location" aria-labelledby="folder-location-heading">
      <h2 class="gn-heading" id="folder-location-heading">Folder on this device</h2>
      <div class="folder-location-choice"><output id="folder-directory-path" aria-labelledby="folder-location-heading">${preference.directory ? html(preference.directory) : 'No device folder selected'}</output><div class="folder-location-actions"><button class="gn-btn gn-btn--secondary" data-action="folder-directory">${preference.directory ? 'Change' : 'Choose'} device folder</button>${preference.directory ? '<button class="gn-btn gn-btn--text" data-action="folder-directory-clear">Clear location</button>' : ''}</div></div>
      <p class="gn-meta">Private to you on this device. Only the folder name is saved; browsers do not expose the full device path. No files are imported or synced. Cloud folders must be available through your device’s file picker.</p>
    </section>
    <footer class="folder-page-footer"><p>${overview.note ? 'Overview saved in this folder’s README.md.' : 'Add an overview to give this folder a Markdown frontpage.'} Banners chosen here are private to you on this device.</p><div><button class="gn-btn gn-btn--secondary" data-action="folder-banner">${banner ? 'Change' : 'Attach'} banner</button>${banner ? '<button class="gn-btn gn-btn--text" data-action="folder-remove-banner">Remove banner</button>' : ''}${!readonly() ? `<button class="gn-btn gn-btn--secondary" data-action="new-note">${icon('plus')}New note</button>` : ''}<button class="gn-btn gn-btn--secondary" data-action="folder-graph" data-folder="${html(folderFilter || '')}">${icon('graph')}Linked graph</button></div></footer>`;
  const body = $('#folder-overview-body');
  if (overview.body.trim()) renderMarkdown(body, overview.body, notes(), overview.note);
  else body.innerHTML = `<p>${readonly() ? 'No folder overview has been written yet.' : 'Write a little about this folder: what belongs here, where to start, or how its ideas connect. Markdown and document links work here too.'}</p>`;
}

async function saveFolderOverview(folder, body, banner, expected) {
  if (readonly()) throw new Error(permissionNotice());
  const current = folderOverview(notes(), folder);
  if (current.note?.id !== expected.note?.id || current.note?.content !== expected.note?.content) throw new Error('The folder overview changed while you were editing. Keep your text and reopen the editor before saving.');
  const note = { ...current.note, id: current.note?.id || crypto.randomUUID(), title: current.note?.title || 'README', folder, content: withFolderBanner(body, banner), updatedAt: Date.now() };
  await workspace.saveNote(note);
  drafts.delete(note.id);
  failedDrafts.delete(note.id);
  renderChrome();
}

function editFolderOverview() {
  if (readonly()) return;
  const folder = folderFilter;
  const overview = folderOverview(notes(), folder);
  const modal = showDialog('About this folder', folder || 'Unfiled pages', `<form id="folder-overview-form" class="dialog-form"><label class="gn-field">Markdown overview<textarea name="content" rows="10" placeholder="What belongs here? Where should someone start?">${html(overview.body)}</textarea></label><p class="gn-meta">Saved in README.md. Only the first two preview lines are shown; the full overview stays available. Your attached banner is kept separately from this editor.</p><div class="form-actions"><button type="button" class="gn-btn gn-btn--secondary" data-action="close-modal">Cancel</button><button class="gn-btn gn-btn--primary">Save overview</button></div></form>`);
  $('#folder-overview-form', modal).addEventListener('submit', event => {
    event.preventDefault();
    const body = new FormData(event.target).get('content');
    void run(async () => { await saveFolderOverview(folder, body, overview.banner, overview); modal.close(); }, 'Folder overview saved.');
  });
}

async function attachFolderBanner(event) {
  const file = event.target.files[0];
  const target = bannerTarget;
  bannerTarget = null;
  event.target.value = '';
  if (!file || !target) return;
  await run(async () => {
    const banner = await readFolderBanner(file);
    if (target.scope !== bookmarkKey()) throw new Error('The active user changed. Choose the banner again for this user.');
    await workspace.saveFolderPreferences(target.folder, { banner });
  }, 'Personal banner saved on this device.');
}

async function chooseFolderDirectory() {
  const folder = folderFilter;
  const scope = bookmarkKey();
  await run(async () => {
    const directory = await chooseDirectory();
    if (directory === null) return;
    if (scope !== bookmarkKey()) throw new Error('The active user changed. Choose the directory again for this user.');
    await workspace.saveFolderPreferences(folder, { directory });
    notice('Folder location saved on this device. No files imported or synced.');
  });
}

async function persist(note) {
  pending++;
  renderChrome();
  try {
    await workspace.saveNote(note);
    failedDrafts.delete(note.id);
    if (drafts.get(note.id) === note) drafts.delete(note.id);
  } catch (error) {
    failedDrafts.add(note.id);
    report(error, () => persist(drafts.get(note.id) || note));
  } finally { pending--; renderChrome(); }
}
function updateDraft(change) {
  if (readonly()) return;
  const note = currentNote();
  if (!note) return;
  const draft = { ...note, ...change, updatedAt: Date.now() };
  drafts.set(note.id, draft);
  if (folderFilter !== null && !projectContains(draft, folderFilter)) folderFilter = null;
  void persist(draft);
}
function createNote(folder = creationFolder ?? '') {
  if (readonly()) return;
  const existing = notes();
  let title = 'Untitled note';
  let suffix = 2;
  while (existing.some(note => note.title === title && note.folder === folder)) title = `Untitled note ${suffix++}`;
  const note = { id: crypto.randomUUID(), title, folder, content: '', updatedAt: Date.now() };
  creationFolder = folder || null;
  if (folderFilter !== null && !projectContains(note, folderFilter)) folderFilter = null;
  query = '';
  $('#search').value = '';
  drafts.set(note.id, note);
  selected = note.id;
  view = 'note';
  mode = 'edit';
  renderChrome();
  syncRoute();
  $('#note-title').focus();
  $('#note-title').select();
  void persist(note);
}

function linkNoteDialog() {
  const source = currentNote();
  if (!source || readonly()) return;
  const linked = new Set(buildGraph(notes()).edges.filter(edge => edge.source === source.id).map(edge => edge.target));
  const candidates = notes().filter(note => note.id !== source.id && !linked.has(note.id)).sort((a, b) => `${a.folder}/${a.title}`.localeCompare(`${b.folder}/${b.title}`));
  const modal = showDialog('Link documentation', 'Connected ideas', candidates.length ? `<form id="link-note-form" class="dialog-form"><label class="gn-field">Documentation to link<select name="target" required><option value="" disabled selected>Choose a document</option>${candidates.map(note => `<option value="${html(note.id)}">${html(`${note.folder || 'Vault root'} / ${note.title}`)}</option>`).join('')}</select></label><p class="gn-body">Adds a Markdown link to this note. It appears in both documents’ connections and survives export and sync.</p><div class="form-actions"><button class="gn-btn gn-btn--primary">Link document</button></div></form>` : '<p class="gn-body">No other unlinked documents yet. Create another note, then link it here.</p>');
  $('#link-note-form', modal)?.addEventListener('submit', event => {
    event.preventDefault();
    void run(() => {
      const current = currentNote();
      if (current?.id !== source.id) throw new Error('The active document changed. Open Link documentation again.');
      const target = notes().find(note => note.id === new FormData(event.target).get('target'));
      updateDraft({ content: withNoteLink(current, target, notes()) });
      modal.close();
    });
  });
}

function showDialog(title, eyebrow, body, footer = '') {
  const modal = $('#modal');
  if (!modal.open) activeDialogTrigger = document.activeElement;
  modal.setAttribute('aria-label', title);
  modal.innerHTML = `<header><div><span class="gn-eyebrow">${html(eyebrow)}</span><h2 class="gn-title">${html(title)}</h2></div><button class="gn-icon-btn" data-action="close-modal" aria-label="Close dialog">×</button></header><div class="gn-dialog-body">${body}</div>${footer ? `<footer>${footer}</footer>` : ''}`;
  if (!modal.open) modal.showModal();
  return modal;
}
function confirmAction(title, text, label, action) {
  const modal = showDialog(title, 'A moment to make sure', `<p class="gn-body">${html(text)}</p>`, '<button class="gn-btn gn-btn--secondary" data-action="close-modal">Cancel</button><button class="gn-btn gn-btn--primary" id="confirm-action"></button>');
  $('#confirm-action', modal).textContent = label;
  $('#confirm-action', modal).addEventListener('click', () => run(async () => { await action(); modal.close(); }));
}
function folderDialog(folder = null, project = false, parent = null) {
  const modal = showDialog(project ? 'A new home for your ideas' : folder === null ? 'A place for related ideas' : 'Manage folder', project ? 'New project' : 'Keep a little order', `<form id="folder-form" class="dialog-form"><label class="gn-field">${project ? 'Project name' : 'Folder path'}<input name="path" required maxlength="500" placeholder="${project ? 'New beginnings' : 'Projects/Ideas'}" value="${html(folder || '')}" /></label><p class="gn-body">${project ? 'A project is a top-level folder in this vault. Existing notes and other projects will not be moved.' : 'Use a slash for a nested folder, such as Projects/Ideas. Renaming moves all notes inside.'}</p><div class="form-actions">${folder !== null ? '<button type="button" class="gn-btn gn-btn--secondary" id="remove-folder">Delete empty folder</button>' : ''}<button class="gn-btn gn-btn--primary">${project ? 'Create project' : folder === null ? 'Create folder' : 'Rename folder'}</button></div></form>`);
  if (folder === null && parent) $('input[name="path"]', modal).value = `${parent}/`;
  $('#folder-form', modal).addEventListener('submit', event => {
    event.preventDefault();
    const path = new FormData(event.target).get('path').trim();
    const bookmarks = projectBookmarks();
    run(async () => {
      if (project && /[/\\]/.test(path)) throw new Error('Use a name without slashes. Projects are top-level folders.');
      if (folder === null) await workspace.addFolder(path);
      else await workspace.renameFolder(folder, path);
      if (folder !== null && folderFilter !== null && projectContains({ folder: folderFilter }, folder)) folderFilter = path + folderFilter.slice(folder.length);
      if (folder !== null && creationFolder !== null && projectContains({ folder: creationFolder }, folder)) creationFolder = path + creationFolder.slice(folder.length);
      modal.close();
      if (project || folder === null) openProject(path);
      else { renderChrome(); syncRoute(); }
      return true;
    }, project ? 'Project created.' : 'Folder saved.').then(changed => {
      if (changed && folder !== null && bookmarks.some(item => projectContains({ folder: item }, folder))) void run(() => saveProjectBookmarks(bookmarks.map(item => projectContains({ folder: item }, folder) ? path + item.slice(folder.length) : item)));
    });
  });
  $('#remove-folder', modal)?.addEventListener('click', () => {
    const bookmarks = projectBookmarks();
    run(async () => { await workspace.deleteFolder(folder); if (folderFilter === folder) folderFilter = null; if (creationFolder === folder) creationFolder = null; modal.close(); renderChrome(); syncRoute(); return true; }, 'Empty folder deleted.').then(changed => {
      if (changed && bookmarks.some(item => projectContains({ folder: item }, folder))) void run(() => saveProjectBookmarks(bookmarks.filter(item => !projectContains({ folder: item }, folder))));
    });
  });
}

function setTheme(preference) {
  storageSet('herd-theme', preference);
  document.documentElement.dataset.theme = preference === 'system' ? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : preference;
  renderPreview();
}
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (storageGet('herd-theme', 'system') === 'system') setTheme('system'); });

function cloudConfig() {
  try { return JSON.parse(storageGet('herd-cloud-config', '{}')); } catch { return {}; }
}
function settingsDialog(provider = null) {
  const saved = cloudConfig();
  const config = provider && provider !== saved.provider ? { provider } : saved;
  const modal = showDialog('Make yourself at home', 'Workspace settings', `
    <section class="settings-section"><div class="settings-heading"><h3 class="gn-heading">Appearance</h3><span class="gn-meta">A little lighter. A little darker.</span></div><label class="gn-field">Theme<select id="theme-choice">${['system', 'light', 'dark'].map(theme => `<option value="${theme}" ${storageGet('herd-theme', 'system') === theme ? 'selected' : ''}>${theme[0].toUpperCase() + theme.slice(1)}</option>`).join('')}</select></label></section>
    <section class="settings-section"><div class="settings-heading"><h3 class="gn-heading">Your cloud, your choice</h3><span class="gn-pill">Personal vault only</span></div><p class="gn-body">Connect Google Drive or OneDrive to merge the whole personal vault, including all projects, with your own cloud storage. Only one provider can be connected at a time. Nothing is sent until you press Sync. Access tokens stay in memory; reconnect after reopening NitroBison.</p>${workspace.mode === 'team' ? '<p class="gn-notice">Cloud sync is unavailable in a team workspace. Return to your personal vault first.</p>' : ''}
      <form id="cloud-form" class="dialog-form">
        <label class="gn-field">Provider<select name="provider"><option value="google" ${config.provider === 'google' ? 'selected' : ''}>Google Drive</option><option value="onedrive" ${config.provider === 'onedrive' ? 'selected' : ''}>OneDrive</option></select></label>
        <div class="cloud-setup-intro"><b>First time? Start here.</b><p>One person registers an app for this NitroBison address, then copies its public client ID below. An ordinary cloud sign-in is not enough on its own. If someone hosts NitroBison for you, ask them for the client ID. You can keep using local notes without setting up a cloud account.</p></div>
        <details id="google-setup" class="cloud-setup-guide" open><summary>Google Drive — step by step</summary><ol>
          <li>Open <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer">Google Cloud Console</a>. Create or select a project, then find <b>APIs &amp; Services → Library</b> and enable <b>Google Drive API</b>.</li>
          <li>Open <b>Google Auth Platform</b>. Complete <b>Branding</b> with an app name and contact email. For a personal Gmail account, choose an <b>External</b> audience and add your Google email under <b>Test users</b> while testing. <b>Internal</b> is for users in your own Google Workspace organization.</li>
          <li>Under <b>Data Access</b>, add only this scope: <code>https://www.googleapis.com/auth/drive.file</code>. This allows NitroBison's app-authorized vault, not every file in your Drive.</li>
          <li>Under <b>Clients</b>, create an OAuth client of type <b>Web application</b>. Add this exact <b>Authorized JavaScript origin</b>: <code class="setup-value">${html(location.origin)}</code>Google does not use the Microsoft callback below. Do not add a path to the origin.</li>
          <li>Copy the <b>Client ID</b> ending in <code>.apps.googleusercontent.com</code> into the field below. Do not copy a client secret or upload a credentials file.</li>
          <li>Press <b>Connect account</b>, allow the sign-in popup, and choose your Google account. Then press <b>Sync personal vault</b> to merge your notes. Nothing uploads just because you connect.</li>
        </ol><p>Work/Workspace accounts may need an administrator to approve this app. Testing is not the same as publishing an app for everyone.</p></details>
        <details id="onedrive-setup" class="cloud-setup-guide" open hidden><summary>OneDrive — step by step</summary><ol>
          <li>Open <a href="https://entra.microsoft.com/" target="_blank" rel="noopener noreferrer">Microsoft Entra admin center</a>, then <b>App registrations → New registration</b>. If you cannot register an app, ask your administrator or NitroBison host to do this part.</li>
          <li>Name it <b>NitroBison</b>. Personal Microsoft accounts are the documented target for this permission. Choose <b>Personal Microsoft accounts only</b> for that setup, or <b>Accounts in any organizational directory and personal Microsoft accounts</b> for a mixed registration. Work/school sign-in does not guarantee app-folder access; Microsoft's documentation conflicts.</li>
          <li>In <b>Authentication → Add a platform</b>, select <b>Single-page application</b>, not Web. Add this exact redirect URI: <code class="setup-value">${html(location.origin)}/oauth-callback.html</code>If the portal rejects an HTTP <code>127.0.0.1</code> callback, ask your host to register it using Microsoft's documented manifest procedure. Do not change hostnames without backing up your local notes: <code>localhost</code> has separate storage.</li>
          <li>In <b>API permissions → Add a permission → Microsoft Graph → Delegated permissions</b>, add <code>Files.ReadWrite.AppFolder</code>. Do not choose Application permissions or create a client secret. Your organization may require administrator consent.</li>
          <li>Return to the app's <b>Overview</b> and copy its <b>Application (client) ID</b> into the field below. Set the tenant to <code>consumers</code> for personal-only, <code>common</code> for a mixed registration, or your Directory (tenant) ID for a single organization. Work/school app-folder sync is unverified and may be blocked by tenant policy.</li>
          <li>Press <b>Connect account</b>, finish Microsoft sign-in, then press <b>Sync personal vault</b>. OneDrive needs to be provisioned for that account. The vault is stored in this app's folder, not an arbitrary SharePoint or Teams library.</li>
        </ol></details>
        <label class="gn-field">Public application client ID<input name="clientId" required value="${html(config.clientId || '')}" autocomplete="off" placeholder="Paste the client ID from your app registration" /></label>
        <label id="microsoft-tenant-field" class="gn-field" hidden>Microsoft tenant<input name="tenant" value="${html(config.tenant || 'common')}" placeholder="common" disabled /><span class="gn-meta"><code>consumers</code>: personal-only; <code>common</code>: mixed sign-in; <code>organizations</code> or tenant ID: work/school sign-in. Match the registration. Work/school app-folder access is unverified; sign-in alone is not proof of sync support.</span></label>
        <p class="gn-meta">Connect while online and allow popups. Client IDs are public identifiers, not passwords. Tokens stay in memory: reconnect after reopening NitroBison. Sync covers the whole personal vault; it does not browse arbitrary shared/team drives.</p>
        <div class="form-actions"><button class="gn-btn gn-btn--secondary" ${workspace.mode === 'team' ? 'disabled' : ''}>${cloudConnection ? 'Reconnect account' : 'Connect account'}</button></div>
      </form>
      <div class="cloud-connected"><p class="gn-body" id="cloud-state">${cloudConnection ? workspace.mode === 'team' ? `Personal ${html(cloudConnection.name)} connection is paused in the team vault.` : readonly() ? `${html(cloudConnection.name)} vault is read-only. Refresh reads cloud changes without uploading; local copies are retained.` : navigator.onLine ? `Connected to ${html(cloudConnection.name)} this session. Ready for an explicit whole-vault sync.` : `${html(cloudConnection.name)} is offline. Local notes remain available.` : 'No cloud account connected. Saved configuration does not sign you in.'}</p><div class="form-actions"><button class="gn-btn gn-btn--primary" id="sync-cloud" ${!cloudConnection || workspace.mode === 'team' || !navigator.onLine ? 'disabled' : ''}>${readonly() ? 'Refresh read-only vault' : 'Sync personal vault'}</button><button class="gn-btn gn-btn--secondary" id="disconnect-cloud" ${!cloudConnection ? 'disabled' : ''}>Disconnect</button></div></div>
    </section>
    <section class="settings-section"><div class="settings-heading"><h3 class="gn-heading">Take your ideas with you</h3></div><p class="gn-body">Markdown files are portable. A JSON backup also preserves folders and note IDs. Import adds notes; restore replaces the current vault after making a recovery backup.</p>
      <div class="settings-buttons"><button class="gn-btn gn-btn--secondary" data-action="import-md" ${readonly() ? 'disabled' : ''}>Import Markdown files</button><button class="gn-btn gn-btn--secondary" data-action="import-folder" ${readonly() || !('webkitdirectory' in document.createElement('input')) ? 'disabled' : ''}>Import Markdown folder</button><button class="gn-btn gn-btn--secondary" data-action="export-vault" ${!('showDirectoryPicker' in window) ? 'disabled aria-describedby="folder-export-help"' : ''}>Export Markdown folder</button><button class="gn-btn gn-btn--secondary" data-action="export-note" ${!currentNote() ? 'disabled' : ''}>Download current note</button><button class="gn-btn gn-btn--secondary" data-action="backup">Download JSON backup</button><button class="gn-btn gn-btn--secondary" data-action="restore" ${readonly() ? 'disabled' : ''}>Restore JSON backup</button></div>
      <p class="gn-meta" id="folder-export-help">Folder export is available in browsers with directory access, such as desktop Chrome and Edge. In other browsers, download individual Markdown notes or a complete JSON backup. Select an empty destination folder to avoid replacing existing files.</p>
    </section>
    <section class="settings-section"><h3 class="gn-heading">Keep NitroBison close</h3><p class="gn-body">Install NitroBison as an app for a focused window and offline access. Browser storage can be cleared; keep an occasional backup.</p><button class="gn-btn gn-btn--secondary" data-action="install">${icon('download')}Install / installation help</button></section>`);
  $('#theme-choice', modal).addEventListener('change', event => setTheme(event.target.value));
  const providerChoice = $('#cloud-form [name="provider"]', modal);
  const updateProviderSetup = () => {
    const microsoft = providerChoice.value === 'onedrive';
    $('#google-setup', modal).hidden = microsoft;
    $('#onedrive-setup', modal).hidden = !microsoft;
    $('#microsoft-tenant-field', modal).hidden = !microsoft;
    $('[name="tenant"]', modal).disabled = !microsoft;
  };
  providerChoice.addEventListener('change', updateProviderSetup);
  updateProviderSetup();
  $('#cloud-form', modal).addEventListener('submit', event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    storageSet('herd-cloud-config', JSON.stringify(values));
    renderChrome();
    const submit = $('button', event.target);
    submit.disabled = true;
    $('#cloud-state').textContent = 'Connecting… Complete sign-in in the provider window.';
    run(async () => {
      const connection = await connectCloud(values);
      cloudConnection?.disconnect();
      cloudConnection = connection;
      if ($('#modal').open) settingsDialog();
      renderChrome();
    }).finally(() => { renderChrome(); if (submit.isConnected) { submit.disabled = false; if (!cloudConnection && $('#cloud-state')) $('#cloud-state').textContent = 'Not connected. Check the error message and try again.'; } });
  });
  $('#sync-cloud', modal).addEventListener('click', event => {
    const control = event.currentTarget;
    control.disabled = true;
    $('#cloud-state').textContent = 'Syncing… Local and cloud edits are being merged.';
    run(async () => { await workspace.syncCloud(cloudConnection); if ($('#modal').open) settingsDialog(); renderChrome(); }, 'Cloud refresh complete.').finally(() => { if (control.isConnected) control.disabled = false; });
  });
  $('#disconnect-cloud', modal).addEventListener('click', () => { cloudConnection.disconnect(); cloudConnection = null; settingsDialog(); renderChrome(); notice('Cloud disconnected. Your local notes are unchanged.'); });
}

function teamForm(type) {
  const inviteToken = new URLSearchParams(location.hash.slice(1)).get('invite');
  const setup = type === 'setup';
  const invite = type === 'invite';
  return `<form id="team-form" class="dialog-form" data-kind="${type}">${setup ? '<label class="gn-field">Server setup token<input name="setupToken" required autocomplete="off" /></label><label class="gn-field">Workspace name<input name="workspaceName" required maxlength="100" placeholder="Our knowledge garden" /></label>' : ''}${invite ? `<label class="gn-field">Invitation token<input name="token" required value="${html(inviteToken || '')}" autocomplete="off" /></label>` : ''}${setup || invite ? '<label class="gn-field">Your name<input name="name" required maxlength="100" autocomplete="name" /></label>' : ''}<label class="gn-field">Email<input name="email" type="email" required autocomplete="email" /></label><label class="gn-field">Password<input name="password" type="password" required minlength="12" autocomplete="${setup || invite ? 'new-password' : 'current-password'}" /></label><p class="gn-meta">${setup || invite ? 'Use at least 12 characters. ' : ''}Joining opens an isolated team vault. Your personal notes stay private on this device and are never uploaded automatically.</p><button class="gn-btn gn-btn--primary">${setup ? 'Create team workspace' : invite ? 'Accept invitation' : 'Sign in to team'}</button></form>`;
}

async function teamDialog() {
  const modal = showDialog('A shared place to think', 'Team workspace', '<div class="gn-state" role="status"><b>Checking this server…</b><p>Your personal notes remain available while we connect.</p></div>');
  if (workspace.mode === 'team') { renderTeamDetails(modal); return; }
  try {
    const info = await workspace.serverInfo();
    if (!modal.open) return;
    const hasInvite = new URLSearchParams(location.hash.slice(1)).has('invite');
    $('.gn-dialog-body', modal).innerHTML = `<p class="gn-body">${html(info.workspaceName || 'NitroBison team')} · Invite-only collaboration on this server.</p><div class="team-tabs" role="group" aria-label="Team access"><button class="gn-chip" data-team-tab="login" aria-pressed="${!hasInvite && !info.setupRequired}">Sign in</button><button class="gn-chip" data-team-tab="invite" aria-pressed="${hasInvite}">Accept invitation</button>${info.setupRequired ? `<button class="gn-chip" data-team-tab="setup" aria-pressed="${!hasInvite}">Set up server</button>` : ''}</div><div id="team-form-host">${teamForm(hasInvite ? 'invite' : info.setupRequired ? 'setup' : 'login')}</div>`;
    function bind() {
      $('#team-form', modal).addEventListener('submit', event => {
        event.preventDefault();
        const values = Object.fromEntries(new FormData(event.target));
        const kind = event.target.dataset.kind;
        const control = $('button', event.target);
        control.disabled = true;
        control.textContent = 'Opening team vault…';
        run(async () => {
          if (pending || failedDrafts.size) throw new Error('Save or retry your pending personal edits before switching workspaces.');
          if (kind === 'setup') await workspace.setup(values);
          else if (kind === 'invite') await workspace.acceptInvite(values);
          else await workspace.login(values);
          drafts.clear(); selected = null; lastRendered = null; folderFilter = null; creationFolder = null; view = 'home';
          history.replaceState(null, '', location.pathname + location.search);
          renderChrome();
          renderTeamDetails(modal);
        }).finally(() => { if (control.isConnected) { control.disabled = false; control.textContent = kind === 'setup' ? 'Create team workspace' : kind === 'invite' ? 'Accept invitation' : 'Sign in to team'; } });
      });
    }
    bind();
    modal.querySelectorAll('[data-team-tab]').forEach(control => control.addEventListener('click', () => {
      modal.querySelectorAll('[data-team-tab]').forEach(tab => tab.setAttribute('aria-pressed', String(tab === control)));
      $('#team-form-host', modal).innerHTML = teamForm(control.dataset.teamTab);
      bind();
    }));
  } catch (error) {
    if (!modal.open) return;
    $('.gn-dialog-body', modal).innerHTML = `<div class="gn-error" role="alert">We couldn’t connect to a collaboration server. ${html(error.message)} Your personal vault still works offline.</div><button id="retry-team" class="gn-btn gn-btn--secondary">Try again</button><p class="gn-body">Team features require the NitroBison container server. A static-only deployment supports the personal vault and cloud sync.</p>`;
    $('#retry-team').addEventListener('click', teamDialog);
  }
}

function renderTeamDetails(modal) {
  const owner = workspace.user?.role === 'owner';
  $('.gn-dialog-body', modal).innerHTML = `<div class="team-identity"><div><h3 class="gn-heading">${html(workspace.workspaceName)}</h3><p class="gn-body">${html(workspace.user?.name)} · ${html(workspace.user?.email)}</p></div><span class="gn-pill">${html(workspace.user?.role)}</span></div><p class="gn-notice">${readonly() ? 'You have read-only access. You can read, search and export, but cannot change team notes.' : 'Changes save on this device first. Press Sync to fetch and merge team edits; offline changes remain pending until a successful sync.'}</p><div class="form-actions"><button id="sync-team" class="gn-btn gn-btn--primary">Sync team vault</button><button id="leave-team" class="gn-btn gn-btn--secondary">Return to personal vault</button></div><p id="team-sync-state" class="gn-body" role="status">${html(workspace.status)}</p>${owner ? '<section class="settings-section"><h3 class="gn-heading">Invite a collaborator</h3><form id="invite-form" class="dialog-form"><label class="gn-field">Email<input name="email" type="email" required /></label><label class="gn-field">Role<select name="role"><option value="editor">Editor — can write notes</option><option value="viewer">Viewer — read only</option></select></label><button class="gn-btn gn-btn--secondary">Create invitation</button></form><div id="invite-result"></div></section><section class="settings-section"><div class="settings-heading"><h3 class="gn-heading">Workspace members</h3><button id="refresh-members" class="gn-btn gn-btn--text">Refresh</button></div><div id="members-list" role="status">Loading members…</div></section>' : ''}`;
  $('#sync-team', modal).addEventListener('click', event => {
    const control = event.currentTarget;
    control.disabled = true;
    $('#team-sync-state').textContent = 'Syncing team changes…';
    run(async () => { await workspace.sync(); $('#team-sync-state').textContent = workspace.status; }, 'Team sync complete.').finally(() => { control.disabled = false; });
  });
  $('#leave-team', modal).addEventListener('click', () => run(async () => {
    if (pending || failedDrafts.size) throw new Error('Wait for local saves or retry failed edits before leaving the team vault.');
    await workspace.leaveTeam(); drafts.clear(); selected = null; lastRendered = null; folderFilter = null; creationFolder = null; view = 'home'; modal.close(); renderChrome(); syncRoute();
  }, 'Personal vault reopened. Team notes were not copied into it.'));
  if (!owner) return;
  $('#invite-form', modal).addEventListener('submit', event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    const control = $('button', event.target);
    control.disabled = true;
    run(async () => {
      const result = await workspace.invite(values);
      const url = result.url || `${location.origin}/#invite=${encodeURIComponent(result.token)}`;
      $('#invite-result').innerHTML = `<p class="gn-success">Invitation created for ${html(values.email)}.</p><label class="gn-field">Share this private invitation link<input id="invite-link" readonly value="${html(url)}" /></label><p class="gn-meta">Expires ${html(new Date(result.expiresAt).toLocaleString())}. This email-bound link can be used once. No email was sent automatically.</p><button id="copy-invite" class="gn-btn gn-btn--secondary">Copy invitation link</button>`;
      $('#copy-invite').addEventListener('click', () => run(async () => { await navigator.clipboard.writeText(url); notice('Invitation link copied.'); }));
    }).finally(() => { control.disabled = false; });
  });
  $('#refresh-members').addEventListener('click', loadMembers);
  void loadMembers();
}

async function loadMembers() {
  const target = $('#members-list');
  if (!target) return;
  target.innerHTML = '<p class="gn-body" role="status">Loading members…</p>';
  try {
    const members = await workspace.members();
    if (!target.isConnected) return;
    target.innerHTML = members.length ? members.map(member => `<div class="member-row"><div><b>${html(member.name)}</b><small>${html(member.email)}</small></div><span class="gn-pill">${html(member.role)}</span>${member.id !== workspace.user.id ? `<button class="gn-btn gn-btn--secondary" data-remove-member="${html(member.id)}">Remove</button>` : '<span class="gn-meta">You</span>'}</div>`).join('') : '<p class="gn-body">No members found.</p>';
    target.querySelectorAll('[data-remove-member]').forEach(control => control.addEventListener('click', () => {
      const member = members.find(item => item.id === control.dataset.removeMember);
      confirmAction('Remove workspace member?', `${member.name || member.email} will lose access and their active sessions will be revoked.`, 'Remove member', async () => { await workspace.removeMember(member.id); });
    }));
  } catch (error) {
    if (!target.isConnected) return;
    target.innerHTML = `<p class="gn-error" role="alert">We couldn’t load members. ${html(error.message)}</p><button class="gn-btn gn-btn--secondary" id="retry-members">Try again</button>`;
    $('#retry-members').addEventListener('click', loadMembers);
  }
}

async function importMarkdown(event) {
  const files = [...event.target.files];
  event.target.value = '';
  if (readonly() || !files.length) return;
  await run(async () => {
    const imported = await importMarkdownFiles(files);
    const count = await workspace.importNotes(imported.notes, imported.folders);
    notice(`${count} Markdown note${count === 1 ? '' : 's'} imported. Existing notes were not overwritten.`);
  });
}
async function restoreBackup(event) {
  const file = event.target.files[0];
  event.target.value = '';
  if (!file || readonly()) return;
  await run(async () => {
    const snapshot = JSON.parse(await file.text());
    confirmAction('Restore this backup?', 'This replaces the current vault. A recovery backup is kept on this device, and a download of the current vault will be made first.', 'Back up and restore', async () => {
      download(`nitrobison-before-restore-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await workspace.exportSnapshot(), null, 2), 'application/json');
      await workspace.replaceSnapshot(snapshot);
      drafts.clear(); selected = null; lastRendered = null; folderFilter = null; creationFolder = null; renderChrome(); syncRoute(); notice('Backup restored.');
    });
  });
}

async function exportMarkdownFolder() {
  const count = await exportFolder(await workspace.exportSnapshot());
  notice(`Exported ${count} Markdown files to the selected folder. Existing differing files were not overwritten.`);
}

async function handleClick(event) {
  const bookmarkControl = event.target.closest('[data-bookmark]');
  if (bookmarkControl) {
    event.preventDefault();
    if (bookmarkControl.closest('#folder-menu')) $('#folder-menu').hidePopover();
    const folder = bookmarkControl.dataset.bookmark;
    const bookmarks = projectBookmarks();
    void run(() => saveProjectBookmarks(bookmarks.includes(folder) ? bookmarks.filter(item => item !== folder) : [...bookmarks, folder]));
    return;
  }
  const projectControl = event.target.closest('[data-project]');
  if (projectControl) { event.preventDefault(); openProject(projectControl.dataset.project); return; }
  const noteControl = event.target.closest('[data-note]');
  if (noteControl && !event.target.closest('.graph-view')) { event.preventDefault(); openNote(noteControl.dataset.note); return; }
  const modeControl = event.target.closest('button[data-mode]');
  if (modeControl) { if (readonly() && modeControl.dataset.mode !== 'preview') return; mode = modeControl.dataset.mode; renderNote(); return; }
  const headingControl = event.target.closest('[data-heading]');
  if (headingControl) {
    if (mode === 'edit') { mode = 'preview'; renderNote(); }
    requestAnimationFrame(() => { const heading = document.getElementById(headingControl.dataset.heading); heading?.scrollIntoView({ block: 'start' }); heading?.setAttribute('tabindex', '-1'); heading?.focus({ preventScroll: true }); });
    return;
  }
  const folderSummary = event.target.closest('.tree-folder > summary');
  if (folderSummary && !event.target.closest('button')) { event.preventDefault(); openProject(folderSummary.parentElement.dataset.folder); return; }
  const control = event.target.closest('[data-action]');
  if (!control || control.disabled) return;
  const action = control.dataset.action;
  if (control.closest('#folder-menu')) $('#folder-menu').hidePopover();
  if (action === 'home') { event.preventDefault(); view = 'home'; folderFilter = null; creationFolder = null; $('.workspace-shell').classList.remove('sidebar-open', 'context-open'); $('[data-action="sidebar"]').setAttribute('aria-expanded', 'false'); renderChrome(); syncRoute(); $('#main').focus(); }
  else if (action === 'notes') { folderFilter = null; creationFolder = null; query = ''; $('#search').value = ''; view = 'note'; renderChrome(); syncRoute(); }
  else if (action === 'graph') { view = 'graph'; $('.workspace-shell').classList.remove('sidebar-open', 'context-open'); $('[data-action="sidebar"]').setAttribute('aria-expanded', 'false'); renderChrome(); syncRoute(); }
  else if (action === 'sidebar') { const opened = $('.workspace-shell').classList.toggle('sidebar-open'); control.setAttribute('aria-expanded', String(opened)); if (opened) $('#search').focus(); }
  else if (action === 'note-details') { const opened = $('.workspace-shell').classList.toggle('context-open'); document.querySelectorAll('[data-action="note-details"]').forEach(item => item.setAttribute('aria-expanded', String(opened))); }
  else if (action === 'new-note') createNote();
  else if (action === 'folder-toggle') {
    event.preventDefault();
    const folder = control.closest('.tree-folder');
    folder.open = !folder.open;
    control.setAttribute('aria-expanded', String(folder.open));
    control.setAttribute('aria-label', `${folder.open ? 'Collapse' : 'Expand'} ${folder.dataset.folder} pages`);
  }
  else if (action === 'folder-edit' && view === 'folder') editFolderOverview();
  else if (action === 'folder-directory' && view === 'folder') void chooseFolderDirectory();
  else if (action === 'folder-directory-clear' && view === 'folder') await run(() => workspace.saveFolderPreferences(folderFilter, { directory: null }), 'Device folder location cleared.');
  else if (action === 'folder-banner' && view === 'folder') { bannerTarget = { folder: folderFilter, scope: bookmarkKey() }; $('#folder-banner-file').click(); }
  else if (action === 'folder-remove-banner' && view === 'folder') await run(() => workspace.saveFolderPreferences(folderFilter, { banner: null }), 'Banner hidden for you on this device.');
  else if (action === 'folder-menu') { event.preventDefault(); showFolderMenu(control.dataset.folder, control); }
  else if (action === 'folder-new-note') createNote(control.dataset.folder);
  else if (action === 'folder-new-folder' && !readonly()) folderDialog(null, false, control.dataset.folder);
  else if (action === 'folder-graph') openGraphFolder(control.dataset.folder);
  else if (action === 'link-note') linkNoteDialog();
  else if (action === 'new-folder' && !readonly()) folderDialog(null, false, creationFolder);
  else if (action === 'new-project' && !readonly()) folderDialog(null, true);
  else if (action === 'manage-folder' && !readonly()) folderDialog(control.dataset.folder);
  else if (action === 'all-notes' || action === 'all-folders') {
    folderFilter = null; creationFolder = null; query = ''; view = 'note'; $('#search').value = '';
    if (action === 'all-folders') {
      $('.workspace-shell').classList.add('sidebar-open');
      $('[data-action="sidebar"]').setAttribute('aria-expanded', 'true');
    }
    renderChrome(); syncRoute();
    if (action === 'all-folders') $('#search').focus();
  }
  else if (action === 'settings') settingsDialog(control.dataset.provider);
  else if (action === 'team') void teamDialog();
  else if (action === 'close-modal') $('#modal').close();
  else if (action === 'dismiss-error') $('#error-banner').hidden = true;
  else if (action === 'delete-note' && currentNote() && !readonly()) { const note = currentNote(); confirmAction('Let this note go?', `Delete “${note.title}”? It will also be deleted from connected vaults on your next sync. Keep a backup if you may want it later.`, 'Delete note', async () => { await workspace.deleteNote(note.id); drafts.delete(note.id); failedDrafts.delete(note.id); selected = null; renderChrome(); }); }
  else if (action === 'export-note' && currentNote()) { const note = currentNote(); download(`${filename(note.title)}.md`, note.content, 'text/markdown;charset=utf-8'); notice('Markdown note exported.'); }
  else if (action === 'import-md') $('#markdown-files').click();
  else if (action === 'import-folder') $('#markdown-folder').click();
  else if (action === 'restore') $('#backup-file').click();
  else if (action === 'backup') await run(async () => { download(`nitrobison-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await workspace.exportSnapshot(), null, 2), 'application/json'); notice('JSON backup downloaded.'); });
  else if (action === 'export-vault') await run(exportMarkdownFolder);
  else if (action === 'install') await run(async () => { const message = await installApp(); if (message) showDialog('Keep your ideas close', 'Install NitroBison', `<p class="gn-body">${html(message)}</p><p class="gn-body">Chrome or Edge: open the browser menu and choose Install NitroBison or Install this page as an app. Safari on iPhone/iPad: Share → Add to Home Screen. Safari on Mac: File → Add to Dock.</p><p class="gn-notice">Offline use is available after the app has finished caching. Keep backups: uninstalling or clearing browser data can remove local notes.</p>`); });
}
function handleKeyboard(event) {
  const summary = event.target.closest('.tree-folder > summary');
  if (summary && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) { event.preventDefault(); showFolderMenu(summary.parentElement.dataset.folder, summary); return; }
  const menu = event.target.closest('#folder-menu');
  if (menu) {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const items = [...menu.querySelectorAll('button:not(:disabled)')];
      const index = items.indexOf(document.activeElement);
      items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (event.key === 'Tab') menu.hidePopover();
    return;
  }
  if (!(event.metaKey || event.ctrlKey)) {
    if (event.key === 'Escape' && $('.workspace-shell').classList.contains('sidebar-open')) { $('.workspace-shell').classList.remove('sidebar-open'); $('[data-action="sidebar"]').setAttribute('aria-expanded', 'false'); $('[data-action="sidebar"]').focus(); }
    return;
  }
  if (event.key.toLowerCase() === 's') { event.preventDefault(); if (failedDrafts.size) [...failedDrafts].forEach(id => persist(drafts.get(id))); else notice(pending ? 'Your edits are saving on this device.' : workspace.status); }
  if (event.key.toLowerCase() === 'k') { event.preventDefault(); if ($('#modal').open) $('#modal').close(); if (view === 'home') { view = 'note'; renderChrome(); syncRoute(); } $('.workspace-shell').classList.add('sidebar-open'); $('[data-action="sidebar"]').setAttribute('aria-expanded', 'true'); $('#search').focus(); $('#search').select(); }
  if (event.key.toLowerCase() === 'n' && !$('#modal').open) { event.preventDefault(); createNote(); }
}

async function start() {
  try {
    workspace = await openWorkspace();
    buildShell();
    workspace.subscribe(renderChrome);
    readRoute();
    registerOffline(message => { if (message) notice(message); });
  } catch (error) {
    $('#app').innerHTML = `<main class="startup"><img src="/logo.jpg" alt="NitroBison" width="64" height="64" /><h1>Your ideas are still yours.</h1><p role="alert">We couldn’t open the local vault. ${html(error.message)}</p><p>Check that browser storage is enabled and there is free space on this device. Existing data has not been deliberately cleared.</p><button class="gn-btn gn-btn--primary" id="retry-start">Try again</button></main>`;
    $('#retry-start').addEventListener('click', () => location.reload());
  }
}
void start();
