import './fb-tokens.css';
import './fb-components.css';
import './styles.css';
import './views.css';
import './list-database.css';
import './ai-chat.css';
import './modern-write.css';
import './graph-filter.css';
import { openWorkspace } from './workspace.js';
import { connectCloud, importMarkdownFiles, exportMarkdownFolder as exportFolder } from './cloud.js';
import { installApp, registerOffline } from './install.js';
import { renderMarkdown } from './markdown.js';
import { buildGraph, mountGraph } from './graph.js';
import { escapeHtml, extractOutline, extractTags, withNoteLink, referenceOccurrences, tagOccurrences } from './markdown-model.js';
import { projectContains, storageOverview } from './projects.js';
import { folderOverview, withFolderBanner, readFolderBanner } from './folders.js';
import { renderHome } from './home.js';
import { chooseDirectory } from './directory.js';
import { isFolderHidden } from './folder-preferences.js';
import { findAICommand, generateAI, testAIConnection, validateAIConfig, isAIConfigured } from './ai.js';
import { readAISettings, writeAISettings } from './ai-settings.js';
import { version as APP_VERSION } from '../package.json';
import { AI_PROVIDER_CATALOG, createAIChatController } from './ai-chat.js';
import { readProperties, withProperties, propertiesBody, withPropertiesBody, NOTE_STATUSES, statusLabel, addDays } from './collections.js';
import { renderCollections, NOTE_LAYOUTS, todayDate } from './views.js';
import { findListCommand, insertListDatabaseMarkdown, updateListDatabaseBlock } from './list-database.js';
import { mountTitlebar } from './titlebar.js';
import { mountModernWrite } from './modern-write.js';

const $ = (selector, root = document) => root.querySelector(selector);
const icons = {
  home: '<path d="m3 10 9-7 9 7v10a2 2 0 0 1-2 2h-4v-6h-6v6H5a2 2 0 0 1-2-2z"/>',
  graph: '<circle cx="6" cy="6" r="2.5"/><circle cx="18" cy="6" r="2.5"/><circle cx="12" cy="18" r="2.5"/><path d="M8.2 7.2 10.8 15.8M15.8 7.2 13.2 15.8M8.5 6h7"/>',
  views: '<rect x="3" y="4" width="7" height="7" rx="1.5"/><rect x="14" y="4" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="6" rx="1.5"/><rect x="14" y="14" width="7" height="6" rx="1.5"/>',
  download: '<path d="M12 3v12m0 0-4-4m4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h.1a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v.1a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  'new-page': '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  device: '<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8m-4-4v4"/>',
  star: '<path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-2.9-5.6 2.9 1.1-6.2L3 9.6l6.2-.9z"/>',
  notes: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6M8 13h8M8 17h5"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  folder: '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7z"/>',
  'folder-plus': '<path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h3a2 2 0 0 1 2 2v3M3 7v12a2 2 0 0 0 2 2h7M19 13v8m-4-4h8"/>',
  cloud: '<path d="M7 18a5 5 0 1 1 1-10 7 7 0 0 1 13 3 4 4 0 0 1-1 8H7z"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  panel: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M15 3v18"/>',
  trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7"/>',
  book: '<path d="M12 5c-3-2-7-2-10-1v15c3-1 7-1 10 1 3-2 7-2 10-1V4c-3-1-7-1-10 1zm0 0v15"/>',
  link: '<path d="M10 13a5 5 0 0 0 7 0l3-3a5 5 0 0 0-7-7l-2 2M14 11a5 5 0 0 0-7 0l-3 3a5 5 0 0 0 7 7l2-2"/>',
  hash: '<path d="M4 9h16M3 15h16M10 3 6 21M18 3l-4 18"/>',
  ai: '<path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5z"/>',
  hide: '<path d="m3 3 18 18M10.6 10.6a2 2 0 0 0 2.8 2.8M9 5.3A12 12 0 0 1 12 5c6 0 9 7 9 7a19 19 0 0 1-3 3.8M6.2 6.2A20 20 0 0 0 3 12s3 7 9 7a12 12 0 0 0 5.8-1.6"/>',
  table: '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M3 15h18M9 3v18"/>',
  timeline: '<path d="M7 3v18M3 7h12M11 12h10M7 17h10"/>',
  gallery: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1"/><path d="m3 17 6-6 4 4 3-3 5 5"/>',
  list: '<path d="M8 6h13M8 12h13M8 18h13"/><circle cx="3" cy="6" r="1"/><circle cx="3" cy="12" r="1"/><circle cx="3" cy="18" r="1"/>',
  close: '<path d="m6 6 12 12M6 18 18 6"/>',
  workspace: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M9 4v16M13 9h5M13 13h4"/>',
  check: '<path d="m5 12 5 5L20 7"/>',
  chevrons: '<path d="m8 9 4-4 4 4M8 15l4 4 4-4"/>',
  edit: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  expand: '<path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>',
  collapse: '<path d="M4 14h6v6M20 10h-6V4M14 10l7-7M3 21l7-7"/>',
};
const icon = name => `<svg class="fb-icon" viewBox="0 0 24 24" aria-hidden="true">${icons[name] || icons.notes}</svg>`;
const button = (action, label, name, extra = '') => `<button class="fb-icon-btn" data-action="${action}" aria-label="${label}" title="${label}" ${extra}>${icon(name)}</button>`;
const html = escapeHtml;
const nativeDesktop = window.nitrobisonDesktop?.isDesktop ? window.nitrobisonDesktop : null;
const sidebarDesktop = matchMedia('(min-width: 901px)');
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
let draggedNote = null;
let dropTarget = null;
let popoverTrigger = null;
let aiSettings = { endpoint: '', model: '', apiKey: '', remember: false };
let aiRequest = null;
let noticeTimer;
let aiFeedbackTimer;
const deviceFolderResults = new Map();
let deviceFoldersWriting = false;
let deviceFoldersRequested = false;
let deviceFolderError = null;
let collectionPreferences = readViewPreferences();
let aiChat = null;
let modernWrite = null;

const SIDEBAR_MIN = 185;
const SIDEBAR_MAX = 440;
function clampSidebarWidth(value) {
  const num = Number(value);
  return Number.isFinite(num) ? Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, Math.round(num))) : null;
}
function viewPrefKey() {
  const id = workspace?.id || 'personal';
  return id === 'personal' ? 'nitrobison-view-preferences' : `nitrobison-view-preferences:${id}`;
}
function isHalfWidthTaskMenu() {
  const screenWidth = Math.max(window.screen?.availWidth || 0, 1800);
  const threshold = Math.max(960, Math.min(1100, Math.round(screenWidth * 0.54)));
  return window.innerWidth <= threshold;
}
function readViewPreferences() {
  try {
    const saved = JSON.parse(storageGet(viewPrefKey(), '{}'));
    const layout = NOTE_LAYOUTS.includes(saved.layout) ? saved.layout : 'Table';
    let date = todayDate();
    try { if (saved.date) date = addDays(saved.date, 0); } catch { /* Keep today's bounded range. */ }
    const customStatuses = Array.isArray(saved.customStatuses)
      ? [...new Set(saved.customStatuses.filter(s => typeof s === 'string' && s.trim() && s.length <= 80 && !/[\x00-\x1f\x7f]/.test(s) && !NOTE_STATUSES.includes(s.trim())).map(s => s.trim()))]
      : [];
    return { layout, date, tag: typeof saved.tag === 'string' && saved.tag.length <= 200 ? saved.tag.toLowerCase() : '', customStatuses };
  } catch { return { layout: 'Table', date: todayDate(), tag: '', customStatuses: [] }; }
}
function addSwimlane(rawName) {
  const name = typeof rawName === 'string' ? rawName.trim() : '';
  if (!name || name.length > 80 || /[\x00-\x1f\x7f]/.test(name)) throw new Error('Swimlane name must be 1–80 characters.');
  const allExisting = [...NOTE_STATUSES, ...(collectionPreferences.customStatuses || [])];
  if (allExisting.some(s => s.toLocaleLowerCase() === name.toLocaleLowerCase() || statusLabel(s).toLocaleLowerCase() === name.toLocaleLowerCase())) {
    throw new Error('A swimlane with that name already exists.');
  }
  changeViewPreferences({ customStatuses: [...(collectionPreferences.customStatuses || []), name] });
  notice(`Added “${name}” swimlane.`);
}
function removeSwimlane(name) {
  changeViewPreferences({ customStatuses: (collectionPreferences.customStatuses || []).filter(s => s !== name) });
  notice(`Removed “${name}” swimlane.`);
}

function changeViewPreferences(patch) {
  collectionPreferences = { ...collectionPreferences, ...patch };
  storageSet(viewPrefKey(), JSON.stringify(collectionPreferences));
  renderChrome();
  syncRoute();
}

function openViews(tag = collectionPreferences.tag, layout = collectionPreferences.layout) {
  collectionPreferences = { ...collectionPreferences, tag, layout: NOTE_LAYOUTS.includes(layout) ? layout : collectionPreferences.layout };
  storageSet(viewPrefKey(), JSON.stringify(collectionPreferences));
  view = 'views';
  if ($('#modal').open) $('#modal').close();
  $('.workspace-shell').classList.remove('sidebar-open', 'context-open');
  renderChrome();
  syncRoute();
  $('#main').focus();
}

function deviceFolderLinks() {
  return Object.entries(workspace.folderPreferences).filter(([, preference]) => preference.directory).map(([folder, preference]) => {
    const saved = deviceFolderResults.get(folder);
    const result = saved?.directory === preference.directory ? saved : null;
    const service = preference.directoryService;
    return { folder, directory: preference.directory, ...result, provider: result?.provider || (service?.startsWith('google') ? 'google' : service?.startsWith('onedrive') ? 'onedrive' : null), accountType: result?.provider ? result.accountType : service?.endsWith('-ea') ? 'business' : service ? 'personal' : 'unknown', status: preference.directorySync ? result?.status || 'pending' : 'selected', manualService: !result?.provider && Boolean(service) };
  });
}

async function syncDeviceFolders() {
  if (!nativeDesktop) return;
  deviceFoldersRequested = true;
  if (deviceFoldersWriting) return;
  deviceFoldersWriting = true;
  do {
    deviceFoldersRequested = false;
    const bindings = Object.entries(workspace.folderPreferences).filter(([, preference]) => preference.directorySync).map(([folder, preference]) => ({ folder, directory: preference.directory }));
    renderChrome();
    try {
      const results = bindings.length ? await nativeDesktop.syncLinkedFolders(workspace.snapshot, bindings) : [];
      for (const result of results) deviceFolderResults.set(result.folder, { ...result, directory: bindings.find(binding => binding.folder === result.folder).directory, status: 'connected' });
      if (deviceFolderError && $('#error-text').textContent === deviceFolderError) $('#error-banner').hidden = true;
      deviceFolderError = null;
    } catch (error) {
      for (const binding of bindings) deviceFolderResults.set(binding.folder, { ...deviceFolderResults.get(binding.folder), ...binding, status: 'error' });
      deviceFolderError = error.message;
      report(error, syncDeviceFolders);
    }
  } while (deviceFoldersRequested);
  deviceFoldersWriting = false;
  renderChrome();
}

function directoryServiceOptions(service = '') {
  return [['', 'Detect from desktop client / local folder'], ['google', 'Google Drive · personal'], ['google-ea', 'Google Drive · business EA'], ['onedrive', 'OneDrive · personal'], ['onedrive-ea', 'OneDrive · business']].map(([value, label]) => `<option value="${value}" ${value === service ? 'selected' : ''}>${label}</option>`).join('');
}

function folderSavingDescription(folder) {
  const link = deviceFolderLinks().find(item => item.folder === folder);
  if (!link) return 'No folder selected.';
  if (link.status === 'selected') return 'Location reference only. Enable Markdown saving to create files here.';
  if (link.status === 'error') return 'Folder save failed. Your notes remain in NitroBison; retry or choose another folder.';
  if (link.status === 'pending') return 'Saving Markdown files…';
  const provider = link.provider === 'google' ? 'Google Drive' : link.provider === 'onedrive' ? 'OneDrive' : 'Local folder';
  return `${provider}${link.provider === 'google' && link.accountType === 'business' ? ' EA' : ''} · Folder connected · ${link.fileCount} Markdown files${link.manualService ? ' · service label selected manually' : ''}. Cloud uploads depend on your desktop sync client.`;
}

function notes() {
  const stored = workspace.snapshot.notes;
  return [...stored.map(note => drafts.get(note.id) || note), ...[...drafts.values()].filter(note => !stored.some(item => item.id === note.id))].filter(note => !note.deleted);
}
function currentNote() { return notes().find(note => note.id === selected); }
function folderVisible(folder) { return storageGet('nitrobison-show-hidden-folders', 'false') === 'true' || !isFolderHidden(folder, workspace.folderPreferences); }
function visibleNotes() { return notes().filter(note => folderVisible(note.folder)); }
function scopedNotes() { return visibleNotes().filter(note => folderFilter === null || projectContains(note, folderFilter)); }
function readonly() { return cloudConnection?.readOnly === true; }
function permissionNotice() { return `Read-only · You can read this ${cloudConnection?.name || 'cloud'} vault, but cannot write to it.`; }
function storageGet(key, fallback) { try { return localStorage.getItem(key) || fallback; } catch { return fallback; } }
function applyHideAI() { document.documentElement.toggleAttribute('data-hide-ai', storageGet('nitrobison-hide-ai', 'false') === 'true'); }
applyHideAI();
function storageSet(key, value) { try { localStorage.setItem(key, value); } catch { /* The vault uses IndexedDB, not preferences storage. */ } }
function bookmarkKey() { return `nitrobison-bookmarks:${workspace?.id || 'personal'}`; }
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
function notice(message) {
  clearTimeout(noticeTimer);
  $('#announcement-message').textContent = message;
  $('#announcement').hidden = false;
  noticeTimer = setTimeout(() => { $('#announcement').hidden = true; }, 7000);
}
function report(error, retry) {
  $('#error-text').textContent = error?.message || String(error);
  $('#error-banner').hidden = false;
  lastRetry = retry;
  $('#retry-error').hidden = !retry;
  const modal = $('#modal');
  if (modal.open) {
    $('.dialog-error', modal)?.remove();
    const message = document.createElement('div');
    message.className = 'fb-error dialog-error';
    message.setAttribute('role', 'alert');
    const text = document.createElement('span');
    text.textContent = error?.message || String(error);
    message.append(text);
    if (retry) {
      const control = document.createElement('button');
      control.className = 'fb-btn fb-btn--secondary';
      control.textContent = 'Try again';
      control.addEventListener('click', retry);
      message.append(control);
    }
    $('.fb-dialog-body', modal).prepend(message);
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
    <nav class="app-rail" aria-label="Primary navigation"><a class="brand-mark" href="${html(location.pathname + location.search)}" data-action="home" aria-label="NitroBison home"><img src="/logo.png" alt="" /></a><div class="rail-main">${button('home', 'Home', 'home')}${button('notes', 'Notes', 'notes')}${button('graph', 'Knowledge graph', 'graph')}</div><div class="rail-bottom">${button('tags', 'Find tag usage', 'hash')}${nativeDesktop ? '' : button('install', 'Install NitroBison', 'download')}${button('settings', 'Settings', 'settings')}</div></nav>
    <header class="topbar"><div class="topbar-brand">${button('sidebar', 'Toggle note browser', 'menu', 'aria-controls="sidebar" aria-expanded="false"')}<a href="${html(location.pathname + location.search)}" data-action="home" class="wordmark" aria-label="NitroBison home">NitroBison<span class="brand-period">.</span></a><span class="brand-divider"></span><button type="button" id="workspace-label" class="topbar-workspace-btn" data-action="workspace-menu" aria-haspopup="menu">Personal workspace</button></div><nav id="views-topbar-navigation" class="topbar-menu" aria-label="Views navigation" hidden></nav></header>
    <aside class="sidebar" id="sidebar" aria-label="Note browser"><button type="button" class="sidebar-workspace-switcher" id="sidebar-workspace-btn" data-action="workspace-menu" aria-haspopup="menu"><span class="sidebar-workspace-badge" id="sidebar-workspace-badge">P</span><span class="sidebar-workspace-name" id="sidebar-workspace-name">Personal workspace</span>${icon('chevrons')}</button><label class="search-box">${icon('search')}<input id="search" type="search" placeholder="Search or jump…" autocomplete="off" aria-label="Search notes" /><kbd>Ctrl+K</kbd></label><div class="sidebar-quick-actions"><button class="sidebar-action" data-action="home">${icon('home')}<span>Home</span></button><button class="sidebar-action" data-action="ai-chat">${icon('ai')}<span>NitroBison AI</span></button><button class="sidebar-action" data-action="new-note">${icon('new-page')}<span>New page</span></button><button class="sidebar-action" data-action="all-notes">${icon('book')}<span>Library</span><small id="note-count"></small></button><button class="sidebar-action" data-action="views">${icon('views')}<span>Task views</span></button></div><div class="sidebar-section"><span class="fb-eyebrow" id="browser-heading">Folders &amp; pages</span>${button('new-folder', 'Create folder', 'folder-plus')}</div><div id="note-tree" class="note-tree"></div><div class="sidebar-footer"><span class="local-indicator"><span class="status-dot"></span><span id="save-status" role="status">Opening vault…</span></span></div><div id="sidebar-resizer" class="sidebar-resizer" role="separator" aria-orientation="vertical" aria-label="Resize side panel" tabindex="0" aria-valuemin="${SIDEBAR_MIN}" aria-valuemax="${SIDEBAR_MAX}"></div></aside>
    <main id="main" class="main-workspace" tabindex="-1"><div id="error-banner" class="error-banner" role="alert" hidden><span id="error-text"></span><button id="retry-error" class="fb-btn fb-btn--secondary">Try again</button><button class="fb-icon-btn" data-action="dismiss-error" aria-label="Dismiss error">×</button></div><div id="sample-banner" class="sample-banner" hidden><span class="fb-pill">Sample vault</span><span>A few ideas to help you find your feet. Make them yours.</span></div><div id="note-view" class="note-view"><div class="note-toolbar"><div class="breadcrumb" id="breadcrumb"></div><div class="note-toolbar-actions"><div class="view-switch" role="group" aria-label="Note display mode"><button data-mode="edit" aria-pressed="false">Write (Markdown)</button><button data-mode="modern" aria-pressed="false" title="Notion-style slash-command block editor (Experimental)">Modern write <span class="mode-badge" aria-hidden="true">Exp</span></button><button data-mode="preview" aria-pressed="true">Read</button><button data-mode="split" aria-pressed="false">Split</button></div>${button('note-details', 'Toggle outline and backlinks', 'panel', 'aria-controls="context-panel" aria-expanded="false"')}${button('export-note', 'Export note as Markdown', 'download')}${button('delete-note', 'Delete note', 'trash')}</div></div><div class="note-heading"><div class="note-tagbar" id="note-tagbar"><span id="tag-chips" class="note-tag-chips"></span><input id="tag-input" class="tag-input" placeholder="Add tag…" maxlength="60" autocomplete="off" aria-label="Add a tag" /></div><label class="sr-only" for="note-title">Note title</label><input id="note-title" class="note-title" placeholder="Untitled note" maxlength="200" /><div class="note-metadata"><span id="note-date"></span><span>·</span><span id="word-count"></span><span id="role-indicator" class="fb-pill" hidden>Read-only</span><label class="note-folder-label">Folder <select id="note-folder" aria-label="Move note to folder"></select></label></div></div><div class="note-content" data-mode="preview"><section class="editor-pane" aria-label="Markdown editor"><div class="pane-label">Markdown <span>Plain text. Endless possibility.</span></div><textarea id="editor" aria-label="Markdown content" spellcheck="true" placeholder="Start with a thought…"></textarea></section><section id="modern-editor" class="modern-editor-host" aria-label="Modern write block editor"></section><article id="preview" class="markdown-body" aria-label="Rendered note"></article></div><footer class="note-footer"><span>${icon('book')} <span id="note-footer-label">A little more connected.</span></span><span>Markdown, made yours.</span></footer></div><div id="graph-view" class="graph-view" hidden></div><div id="empty-view" class="empty-view" hidden><div class="empty-symbol">${icon('notes')}</div><span class="fb-eyebrow">Room for something new</span><h2>No notes yet.</h2><p>A thought, a question, a little spark.<br />Your next idea can start right here.</p><button class="fb-btn fb-btn--primary" data-action="new-note">${icon('plus')}Create your first note</button></div></main>
    <aside id="context-panel" class="context-panel" aria-label="Note connections"><div class="context-title"><span class="fb-eyebrow">Note details</span>${button('note-details', 'Close note details', 'close')}</div><div id="outline"></div><details class="context-section" id="note-tags"><summary>Tags <span id="tag-count" class="fb-pill">0</span></summary><div id="tag-list" class="note-tags"></div></details><details class="context-section" id="linked-documents"><summary>Linked documentation <span id="connection-count" class="fb-pill">0</span></summary><h3 class="fb-heading">References <span id="outgoing-count" class="fb-meta"></span></h3><div id="outgoing-links"></div><h3 class="fb-heading">Backlinks <span id="backlink-count" class="fb-meta"></span></h3><div id="backlinks"></div></details><button class="fb-btn fb-btn--secondary context-link-action" data-action="link-note">${icon('link')}Link documentation</button><section class="context-revise-section" data-revise-section aria-labelledby="context-revise-heading"><div class="context-revise-header"><span class="fb-eyebrow" id="context-revise-heading">Revise Page</span><span class="fb-pill">AI</span></div><p class="context-revise-copy">Send this note’s Markdown with a change request and review every edit before applying.</p><button type="button" class="fb-btn fb-btn--secondary context-revise-btn" data-action="ai-revise">${icon('ai')}Revise page with AI</button></section><div class="context-tip"><span class="fb-eyebrow">Connected ideas</span><p>Use <code>[[a note title]]</code> or Link documentation to connect notes. Add <code>#topic</code> tags to organize them.</p></div></aside>
  </div><div id="announcement" class="announcement" role="status" aria-live="polite"></div><dialog id="modal" class="fb-dialog"></dialog><input id="markdown-files" type="file" accept=".md,text/markdown" multiple hidden /><input id="markdown-folder" type="file" webkitdirectory multiple hidden /><input id="backup-file" type="file" accept=".json,application/json" hidden />`;
  $('.rail-main').insertAdjacentHTML('beforeend', button('views', 'Task views', 'views'));
  $('.rail-bottom').insertAdjacentHTML('afterbegin', button('ai-chat', 'NitroBison AI', 'ai'));
  const noteBrowser = document.createElement('div');
  noteBrowser.id = 'note-browser-controls';
  for (const child of [...$('#sidebar').children]) if (!child.matches('.sidebar-back, .sidebar-footer, .sidebar-workspace-switcher, .sidebar-resizer')) noteBrowser.append(child);
  $('#sidebar').insertBefore(noteBrowser, $('.sidebar-footer'));
  noteBrowser.insertAdjacentHTML('afterend', '<nav id="views-side-navigation" aria-label="Task views navigation" hidden></nav><nav id="graph-navigation" aria-label="Graph navigation" hidden></nav>');
  const savedWidth = clampSidebarWidth(storageGet('nitrobison-sidebar-width', ''));
  if (savedWidth) $('.workspace-shell').style.setProperty('--sidebar-custom-width', `${savedWidth}px`);
  const resizer = $('#sidebar-resizer');
  const applySidebarWidth = width => {
    const clamped = clampSidebarWidth(width);
    if (!clamped) return;
    $('.workspace-shell').style.setProperty('--sidebar-custom-width', `${clamped}px`);
    resizer.setAttribute('aria-valuenow', String(clamped));
    storageSet('nitrobison-sidebar-width', String(clamped));
  };
  resizer.setAttribute('aria-valuenow', String(savedWidth || Math.round($('#sidebar').getBoundingClientRect().width || 245)));
  resizer.addEventListener('pointerdown', event => {
    if (event.button !== 0 || !sidebarDesktop.matches) return;
    event.preventDefault();
    resizer.setPointerCapture(event.pointerId);
    resizer.classList.add('is-resizing');
    document.body.classList.add('is-resizing-sidebar');
    const leftEdge = $('#sidebar').getBoundingClientRect().left;
    const onMove = moveEvent => applySidebarWidth(moveEvent.clientX - leftEdge);
    const onEnd = () => {
      resizer.classList.remove('is-resizing');
      document.body.classList.remove('is-resizing-sidebar');
      resizer.removeEventListener('pointermove', onMove);
      resizer.removeEventListener('pointerup', onEnd);
      resizer.removeEventListener('pointercancel', onEnd);
    };
    resizer.addEventListener('pointermove', onMove);
    resizer.addEventListener('pointerup', onEnd);
    resizer.addEventListener('pointercancel', onEnd);
  });
  resizer.addEventListener('keydown', event => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key) || !sidebarDesktop.matches) return;
    event.preventDefault();
    const current = Math.round($('#sidebar').getBoundingClientRect().width);
    applySidebarWidth(event.key === 'Home' ? SIDEBAR_MIN : event.key === 'End' ? SIDEBAR_MAX : current + (event.key === 'ArrowRight' ? 16 : -16));
  });
  $('.view-switch').insertAdjacentHTML('afterend', '<span id="note-save-status" class="note-save-status" role="status"></span>');
  $('#announcement').innerHTML = `${icon('ai')}<span id="announcement-message"></span>${button('dismiss-notice', 'Dismiss notification', 'close')}`;
  $('#announcement').hidden = true;
  const home = document.createElement('section');
  home.id = 'home-view';
  home.className = 'passport-home';
  $('#main').insertBefore(home, $('#sample-banner'));
  const folderPage = document.createElement('section');
  folderPage.id = 'folder-view';
  folderPage.className = 'folder-frontpage';
  folderPage.hidden = true;
  $('#main').insertBefore(folderPage, $('#note-view'));
  const collectionPage = document.createElement('section');
  collectionPage.id = 'collection-view';
  collectionPage.className = 'collection-view';
  collectionPage.hidden = true;
  $('#main').insertBefore(collectionPage, $('#note-view'));
  const aiChatPage = document.createElement('section');
  aiChatPage.id = 'ai-chat-view';
  aiChatPage.className = 'ai-chat-view';
  aiChatPage.hidden = true;
  $('#main').insertBefore(aiChatPage, $('#note-view'));
  aiChat = createAIChatController({
    getSettings: () => ({ endpoint: aiSettings.endpoint, model: aiSettings.model, apiKey: aiSettings.apiKey }),
    getVisibleNotes: () => visibleNotes(),
    getContext: () => ({
      view,
      workspaceId: workspace?.id || 'personal',
      workspaceName: workspace?.name || 'Personal workspace',
      viewLabel: view === 'home' ? 'Home' : view === 'views' ? `Task views (${collectionPreferences.layout})` : view === 'graph' ? 'Knowledge graph' : view === 'folder' ? 'Folder overview' : view === 'ai-chat' ? 'NitroBison AI' : 'Notes',
      folder: folderFilter,
      activeNote: view === 'note' ? currentNote() : null,
      notes: visibleNotes(),
      onOpenFullChat: () => openAIChat(),
    }),
    onOpenConnectPopup: pendingPrompt => aiConnectDialog(pendingPrompt),
    onOpenSettings: () => settingsDialog('ai'),
    onCreateNoteFromReply: markdown => {
      if (readonly()) { report(new Error(permissionNotice())); return; }
      const heading = /^#\s+(.+)$/m.exec(markdown)?.[1]?.trim() || 'AI note';
      void run(async () => {
        const note = await createNoteWithProperties({ title: heading.slice(0, 120), folder: creationFolder ?? '', openAfter: true });
        await workspace.saveNote({ ...note, content: markdown, updatedAt: Date.now() });
        renderChrome();
        notice(`Saved “${note.title}” from AI chat.`);
      });
    },
    icon,
  });
  aiChat.mountSupportWidget($('#app'));
  const toolbarInfo = document.createElement('div');
  toolbarInfo.className = 'note-toolbar-info';
  const breadcrumb = $('#breadcrumb');
  breadcrumb.replaceWith(toolbarInfo);
  toolbarInfo.append(breadcrumb, $('#role-indicator'));
  $('#role-indicator').className = 'permission-notice';
  $('#role-indicator').setAttribute('role', 'status');
  $('#app').insertAdjacentHTML('beforeend', '<input id="folder-banner-file" type="file" accept="image/png,image/jpeg,image/webp" hidden />');
  $('#folder-banner-file').addEventListener('change', attachFolderBanner);
  const newPageBtn = $('.sidebar [data-action="new-note"]');
  newPageBtn.setAttribute('aria-describedby', 'creation-target');
  newPageBtn.insertAdjacentHTML('afterend', '<p id="creation-target" class="sr-only"></p>');
  $('.note-toolbar-actions').insertAdjacentHTML('beforeend', button('insert-list-db', 'Insert list database (/list)', 'list'));
  $('.note-toolbar-actions').insertAdjacentHTML('beforeend', button('link-note', 'Link documentation', 'link'));
  $('.note-toolbar-actions').insertAdjacentHTML('beforeend', button('ai', 'Generate with AI', 'ai'));
  $('.note-toolbar-actions').insertAdjacentHTML('beforeend', '<button class="fb-btn fb-btn--text" data-action="properties">Properties</button>');
  $('#app').insertAdjacentHTML('beforeend', '<div id="folder-menu" class="fb-popover folder-menu" popover role="menu" aria-label="Folder actions"></div>');
  $('#app').insertAdjacentHTML('beforeend', '<div id="reference-menu" class="fb-popover reference-popover" popover role="menu" aria-label="Document link choices"></div>');
  $('#app').insertAdjacentHTML('beforeend', '<div id="workspace-menu" class="fb-popover folder-menu workspace-popover" popover role="menu" aria-label="Workspaces"></div>');
  for (const menu of document.querySelectorAll('#folder-menu, #reference-menu, #workspace-menu')) menu.addEventListener('toggle', event => {
    if (event.newState === 'closed' && menu.contains(document.activeElement)) (popoverTrigger?.isConnected ? popoverTrigger : $('#main')).focus({ preventScroll: true });
  });
  const scope = document.createElement('div');
  scope.id = 'project-scope';
  scope.className = 'project-scope';
  scope.hidden = true;
  $('#main').insertBefore(scope, $('#note-view'));
  sidebarDesktop.addEventListener('change', syncSidebarToggle);
  let lastHalfTaskMenu = isHalfWidthTaskMenu();
  window.addEventListener('resize', () => {
    const nextHalf = isHalfWidthTaskMenu();
    if (nextHalf !== lastHalfTaskMenu) {
      lastHalfTaskMenu = nextHalf;
      if (view === 'views') renderChrome();
    }
  });
  document.addEventListener('click', handleClick);
  document.addEventListener('contextmenu', event => {
    const summary = event.target.closest('.tree-folder > summary');
    if (!summary || !summary.parentElement.dataset.folder) return;
    event.preventDefault();
    showFolderMenu(summary.parentElement.dataset.folder, summary, event.clientX, event.clientY);
  });
  document.addEventListener('dragstart', startNoteDrag);
  document.addEventListener('dragover', overNoteFolder);
  document.addEventListener('dragleave', event => { if (!event.relatedTarget) clearDropTarget(); });
  document.addEventListener('dragend', endNoteDrag);
  document.addEventListener('drop', dropNoteInFolder);
  $('#search').addEventListener('input', event => { query = event.target.value; renderTree(); });
  $('#editor').addEventListener('input', () => updateDraft({ content: $('#editor').value }));
  $('#tag-input').addEventListener('keydown', event => {
    if (event.key !== 'Enter' && event.key !== ',') return;
    event.preventDefault();
    const tag = event.target.value.trim().replace(/^#+/, '').replace(/\s+/g, '-').toLocaleLowerCase();
    const note = currentNote();
    if (!tag || !note || !extractTags('#' + tag).includes(tag)) return;
    event.target.value = '';
    if (extractTags(note.content).includes(tag)) return;
    const content = note.content.trimEnd();
    // shortcut: tags are plain #words in the note body; adding appends one, removing means editing the text.
    void updateDraft({ content: content + (/(^|\n)(\s*#[^\s#]+)+\s*$/.test(content) ? ' ' : '\n\n') + '#' + tag });
    renderNote();
    $('#tag-input').focus();
  });
  $('#note-title').addEventListener('input', () => updateDraft({ title: $('#note-title').value.trim() || 'Untitled note' }));
  $('#note-folder').addEventListener('change', () => void run(() => moveNote(selected, $('#note-folder').value)));
  $('#retry-error').addEventListener('click', () => lastRetry?.());
  $('#markdown-files').addEventListener('change', importMarkdown);
  $('#markdown-folder').addEventListener('change', importMarkdown);
  $('#backup-file').addEventListener('change', restoreBackup);
  let modalPointerOutside = false;
  $('#modal').addEventListener('pointerdown', event => {
    const rect = $('#modal').getBoundingClientRect();
    modalPointerOutside = event.target === $('#modal') && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom);
  });
  $('#modal').addEventListener('click', event => {
    if (!modalPointerOutside || event.target !== $('#modal')) { modalPointerOutside = false; return; }
    modalPointerOutside = false;
    const rect = $('#modal').getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) $('#modal').close();
  });
  $('#modal').addEventListener('close', () => {
    if (nativeDesktop && $('#cancel-native-auth') && !$('#cancel-native-auth').hidden) void run(() => nativeDesktop.cancelAuthorization());
    aiRequest?.abort();
    (activeDialogTrigger?.isConnected ? activeDialogTrigger : $('#main')).focus();
  });
  document.addEventListener('keydown', handleKeyboard);
  window.addEventListener('beforeunload', event => { if (pending || failedDrafts.size || deviceFoldersWriting) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('online', renderChrome);
  window.addEventListener('offline', renderChrome);
  window.addEventListener('popstate', readRoute);
  window.addEventListener('hashchange', readRoute);
}

function syncSidebarToggle() {
  const shell = $('.workspace-shell');
  const compactViews = view === 'views' && isHalfWidthTaskMenu();
  const opened = view !== 'home' && !compactViews && (sidebarDesktop.matches ? !shell.classList.contains('sidebar-closed') : shell.classList.contains('sidebar-open'));
  $('[data-action="sidebar"]').setAttribute('aria-expanded', String(opened));
}

function renderChrome() {
  const active = notes();
  const scoped = scopedNotes();
  if (!selected || !active.some(note => note.id === selected && (folderFilter === null || projectContains(note, folderFilter)))) selected = scoped[0]?.id || null;
  if (creationFolder && !workspace.snapshot.folders.includes(creationFolder) && !active.some(note => note.folder === creationFolder)) creationFolder = null;
  const compactViews = view === 'views' && isHalfWidthTaskMenu();
  $('.workspace-shell').classList.toggle('is-home', view === 'home');
  $('.workspace-shell').classList.toggle('is-graph', view === 'graph');
  $('.workspace-shell').classList.toggle('is-folder', view === 'folder');
  $('.workspace-shell').classList.toggle('is-views', view === 'views');
  $('.workspace-shell').classList.toggle('is-ai-chat', view === 'ai-chat');
  $('.workspace-shell').classList.toggle('is-views-topbar', compactViews);
  $('#collection-view').hidden = view !== 'views';
  $('#ai-chat-view').hidden = view !== 'ai-chat';
  $('#note-browser-controls').hidden = view === 'graph' || (view === 'views' && !compactViews);
  $('#views-side-navigation').hidden = !(view === 'views' && !compactViews);
  $('#views-topbar-navigation').hidden = !compactViews;
  $('#graph-navigation').hidden = view !== 'graph';
  $('#sidebar').setAttribute('aria-label', view === 'graph' ? 'Graph browser' : view === 'views' ? 'Task views browser' : 'Note browser');
  syncSidebarToggle();
  $('#folder-view').hidden = view !== 'folder';
  $('#home-view').hidden = view !== 'home';
  const workspaceName = workspace.name || 'Personal workspace';
  $('#workspace-label').textContent = workspaceName;
  $('#sidebar-workspace-name').textContent = workspaceName;
  $('#sidebar-workspace-badge').textContent = (workspaceName.trim()[0] || 'W').toUpperCase();
  $('#note-count').textContent = `${visibleNotes().length}`;
  $('#save-status').textContent = pending ? 'Saving on this device…' : failedDrafts.size ? 'Some edits need saving' : deviceFoldersWriting ? 'Writing Markdown files…' : deviceFolderError ? 'Saved locally · Folder save failed' : deviceFolderLinks().some(link => link.status === 'connected') ? 'Saved locally & to folder' : workspace.status;
  $('.status-dot').classList.toggle('is-pending', Boolean(pending || failedDrafts.size || deviceFoldersWriting || deviceFolderError));
  const noteSave = $('#note-save-status');
  noteSave.textContent = pending || deviceFoldersWriting ? 'Saving…' : failedDrafts.size || deviceFolderError ? 'Save failed' : 'Saved';
  noteSave.title = $('#save-status').textContent;
  noteSave.classList.toggle('is-pending', Boolean(pending || failedDrafts.size || deviceFoldersWriting || deviceFolderError));
  const folderStatus = $('#folder-saving-status');
  if (folderStatus) folderStatus.textContent = folderSavingDescription(folderStatus.dataset.folder);
  $('#sample-banner').hidden = view !== 'note' && view !== 'graph' || !scoped.some(note => note.id.startsWith('10000000-0000-4000-8000-'));
  if (view === 'home') {
    const config = cloudConfig();
    const returnAction = activeDialogTrigger?.closest('#home-view') ? { ...activeDialogTrigger.dataset } : null;
    renderHome($('#home-view'), {
      snapshot: { ...workspace.snapshot, notes: visibleNotes().map(note => ({ ...note, content: propertiesBody(note.content) })), folders: workspace.snapshot.folders.filter(folderVisible) }, online: navigator.onLine,
      configuredProvider: typeof config.clientId === 'string' && config.clientId.trim() && ['google', 'onedrive'].includes(config.provider) ? config.provider : null,
      connection: cloudConnection, folderConnections: deviceFolderLinks(),
      readonly: readonly(), bookmarks: projectBookmarks(), icon, folderPreferences: workspace.folderPreferences,
    });
    if (returnAction) activeDialogTrigger = [...$('#home-view').querySelectorAll('[data-action]')].find(control => control.dataset.action === returnAction.action && control.dataset.provider === returnAction.provider) || $('#main');
  }
  $('#project-scope').hidden = view === 'home' || view === 'folder' || view === 'ai-chat' || folderFilter === null;
  $('#project-scope').innerHTML = folderFilter === null ? '' : `<span>${icon('folder')}<button class="project-scope-folder" data-project="${html(folderFilter)}">${html(folderFilter || 'Unfiled pages')}</button><span>${scoped.length} ${scoped.length === 1 ? 'note' : 'notes'} · Project ${view === 'graph' ? 'graph' : 'notes'}</span></span><button class="fb-btn fb-btn--text" data-action="all-folders"><span aria-hidden="true">←</span>All folders</button>`;
  $('#empty-view h2').textContent = folderFilter === null ? 'No notes yet.' : 'No notes in this project yet.';
  $('#empty-view p').textContent = folderFilter === null ? 'A thought, a question, a little spark. Your next idea can start right here.' : 'Create your first note here. It will stay in this project.';
  document.querySelectorAll('[data-action="new-note"], [data-action="new-folder"], [data-action="new-project"], [data-action="delete-note"], [data-action="link-note"], [data-action="insert-list-db"]').forEach(control => { control.disabled = readonly(); });
  for (const [action, target] of [['home', 'home'], ['notes', 'note'], ['graph', 'graph'], ['views', 'views'], ['ai-chat', 'ai-chat']]) $('.app-rail button[data-action="' + action + '"]')?.setAttribute('aria-current', view === target ? 'page' : 'false');
  for (const [action, activeView] of [['home', view === 'home'], ['ai-chat', view === 'ai-chat'], ['views', view === 'views']]) {
    const btn = $(`.sidebar-quick-actions [data-action="${action}"]`);
    if (btn) { btn.classList.toggle('is-active', activeView); btn.setAttribute('aria-current', activeView ? 'page' : 'false'); }
  }
  if (view !== 'graph') renderTree();
  renderNote();
  if (view === 'folder') renderFolderPage();
  if (view === 'views') {
    const inactiveNav = compactViews ? $('#views-side-navigation') : $('#views-topbar-navigation');
    if (inactiveNav) inactiveNav.innerHTML = '';
    renderCollections($('#collection-view'), {
      notes: visibleNotes(), folder: folderFilter, ...collectionPreferences, readOnly: readonly(), folderPreferences: workspace.folderPreferences,
      navigation: compactViews ? $('#views-topbar-navigation') : $('#views-side-navigation'),
      isCompactNav: compactViews,
      onPatch: (record, patch) => saveNoteProperties(record.note.id, record.note.content, patch), onPreference: changeViewPreferences, onError: report,
      onFolder: folder => { folderFilter = folder; creationFolder = folder; renderChrome(); syncRoute(); },
      onCreateNote: ({ folder, status }) => createNoteWithProperties({ folder, status, openAfter: true }),
      onAddSwimlane: addSwimlane,
      onRemoveSwimlane: removeSwimlane,
    });
  }
  if (view === 'ai-chat') aiChat?.renderPage($('#ai-chat-view'));
  aiChat?.syncSupportWidget();
}

function renderTree() {
  const active = visibleNotes();
  const filtered = active.filter(note => `${note.title}\n${note.folder}\n${note.content}`.toLowerCase().includes(query.toLowerCase()));
  $('#browser-heading').textContent = query ? `${filtered.length} search results` : 'Folders & pages';
  const tree = $('#note-tree');
  const previous = new Map([...tree.querySelectorAll('details')].map(item => [item.dataset.folder, item.open]));
  const noteButton = note => `<button class="tree-note ${view === 'note' && note.id === selected ? 'is-selected' : ''}" data-note="${html(note.id)}" data-draggable-note="${html(note.id)}" draggable="${!readonly()}" ${view === 'note' && note.id === selected ? 'aria-current="page"' : ''}>${icon('notes')}<span>${html(note.title)}</span>${view === 'note' && note.id === selected ? '<span class="current-dot"></span>' : ''}</button>`;
  if (query) {
    tree.innerHTML = (filtered.length ? filtered.map(note => `<div class="search-result">${noteButton(note)}<small>${html(note.folder || 'Vault root')}</small></div>`).join('') : '<p class="sidebar-empty">No notes match your search.<br />Try another word or phrase.</p>');
    return;
  }
  const folders = [...new Set([...workspace.snapshot.folders, ...active.map(note => note.folder).filter(Boolean)])].filter(folderVisible).sort();
  const bookmarks = [...projectBookmarks()].filter(folder => folder === '' ? folderVisible('') : folders.includes(folder));
  const bookmarkSet = new Set(projectBookmarks());
  const rootNotes = active.filter(note => !note.folder);
  const favoritesMarkup = bookmarks.length ? `<section class="sidebar-group" aria-label="Favorites"><span class="sidebar-group-label">Favorites</span>${bookmarks.map(folder => `<button class="tree-note" data-project="${html(folder)}">${icon('star')}<span>${html(folder || 'Unfiled pages')}</span></button>`).join('')}</section>` : '';
  const rootOpen = previous.has('') ? previous.get('') : rootNotes.length > 0;
  tree.innerHTML = `${favoritesMarkup}${folderVisible('') ? `<details class="tree-folder unfiled-pages" data-folder="" ${rootOpen ? 'open' : ''} aria-label="Private pages"><summary data-drop-folder=""><button class="folder-toggle" data-action="folder-toggle" aria-label="${rootOpen ? 'Collapse' : 'Expand'} Private pages" aria-expanded="${rootOpen}"><span class="folder-chevron" aria-hidden="true">›</span></button><button class="folder-open unfiled-heading" data-project="" ${view === 'folder' && folderFilter === '' ? 'aria-current="page"' : ''}>${icon('notes')}<span>Private pages</span></button><small>${rootNotes.length}</small><button class="fb-icon-btn folder-favorite" data-bookmark="" aria-pressed="${bookmarkSet.has('')}" aria-label="${bookmarkSet.has('') ? 'Unfavorite' : 'Favorite'} Private pages">${icon('star')}</button></summary><div class="folder-notes">${rootNotes.map(noteButton).join('') || '<p class="folder-empty">Pages without a folder appear here.</p>'}</div></details>` : ''}${folders.map(folder => {
    const children = active.filter(note => note.folder === folder);
    const open = previous.has(folder) ? previous.get(folder) : false;
    return `<details class="tree-folder" data-folder="${html(folder)}" ${open ? 'open' : ''}><summary data-drop-folder="${html(folder)}"><button class="folder-toggle" data-action="folder-toggle" aria-label="${open ? 'Collapse' : 'Expand'} ${html(folder)} pages" aria-expanded="${open}"><span class="folder-chevron" aria-hidden="true">›</span></button><button class="folder-open" data-project="${html(folder)}" ${view === 'folder' && folderFilter === folder ? 'aria-current="page"' : ''}>${icon('folder')}<span>${html(folder)}</span></button><small>${children.length}</small><button class="fb-icon-btn folder-favorite" data-bookmark="${html(folder)}" aria-pressed="${bookmarkSet.has(folder)}" aria-label="${bookmarkSet.has(folder) ? 'Unfavorite' : 'Favorite'} ${html(folder)}">${icon('star')}</button>${button('folder-menu', `Folder actions for ${html(folder)}`, 'menu', `data-folder="${html(folder)}" aria-haspopup="menu"`)}</summary><div class="folder-notes">${children.map(noteButton).join('') || '<p class="folder-empty">A little room to grow.</p>'}</div></details>`;
  }).join('')}${!active.length && !folders.length ? '<p class="sidebar-empty">Your next idea starts with a new note.</p>' : ''}`;
  selectCreationFolder(creationFolder);
}

function selectCreationFolder(folder) {
  creationFolder = folder;
  $('#creation-target').textContent = `New notes in ${folder || 'Vault root'}`;
  document.querySelectorAll('.tree-folder').forEach(item => item.querySelector('summary').classList.toggle('is-folder-selected', Boolean(folder) && item.dataset.folder === folder));
}

function showFolderMenu(folder, trigger, x, y) {
  selectCreationFolder(folder);
  const menu = $('#folder-menu');
  menu.innerHTML = `<span class="fb-eyebrow">${html(folder)}</span><button role="menuitem" data-action="folder-new-note" data-folder="${html(folder)}" ${readonly() ? 'disabled' : ''}>${icon('notes')}New note</button><button role="menuitem" data-action="folder-new-folder" data-folder="${html(folder)}" ${readonly() ? 'disabled' : ''}>${icon('folder-plus')}New folder</button><button role="menuitem" data-bookmark="${html(folder)}">${icon('star')}${projectBookmarks().includes(folder) ? 'Unfavorite folder' : 'Favorite folder'}</button><button role="menuitem" data-action="folder-graph" data-folder="${html(folder)}">${icon('graph')}View linked graph</button>${nativeDesktop ? `<button role="menuitem" data-action="folder-path" data-folder="${html(folder)}">${icon('folder')}Show folder path</button>` : ''}<button role="menuitem" data-action="folder-hide" data-folder="${html(folder)}">${icon('hide')}${workspace.folderPreferences[folder]?.hidden ? 'Unhide folder' : 'Hide folder'}</button><button role="menuitem" class="folder-manage" data-action="manage-folder" data-folder="${html(folder)}" ${readonly() ? 'disabled' : ''}>${icon('settings')}Manage folder</button>`;
  showPopoverMenu(menu, trigger, x, y);
}

function showPopoverMenu(menu, trigger, x, y) {
  popoverTrigger = trigger;
  const rect = trigger.getBoundingClientRect();
  menu.insertAdjacentHTML('beforeend', `<button class="popover-close" role="menuitem" data-action="close-menu" aria-label="Close menu">${icon('close')}</button>`);
  menu.showPopover({ source: trigger });
  menu.style.left = `${Math.max(8, Math.min(x ?? rect.left, innerWidth - menu.offsetWidth - 8))}px`;
  menu.style.top = `${Math.max(8, Math.min(y ?? rect.bottom, innerHeight - menu.offsetHeight - 8))}px`;
  $('button:not(:disabled)', menu)?.focus({ preventScroll: true });
}

function showReferenceMenu(trigger, sourceId, targetId, openId = targetId) {
  const active = notes();
  const source = active.find(note => note.id === sourceId);
  const target = active.find(note => note.id === targetId);
  const documentNote = active.find(note => note.id === openId);
  if (!source || !target || !documentNote) return;
  const occurrences = referenceOccurrences(source, target, active);
  const menu = $('#reference-menu');
  menu.innerHTML = `<span class="fb-eyebrow">${html(documentNote.title)}</span><button role="menuitem" data-note="${html(openId)}">${icon('notes')}Open document</button>${occurrences.map((occurrence, index) => `<button role="menuitem" data-action="reference-location" data-source="${html(sourceId)}" data-target="${html(targetId)}" data-occurrence="${index}">${icon('search')}<span>Show reference${occurrences.length > 1 ? ` ${index + 1}` : ''}<small>In ${html(source.title)} · line ${source.content.slice(0, occurrence.start).split('\n').length}</small></span></button>`).join('')}`;
  showPopoverMenu(menu, trigger);
}

function occurrenceExcerpt(note, occurrence) {
  return `${occurrence.start > 90 ? '…' : ''}${html(note.content.slice(Math.max(0, occurrence.start - 90), occurrence.start))}<mark class="reference-hit">${html(occurrence.text)}</mark>${html(note.content.slice(occurrence.end, occurrence.end + 90))}${occurrence.end + 90 < note.content.length ? '…' : ''}`;
}

function locateReference(sourceId, targetId, index) {
  const active = notes();
  const source = active.find(note => note.id === sourceId);
  const target = active.find(note => note.id === targetId);
  const occurrence = source && target && referenceOccurrences(source, target, active)[index];
  if (!occurrence) throw new Error('This reference changed. Open the document link again.');
  mode = 'preview';
  openNote(sourceId);
  clearTimeout(previewTimer);
  renderPreview();
  const link = [...$('#preview').querySelectorAll('a[data-note]')].filter(item => item.dataset.note === targetId)[index];
  if (link) {
    link.classList.add('reference-hit');
    link.scrollIntoView({ block: 'center' });
    link.focus({ preventScroll: true });
    notice(`Reference ${index + 1} in ${source.title}.`);
  } else {
    showDialog('Reference location', source.title, `<p class="fb-meta">Line ${source.content.slice(0, occurrence.start).split('\n').length} in the original Markdown.</p><pre class="reference-excerpt">${occurrenceExcerpt(source, occurrence)}</pre>`);
  }
}

async function tagUsageDialog(tag = null, workspaceId = workspace.id) {
  const allWorkspaces = await workspace.listWorkspaceSnapshots();
  const liveNotesFor = entry => (entry.id === workspace.id ? visibleNotes() : entry.snapshot.notes.filter(n => !n.deleted));
  if (tag === null) {
    const sections = allWorkspaces.map(entry => {
      const topics = new Map();
      const entryNotes = liveNotesFor(entry);
      for (const note of entryNotes) for (const topic of extractTags(note.content)) topics.set(topic, (topics.get(topic) || 0) + 1);
      const sorted = [...topics].sort(([a], [b]) => a.localeCompare(b));
      return `<details class="workspace-tag-group" data-tag-workspace="${html(entry.id)}" open><summary class="workspace-tag-summary"><span class="sidebar-workspace-badge">${html((entry.name.trim()[0] || 'W').toUpperCase())}</span><span class="workspace-tag-name">${html(entry.name)}</span>${entry.active ? '<span class="fb-pill fb-pill--ok">Current</span>' : ''}<span class="workspace-tag-count">${sorted.length} ${sorted.length === 1 ? 'tag' : 'tags'}</span></summary><div class="workspace-tag-body">${sorted.length ? `<div class="workspace-tag-chips">${sorted.map(([topic, count]) => `<button type="button" class="fb-chip workspace-tag-chip" data-action="tag-usage" data-tag="${html(topic)}" data-workspace-id="${html(entry.id)}"><span>#${html(topic)}</span><small>${count} ${count === 1 ? 'note' : 'notes'}</small></button>`).join('')}</div>` : '<p class="fb-meta workspace-tag-empty">No tags used in this workspace yet.</p>'}</div></details>`;
    }).join('');
    showDialog('Tags by workspace', 'Workspaces & topics', `<div class="tag-usage workspace-tags-list">${sections}</div>`);
    return;
  }
  const targetEntry = allWorkspaces.find(item => item.id === workspaceId) || allWorkspaces.find(item => item.active) || allWorkspaces[0];
  const active = liveNotesFor(targetEntry);
  const matches = active.map(note => ({ note, occurrences: tagOccurrences(note.content, tag) })).filter(item => item.occurrences.length);
  const viewsLink = `<button class="fb-btn fb-btn--secondary" data-action="tag-view" data-tag="${html(tag)}" data-workspace-id="${html(targetEntry.id)}">Open #${html(tag)} in Views →</button>`;
  showDialog(`#${tag}`, `${targetEntry.name} · Tag usage`, `<div class="tag-detail-actions"><button class="fb-btn fb-btn--text" data-action="tags">← All workspaces</button>${viewsLink}</div><p class="fb-meta">${matches.length} ${matches.length === 1 ? 'document uses' : 'documents use'} this tag in <b>${html(targetEntry.name)}</b>.</p><div class="tag-usage">${matches.map(({ note, occurrences }) => `<section class="tag-usage-note"><button class="backlink-note" data-note="${html(note.id)}" data-workspace-id="${html(targetEntry.id)}">${icon('notes')}<span>${html(note.title)}<small>${html(note.folder || 'Unfiled pages')} · ${occurrences.length} ${occurrences.length === 1 ? 'use' : 'uses'}</small></span><span>↗</span></button>${occurrences.map(occurrence => `<p class="fb-meta">Line ${note.content.slice(0, occurrence.start).split('\n').length}</p><pre class="reference-excerpt">${occurrenceExcerpt(note, occurrence)}</pre>`).join('')}</section>`).join('') || '<p class="fb-body">This tag is no longer used in this workspace.</p>'}</div>`);
}

function clearDropTarget() {
  dropTarget?.classList.remove('is-drop-target');
  dropTarget = null;
}
function endNoteDrag() {
  clearDropTarget();
  draggedNote = null;
}
function startNoteDrag(event) {
  const control = event.target.closest('[data-draggable-note]');
  if (!control) return;
  if (readonly()) { event.preventDefault(); return; }
  draggedNote = control.dataset.draggableNote;
  event.dataTransfer.effectAllowed = 'move';
  event.dataTransfer.setData('application/x-nitrobison-note', draggedNote);
}
function overNoteFolder(event) {
  const target = event.target.closest('[data-drop-folder], [data-project]');
  if (!draggedNote || readonly() || !target) { clearDropTarget(); return; }
  event.preventDefault();
  event.dataTransfer.dropEffect = 'move';
  if (target !== dropTarget) {
    clearDropTarget();
    dropTarget = target;
    dropTarget.classList.add('is-drop-target');
  }
}
function dropNoteInFolder(event) {
  const target = event.target.closest('[data-drop-folder], [data-project]');
  const id = draggedNote;
  endNoteDrag();
  if (!id || readonly() || !target || event.dataTransfer.getData('application/x-nitrobison-note') !== id) return;
  event.preventDefault();
  void run(() => moveNote(id, target.dataset.dropFolder ?? target.dataset.project));
}

async function moveNote(id, folder) {
  if (readonly()) throw new Error(permissionNotice());
  const note = notes().find(item => item.id === id);
  if (!note || note.folder === folder) return;
  if (notes().some(item => item.id !== id && item.folder === folder && item.title.toLocaleLowerCase() === note.title.toLocaleLowerCase())) {
    if (selected === id) $('#note-folder').value = note.folder;
    throw new Error('A page with this title already exists in that folder. Rename one of the pages before moving it.');
  }
  const draft = { ...note, folder, updatedAt: Date.now() };
  drafts.set(id, draft);
  if (id === selected && folderFilter !== null && !projectContains(draft, folderFilter)) folderFilter = null;
  if (await persist(draft)) {
    syncRoute();
    notice(`Moved ${note.title} to ${folder || 'Unfiled pages'}.`);
  }
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
  const detailsOpen = view === 'note' && Boolean(note) && (matchMedia('(min-width: 1161px)').matches ? !$('.workspace-shell').classList.contains('context-closed') : $('.workspace-shell').classList.contains('context-open'));
  document.querySelectorAll('[data-action="note-details"]').forEach(control => control.setAttribute('aria-expanded', String(detailsOpen)));
  if (view === 'graph') {
    const graphHost = document.createElement('div');
    $('#graph-view').replaceChildren(graphHost);
    disposeGraph = mountGraph(graphHost, visibleNotes(), openNote, { folder: folderFilter, folders: workspace.snapshot.folders.filter(folderVisible), mode: graphMode, navigation: $('#graph-navigation'), linkedFolders: deviceFolderLinks(), onFolder: openGraphFolder, onOpenFolder: openProject, onMode: value => { graphMode = value; } });
  }
  if (view !== 'note' || !note) {
    if (modernWrite) { modernWrite.destroy(); modernWrite = null; }
    if (view !== 'note') return;
    lastRendered = null;
    return;
  }
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
  $('#word-count').textContent = `${propertiesBody(note.content).trim().split(/\s+/).filter(Boolean).length} words`;
  const folders = [...new Set(['', ...workspace.snapshot.folders, ...notes().map(item => item.folder)])].sort();
  if (document.activeElement !== $('#note-folder')) $('#note-folder').innerHTML = folders.map(folder => `<option value="${html(folder)}" ${folder === note.folder ? 'selected' : ''}>${html(folder || 'Vault root')}</option>`).join('');
  const displayMode = readonly() ? 'preview' : mode;
  $('#note-view').dataset.mode = displayMode;
  $('.note-content').dataset.mode = displayMode;
  document.querySelectorAll('button[data-mode]').forEach(control => { control.hidden = readonly() && control.dataset.mode !== 'preview'; control.setAttribute('aria-pressed', String(control.dataset.mode === displayMode)); });
  document.querySelectorAll('[data-action="delete-note"], [data-action="link-note"], [data-action="insert-list-db"], [data-action="ai"], [data-action="ai-revise"], [data-revise-section]').forEach(control => { control.hidden = readonly(); });
  if (displayMode === 'modern') {
    const body = propertiesBody(note.content);
    const mwOptions = {
      body,
      readOnly: readonly(),
      notes: visibleNotes(),
      fromNote: note,
      markdownOptions: markdownOptions(note, true),
      onChange: nextBody => {
        const latest = currentNote();
        if (!latest || latest.id !== note.id) return;
        const nextContent = withPropertiesBody(latest.content, nextBody);
        $('#editor').value = nextContent;
        void updateDraft({ content: nextContent });
      },
    };
    if (!modernWrite) modernWrite = mountModernWrite($('#modern-editor'), mwOptions);
    else modernWrite.update(mwOptions);
  } else if (modernWrite) {
    modernWrite.destroy();
    modernWrite = null;
  }
  clearTimeout(previewTimer);
  const metadataError = $('#note-properties-error');
  metadataError?.remove();
  try { readProperties(note.content); }
  catch (error) { $('#note-view').insertAdjacentHTML('afterbegin', `<p id="note-properties-error" class="fb-error properties-summary">${html(error.message)} <button class="fb-btn fb-btn--text" data-action="properties">Repair properties</button></p>`); }
  previewTimer = setTimeout(renderPreview, changedNote ? 0 : 160);
}

function markdownOptions(hostNote, editableBlock = false) {
  return {
    customStatuses: collectionPreferences.customStatuses || [],
    readOnly: readonly(),
    onOpenNote: target => openNote(target?.id || target),
    onPatchProperties: (target, patch) => saveNoteProperties(target.id, target.content, patch),
    onOpenProperties: target => run(() => propertiesDialog(target?.id || target)),
    onCreateNote: ({ title, folder, tag, status }) => createNoteWithProperties({ title, folder, tag, status, openAfter: false }),
    onUpdateBlock: editableBlock && !readonly() ? async (blockIndex, config) => {
      const latest = currentNote();
      if (!latest || latest.id !== hostNote.id) return;
      const base = overviewNoteBody(latest);
      if (base.isOverview) return;
      const body = propertiesBody(latest.content);
      const updated = updateListDatabaseBlock(body, blockIndex, config);
      await updateDraft({ content: withPropertiesBody(latest.content, updated.content) });
    } : undefined,
  };
}
function overviewNoteBody(note) {
  const overview = folderOverview([note], note.folder);
  return { isOverview: Boolean(overview.note), overview };
}
function renderPreview() {
  const note = currentNote();
  if (!note) return;
  const { isOverview, overview } = overviewNoteBody(note);
  const preference = isOverview ? workspace.folderPreferences[note.folder] : null;
  const banner = preference && Object.hasOwn(preference, 'banner') ? preference.banner : overview.banner;
  renderMarkdown($('#preview'), isOverview ? overview.body : note.content, visibleNotes(), note, isOverview, markdownOptions(note, !isOverview));
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
  const connectionButton = (item, incoming = false) => `<button class="backlink-note" data-reference-source="${html(incoming ? item.id : note.id)}" data-reference-target="${html(incoming ? note.id : item.id)}" data-reference-open="${html(item.id)}" aria-haspopup="menu">${icon('notes')}<span>${html(item.title)}<small>${html(item.folder || 'Vault root')}</small></span><span>↗</span></button>`;
  $('#connection-count').textContent = `${new Set([...backlinks, ...outgoing].map(item => item.id)).size}`;
  $('#backlink-count').textContent = `${backlinks.length}`;
  $('#outgoing-count').textContent = `${outgoing.length}`;
  $('#backlinks').innerHTML = backlinks.map(item => connectionButton(item, true)).join('') || '<p class="context-empty">No notes reference this document yet.</p>';
  $('#outgoing-links').innerHTML = outgoing.map(item => connectionButton(item)).join('') || '<p class="context-empty">Link another document to connect your ideas.</p>';
  const tags = extractTags(note.content);
  $('#tag-count').textContent = `${tags.length}`;
  $('#tag-list').innerHTML = tags.map(tag => `<button class="fb-pill" data-action="tag-usage" data-tag="${html(tag)}" aria-label="Find uses of #${html(tag)}">#${html(tag)}</button>`).join('') || '<p class="context-empty">Add #topic tags to your note.</p>';
  $('#tag-chips').innerHTML = tags.map(tag => `<span class="tag-chip"><button type="button" class="fb-pill" data-action="tag-usage" data-tag="${html(tag)}" aria-label="Find uses of #${html(tag)}">#${html(tag)}</button>${readonly() ? '' : `<button type="button" class="tag-remove" data-action="tag-remove" data-tag="${html(tag)}" aria-label="Remove tag #${html(tag)}">×</button>`}</span>`).join('');
  $('#tag-input').disabled = readonly();
  $('#note-footer-label').textContent = `${backlinks.length} backlink${backlinks.length === 1 ? '' : 's'} · ${edges.filter(edge => edge.source === note.id).length} outgoing link${edges.filter(edge => edge.source === note.id).length === 1 ? '' : 's'}`;
}

function syncRoute() {
  const route = new URLSearchParams();
  if (view !== 'home') {
    if (folderFilter !== null) route.set('project', folderFilter);
    if (view === 'graph') route.set('graph', '');
    else if (view === 'folder') route.set('folder', '');
    else if (view === 'ai-chat') route.set('ai', '');
    else if (view === 'views') { route.set('views', collectionPreferences.layout.toLowerCase()); if (collectionPreferences.tag) route.set('tag', collectionPreferences.tag); }
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
  view = route.has('ai') ? 'ai-chat' : route.has('views') ? 'views' : route.has('graph') ? 'graph' : route.has('folder') && folderFilter !== null ? 'folder' : route.has('note') || route.has('notes') || route.has('project') ? 'note' : 'home';
  if (view === 'views') {
    collectionPreferences.layout = NOTE_LAYOUTS.find(layout => layout.toLowerCase() === route.get('views')) || collectionPreferences.layout;
    if (route.has('tag')) collectionPreferences.tag = route.get('tag').replace(/^#/, '').toLowerCase();
  }
  query = '';
  $('#search').value = '';
  $('.workspace-shell').classList.remove('sidebar-open', 'context-open');
  renderChrome();
}
function openProject(folder) {
  folderFilter = folder;
  creationFolder = folder;
  selected = null;
  query = '';
  $('#search').value = '';
  view = 'folder';
  $('.workspace-shell').classList.remove('sidebar-open', 'context-open');
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
    <header class="folder-page-heading"><div><span class="fb-eyebrow">Folder frontpage</span><p>${html(folderFilter || 'Vault root')}</p></div><button class="fb-btn fb-btn--text" data-action="all-folders"><span aria-hidden="true">←</span>All folders</button></header>
    ${readonly() ? `<p class="permission-notice" role="status">${html(permissionNotice())}</p>` : ''}
    <div class="folder-overview-card"><div class="folder-banner">${banner ? `<img src="${html(banner)}" alt="${html(title)} banner" />` : `<div class="folder-banner-empty">${icon('folder')}<span>A little room for a picture</span></div>`}</div><div class="folder-overview-content"><span class="fb-eyebrow">${scopedNotes().length} ${scopedNotes().length === 1 ? 'note' : 'notes'} · Markdown workspace</span><h1>${html(title)}</h1><div id="folder-overview-body" class="markdown-body folder-overview-copy"></div><div class="folder-overview-actions">${!readonly() ? '<button class="fb-btn fb-btn--primary" data-action="folder-edit">Edit overview</button>' : ''}${overview.note ? `<button class="fb-btn fb-btn--text" data-note="${html(overview.note.id)}">Read full overview →</button>` : ''}</div></div></div>
    <section class="folder-location" aria-labelledby="folder-location-heading">
      <h2 class="fb-heading" id="folder-location-heading">Folder on this device</h2>
      <div class="folder-location-choice"><output id="folder-directory-path" aria-labelledby="folder-location-heading">${preference.directory ? html(preference.directory) : 'No device folder selected'}</output><div class="folder-location-actions"><button class="fb-btn fb-btn--secondary" data-action="folder-directory">${preference.directory ? 'Change' : 'Choose'} device folder</button>${preference.directory ? `${nativeDesktop ? `<button class="fb-btn fb-btn--secondary" data-action="folder-directory-open">Open folder</button><button class="fb-btn fb-btn--secondary" data-action="folder-saving" data-folder="${html(folderFilter)}">${preference.directorySync ? 'Disable' : 'Enable'} Markdown saving</button><button class="fb-btn fb-btn--text" data-action="folder-path" data-folder="${html(folderFilter)}">Folder details</button>` : ''}<button class="fb-btn fb-btn--text" data-action="folder-directory-clear">Clear location</button>` : ''}</div></div>
      <p class="fb-meta">${nativeDesktop ? html(folderSavingDescription(folderFilter)) : 'Only the folder name is saved. Browser selection does not write or import files.'}</p>
      ${nativeDesktop ? '<p class="fb-meta">Notes remain recoverable in NitroBison. Enabled folders receive Markdown files after saves. External edits cause a conflict rather than a blind overwrite; no files are automatically imported. Your desktop sync client handles cloud transfers.</p>' : ''}
    </section>
    <footer class="folder-page-footer"><p>${overview.note ? 'Overview saved in this folder’s README.md.' : 'Add an overview to give this folder a Markdown frontpage.'} Banners chosen here are private to you on this device.</p><div><button class="fb-btn fb-btn--secondary" data-action="folder-banner">${banner ? 'Change' : 'Attach'} banner</button>${banner ? '<button class="fb-btn fb-btn--text" data-action="folder-remove-banner">Remove banner</button>' : ''}${!readonly() ? `<button class="fb-btn fb-btn--secondary" data-action="new-note">${icon('plus')}New note</button>` : ''}<button class="fb-btn fb-btn--secondary" data-action="folder-graph" data-folder="${html(folderFilter || '')}">${icon('graph')}Linked graph</button></div></footer>`;
  const body = $('#folder-overview-body');
  if (overview.body.trim()) renderMarkdown(body, overview.body, visibleNotes(), overview.note, true, markdownOptions(overview.note, false));
  else body.innerHTML = `<p>${readonly() ? 'No folder overview has been written yet.' : 'Write a little about this folder: what belongs here, where to start, or how its ideas connect. Markdown and document links work here too.'}</p>`;
}

async function saveFolderOverview(folder, body, banner, expected) {
  if (readonly()) throw new Error(permissionNotice());
  const current = folderOverview(notes(), folder);
  if (current.note?.id !== expected.note?.id || current.note?.content !== expected.note?.content) throw new Error('The folder overview changed while you were editing. Keep your text and reopen the editor before saving.');
  const note = { ...current.note, id: current.note?.id || crypto.randomUUID(), title: current.note?.title || 'README', folder, content: withFolderBanner(withPropertiesBody(current.note?.content || '', body), banner), updatedAt: Date.now() };
  await workspace.saveNote(note);
  drafts.delete(note.id);
  failedDrafts.delete(note.id);
  renderChrome();
}

function editFolderOverview() {
  if (readonly()) return;
  const folder = folderFilter;
  const overview = folderOverview(notes(), folder);
  const modal = showDialog('About this folder', folder || 'Unfiled pages', `<form id="folder-overview-form" class="dialog-form"><label class="fb-field">Markdown overview<textarea name="content" rows="10" placeholder="What belongs here? Where should someone start?">${html(overview.body)}</textarea></label><p class="fb-meta">Saved in README.md. Only the first two preview lines are shown; the full overview stays available. Your attached banner is kept separately from this editor.</p><div class="form-actions"><button type="button" class="fb-btn fb-btn--secondary" data-action="close-modal">Cancel</button><button class="fb-btn fb-btn--primary">Save overview</button></div></form>`);
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

async function chooseFolderDirectory(folder = folderFilter) {
  const scope = bookmarkKey();
  await run(async () => {
    const directory = await chooseDirectory();
    if (directory === null) return;
    if (scope !== bookmarkKey()) throw new Error('The active user changed. Choose the directory again for this user.');
    await workspace.saveFolderPreferences(folder, { directory, ...(nativeDesktop ? { directorySync: true } : {}) });
    notice(nativeDesktop ? 'Markdown saving enabled. Check the folder status below.' : 'Folder name saved; browsers do not provide persistent filesystem access.');
  });
}

function folderPathDialog(folder) {
  const preference = workspace.folderPreferences[folder] || {};
  const directory = preference.directory;
  const modal = showDialog('Folder path', folder || 'Unfiled pages', `<p class="fb-body">Linked desktop folders receive Markdown files after local saves. Existing unrelated files are kept; external edits stop a conflicting write. Disabling saving keeps existing files. Nothing is imported automatically.</p><output class="local-path">${html(directory || 'No local folder selected')}</output><p class="fb-notice" id="folder-saving-status" data-folder="${html(folder)}">${html(folderSavingDescription(folder))}</p>${directory ? `<label class="fb-field">Folder service<select id="directory-service">${directoryServiceOptions(preference.directoryService)}</select><span class="fb-meta">Verified desktop-client metadata wins. A manual label is not cloud sign-in.</span></label>` : ''}<div class="form-actions"><button class="fb-btn fb-btn--secondary" id="choose-local-directory">${directory ? 'Change' : 'Choose'} local folder</button>${directory ? `<button class="fb-btn fb-btn--secondary" data-action="folder-saving" data-folder="${html(folder)}">${preference.directorySync ? 'Disable' : 'Enable'} Markdown saving</button><button class="fb-btn fb-btn--secondary" id="open-local-directory">Open folder</button><button class="fb-btn fb-btn--text" id="clear-local-directory">Clear path</button>` : ''}</div>`);
  $('#choose-local-directory', modal).addEventListener('click', async () => { await chooseFolderDirectory(folder); if (modal.open) folderPathDialog(folder); });
  $('#open-local-directory', modal)?.addEventListener('click', () => void run(() => nativeDesktop.openDirectory(directory)));
  $('#clear-local-directory', modal)?.addEventListener('click', () => void run(async () => { await workspace.saveFolderPreferences(folder, { directory: null }); if (modal.open) folderPathDialog(folder); }));
  $('#directory-service', modal)?.addEventListener('change', event => void run(() => workspace.saveFolderPreferences(folder, { directoryService: event.target.value || null })));
  if (directory) void run(async () => {
    const metadata = await nativeDesktop.inspectDirectory(directory);
    if (workspace.folderPreferences[folder]?.directory !== directory) return;
    const previous = deviceFolderResults.get(folder);
    deviceFolderResults.set(folder, { ...previous, ...metadata, directory, status: previous?.directory === directory ? previous.status : preference.directorySync ? 'pending' : 'selected' });
    renderChrome();
  });
}

async function persist(note) {
  pending++;
  renderChrome();
  try {
    await workspace.saveNote(note);
    failedDrafts.delete(note.id);
    if (drafts.get(note.id) === note) drafts.delete(note.id);
    return true;
  } catch (error) {
    failedDrafts.add(note.id);
    report(error, () => persist(drafts.get(note.id) || note));
    return false;
  } finally { pending--; renderChrome(); }
}
function updateDraft(change) {
  if (readonly()) return;
  const note = currentNote();
  if (!note) return;
  const draft = { ...note, ...change, updatedAt: Date.now() };
  drafts.set(note.id, draft);
  if (folderFilter !== null && !projectContains(draft, folderFilter)) folderFilter = null;
  return persist(draft);
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
async function createNoteWithProperties({ title: requestedTitle = 'Untitled note', folder = creationFolder ?? '', tag = '', status = 'Not started', openAfter = false } = {}) {
  if (readonly()) throw new Error(permissionNotice());
  const existing = notes();
  const baseTitle = requestedTitle.trim() || 'Untitled note';
  let title = baseTitle;
  let suffix = 2;
  while (existing.some(item => item.title.toLocaleLowerCase() === title.toLocaleLowerCase() && item.folder === folder)) title = `${baseTitle} ${suffix++}`;
  const body = tag ? `# ${title}\n\n#${tag.replace(/^#/, '')}\n` : '';
  const content = status && status !== 'Not started' ? withProperties(body, { status }) : body;
  const note = { id: crypto.randomUUID(), title, folder, content, updatedAt: Date.now() };
  if (openAfter) {
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
    await persist(note);
    return note;
  }
  await persist(note);
  notice(`Created “${title}”.`);
  return note;
}
function insertInlineListDatabase() {
  if (readonly()) return;
  const note = currentNote();
  if (!note) return;
  if (mode === 'preview') mode = 'split';
  const editor = $('#editor');
  const cursor = document.activeElement === editor ? editor.selectionStart : note.content.length;
  const prefixLen = note.content.length - propertiesBody(note.content).length;
  const bodyCursor = Math.max(0, cursor - prefixLen);
  const inserted = insertListDatabaseMarkdown(propertiesBody(note.content), bodyCursor, { title: 'Tasks', folder: note.folder || '' });
  const nextContent = withPropertiesBody(note.content, inserted.content);
  editor.value = nextContent;
  void updateDraft({ content: nextContent });
  renderNote();
  notice('Inserted inline list database.');
}

function linkNoteDialog() {
  const source = currentNote();
  if (!source || readonly()) return;
  const linked = new Set(buildGraph(notes()).edges.filter(edge => edge.source === source.id).map(edge => edge.target));
  const candidates = notes().filter(note => note.id !== source.id && !linked.has(note.id)).sort((a, b) => `${a.folder}/${a.title}`.localeCompare(`${b.folder}/${b.title}`));
  const modal = showDialog('Link documentation', 'Connected ideas', candidates.length ? `<form id="link-note-form" class="dialog-form"><label class="fb-field">Documentation to link<select name="target" required><option value="" disabled selected>Choose a document</option>${candidates.map(note => `<option value="${html(note.id)}">${html(`${note.folder || 'Vault root'} / ${note.title}`)}</option>`).join('')}</select></label><p class="fb-body">Adds a Markdown link to this note. It appears in both documents’ connections and survives export and sync.</p><div class="form-actions"><button class="fb-btn fb-btn--primary">Link document</button></div></form>` : '<p class="fb-body">No other unlinked documents yet. Create another note, then link it here.</p>');
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

async function flushNoteDraft(id) {
  const draft = drafts.get(id);
  if (draft && !await persist(draft)) throw new Error('Save your note edits before changing properties or publishing. Your draft is still available.');
  await workspace.waitForWrites();
  if (drafts.has(id) || failedDrafts.has(id)) throw new Error('This note still has unsaved edits. Save them before changing properties or publishing.');
}

async function saveNoteProperties(id, expectedContent, patch) {
  if (readonly()) throw new Error(permissionNotice());
  await flushNoteDraft(id);
  const focused = document.activeElement;
  const focusedProperty = focused?.dataset.property;
  pending++;
  try {
    const saved = await workspace.updateNoteProperties(id, expectedContent, patch);
    notice('Note properties saved in its Markdown.');
    return saved;
  } finally {
    pending--;
    renderChrome();
    if (focusedProperty && focused?.dataset.id === id) [...$('#collection-view').querySelectorAll('[data-property]')].find(control => control.dataset.id === id && control.dataset.property === focusedProperty)?.focus({ preventScroll: true });
  }
}

async function propertiesDialog(id = selected) {
  if (!id) return;
  await flushNoteDraft(id);
  const note = notes().find(item => item.id === id);
  if (!note) throw new Error('This note was deleted or is no longer available.');
  let properties;
  try { properties = readProperties(note.content); }
  catch (error) {
    showDialog('Repair note properties', note.title, `<p class="fb-error" role="alert">${html(error.message)}</p><p class="fb-body">The original Markdown is untouched. Open Write (Markdown) and repair the anchored <code>nitrobison-properties</code> JSON block, then return here. Valid keys are status, start and end; dates are YYYY-MM-DD, with an inclusive end on or after start. Imported examples elsewhere in the note are not properties.</p><button class="fb-btn fb-btn--secondary" data-action="repair-properties" data-id="${html(id)}" ${readonly() ? 'disabled' : ''}>Open Write (Markdown) to repair</button><button class="fb-btn fb-btn--text" data-action="export-record" data-id="${html(id)}">Export original .md</button>`);
    return;
  }
  const statuses = [...new Set([...NOTE_STATUSES, ...(collectionPreferences.customStatuses || []), properties.status])];
  const modal = showDialog('Note properties', note.title, `<p class="properties-summary fb-body">These are the original note’s Markdown properties, not a separate record. Body, links, tags, ID and folder stay unchanged.${readonly() ? ' This cloud vault is read-only.' : ''}</p><form class="dialog-form properties-form" id="properties-form"><label class="fb-field">Status<select name="status" ${readonly() ? 'disabled' : ''}>${statuses.map(status => `<option value="${html(status)}" ${status === properties.status ? 'selected' : ''}>${html(statusLabel(status))}</option>`).join('')}</select></label><div class="properties-dates"><label class="fb-field">Start date<input name="start" type="date" min="0001-01-01" max="9999-12-31" value="${html(properties.start)}" ${readonly() ? 'disabled' : ''}/></label><label class="fb-field">End date (inclusive)<input name="end" type="date" min="0001-01-01" max="9999-12-31" value="${html(properties.end)}" ${readonly() ? 'disabled' : ''}/></label></div><p class="fb-meta">Leave dates empty for an unscheduled note. An end requires a start. Clear both dates together to unschedule a range.</p><p class="fb-error" id="properties-feedback" role="alert" hidden></p><div class="form-actions"><button type="button" class="fb-btn fb-btn--secondary" data-action="close-modal">Close</button>${readonly() ? '' : '<button class="fb-btn fb-btn--primary">Save properties</button>'}</div></form><div class="collection-note-actions"><button class="fb-btn fb-btn--text" data-action="export-record" data-id="${html(id)}">Export .md</button></div>`);
  $('#properties-form', modal).addEventListener('submit', event => {
    event.preventDefault();
    if (readonly()) return;
    const patch = Object.fromEntries(new FormData(event.target));
    const submit = event.target.querySelector('button[type="submit"], button:not([type])');
    submit.disabled = true;
    void run(async () => {
      try { await saveNoteProperties(id, note.content, patch); await propertiesDialog(id); }
      catch (error) { const feedback = $('#properties-feedback', modal); if (feedback) { feedback.hidden = false; feedback.textContent = error.message; } throw error; }
    }).finally(() => { if (submit.isConnected) submit.disabled = false; });
  });
}

function showDialog(title, eyebrow, body, footer = '') {
  const modal = $('#modal');
  if (!modal.open) activeDialogTrigger = document.activeElement;
  modal.setAttribute('aria-label', title);
  modal.innerHTML = `<header><div><span class="fb-eyebrow">${html(eyebrow)}</span><h2 class="fb-title">${html(title)}</h2></div><button class="fb-icon-btn" data-action="close-modal" aria-label="Close dialog">×</button></header><div class="fb-dialog-body">${body}</div>${footer ? `<footer>${footer}</footer>` : ''}`;
  if (!modal.open) modal.showModal();
  return modal;
}
function showWorkspaceMenu(trigger) {
  const menu = $('#workspace-menu');
  const list = workspace.workspaces;
  menu.innerHTML = `<span class="fb-eyebrow">Workspaces</span>${list.map(item => `<button role="menuitem" class="workspace-menu-item ${item.id === workspace.id ? 'is-active' : ''}" data-action="switch-workspace" data-workspace-id="${html(item.id)}" aria-checked="${item.id === workspace.id}"><span class="sidebar-workspace-badge">${html((item.name.trim()[0] || 'W').toUpperCase())}</span><span class="workspace-menu-name">${html(item.name)}</span>${item.id === workspace.id ? icon('check') : ''}</button>`).join('')}<div class="workspace-menu-divider"></div><button role="menuitem" data-action="new-workspace">${icon('plus')}New workspace</button><button role="menuitem" data-action="rename-workspace">${icon('edit')}Rename workspace</button>`;
  showPopoverMenu(menu, trigger);
}
async function switchActiveWorkspace(targetId) {
  if (!targetId || targetId === workspace.id) return;
  if (pending || failedDrafts.size) throw new Error('Wait for your current edits to finish saving before switching workspaces.');
  if (cloudConnection) { cloudConnection.disconnect(); cloudConnection = null; }
  await workspace.switchWorkspace(targetId);
  drafts.clear();
  failedDrafts.clear();
  deviceFolderResults.clear();
  deviceFolderError = null;
  selected = null;
  lastRendered = null;
  folderFilter = null;
  creationFolder = null;
  query = '';
  $('#search').value = '';
  collectionPreferences = readViewPreferences();
  if (view === 'folder') view = 'note';
  renderChrome();
  syncRoute();
  void syncDeviceFolders();
  notice(`Switched to ${workspace.name}.`);
}
function workspaceDialog(rename = false) {
  const modal = showDialog(rename ? 'Rename workspace' : 'New workspace', 'Local workspace', `<form id="workspace-form" class="dialog-form"><label class="fb-field">Workspace name<input name="name" required maxlength="80" value="${rename ? html(workspace.name) : ''}" placeholder="e.g. Work, Research, Client X" autocomplete="off" /></label><p class="fb-meta">${rename ? 'Updates the display name of this workspace on this device.' : 'Creates an independent local vault with its own folders, pages and task swimlanes on this device.'}</p><div class="form-actions"><button type="button" class="fb-btn fb-btn--secondary" data-action="close-modal">Cancel</button><button class="fb-btn fb-btn--primary">${rename ? 'Save name' : 'Create workspace'}</button></div></form>`);
  const input = $('#workspace-form input', modal);
  setTimeout(() => { input?.focus(); input?.select(); }, 20);
  $('#workspace-form', modal).addEventListener('submit', event => {
    event.preventDefault();
    const name = new FormData(event.target).get('name');
    void run(async () => {
      if (rename) {
        await workspace.renameWorkspace(workspace.id, name);
        modal.close();
        renderChrome();
        notice('Workspace renamed.');
      } else {
        if (pending || failedDrafts.size) throw new Error('Wait for your current edits to finish saving before creating a workspace.');
        if (cloudConnection) { cloudConnection.disconnect(); cloudConnection = null; }
        const created = await workspace.createWorkspace(name);
        drafts.clear();
        failedDrafts.clear();
        deviceFolderResults.clear();
        deviceFolderError = null;
        selected = null;
        lastRendered = null;
        folderFilter = null;
        creationFolder = null;
        query = '';
        $('#search').value = '';
        collectionPreferences = readViewPreferences();
        modal.close();
        renderChrome();
        syncRoute();
        notice(`Created workspace “${created.name}”.`);
      }
    });
  });
}
function confirmAction(title, text, label, action) {
  const modal = showDialog(title, 'A moment to make sure', `<p class="fb-body">${html(text)}</p><p id="confirm-feedback" class="fb-error" role="alert" hidden></p>`, '<button class="fb-btn fb-btn--secondary" data-action="close-modal">Cancel</button><button class="fb-btn fb-btn--primary" id="confirm-action"></button>');
  const confirm = $('#confirm-action', modal);
  confirm.textContent = label;
  confirm.addEventListener('click', () => {
    confirm.disabled = true;
    void run(async () => {
      try { await action(); modal.close(); }
      catch (error) { const feedback = $('#confirm-feedback', modal); if (feedback) { feedback.hidden = false; feedback.textContent = error.message; } throw error; }
    }).finally(() => { if (confirm.isConnected) confirm.disabled = false; });
  });
}
function folderDialog(folder = null, project = false, parent = null) {
  let directory = folder === null ? null : workspace.folderPreferences[folder]?.directory;
  let directoryChanged = false;
  const modal = showDialog(project ? 'New project' : folder === null ? 'New folder' : 'Manage folder', 'Folders', `<form id="folder-form" class="dialog-form"><label class="fb-field">${project ? 'Project name' : 'Folder path in vault'}<input name="path" required maxlength="500" placeholder="${project ? 'New beginnings' : 'Projects/Ideas'}" value="${html(folder || '')}" /></label><p class="fb-body">${project ? 'A project is a top-level folder in this vault. Existing notes and other projects will not be moved.' : 'Use a slash for a nested folder, such as Projects/Ideas. Renaming moves all notes inside the vault.'}</p>${nativeDesktop ? `<div class="fb-field">${folder === null ? 'Create inside this folder (optional override)' : 'Markdown folder on this laptop (optional)'}<output id="new-folder-directory" class="local-path">${html(directory || (folder === null ? 'App data / Markdown (default)' : 'No local folder selected'))}</output><button type="button" class="fb-btn fb-btn--secondary" id="pick-new-folder-directory">${folder === null ? 'Choose parent folder' : 'Choose local folder'}</button><span class="fb-meta">${folder === null ? 'Without a selected parent, your folder is created inside NitroBison app data / Markdown. Choosing a parent creates your vault folder path inside it instead. Markdown saving is enabled in either location.' : 'Choosing a new path enables Markdown writes when you save this form.'} Existing unrelated files are kept; no automatic import. Old location-only links need explicit enabling in Show folder path.</span></div><label class="fb-field">Folder service<select name="directoryService">${directoryServiceOptions(folder === null ? '' : workspace.folderPreferences[folder]?.directoryService)}</select><span class="fb-meta">Optional label when your desktop client cannot be detected; not cloud sign-in.</span></label>` : ''}<div class="form-actions">${folder !== null ? '<button type="button" class="fb-btn fb-btn--secondary" id="remove-folder">Delete folder and notes</button>' : ''}<button class="fb-btn fb-btn--primary">${project ? 'Create project' : folder === null ? 'Create folder' : 'Rename folder'}</button></div></form>`);
  if (folder === null && parent) $('input[name="path"]', modal).value = `${parent}/`;
  $('#pick-new-folder-directory', modal)?.addEventListener('click', () => void run(async () => { const selectedPath = await chooseDirectory(); if (selectedPath !== null) { directory = selectedPath; directoryChanged = true; $('#new-folder-directory', modal).textContent = directory; } }));
  $('#folder-form', modal).addEventListener('submit', event => {
    event.preventDefault();
    const data = new FormData(event.target);
    const path = data.get('path').trim();
    const bookmarks = projectBookmarks();
    run(async () => {
      if (project && /[/\\]/.test(path)) throw new Error('Use a name without slashes. Projects are top-level folders.');
      const destination = folder === null && nativeDesktop ? await nativeDesktop.createFolderDirectory(directory, path) : directory;
      if (folder === null) await workspace.addFolder(path);
      else await workspace.renameFolder(folder, path);
      if (folder !== null && folderFilter !== null && projectContains({ folder: folderFilter }, folder)) folderFilter = path + folderFilter.slice(folder.length);
      if (destination) await workspace.saveFolderPreferences(path, { directory: destination, directoryService: data.get('directoryService') || null, ...(directoryChanged || (folder === null && nativeDesktop) ? { directorySync: true } : {}) });
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
    const count = notes().filter(note => projectContains(note, folder)).length;
    confirmAction('Delete this folder and its notes?', `Delete “${folder}” and ${count} ${count === 1 ? 'note' : 'notes'}, including subfolders? Deletion syncs to connected vaults. Existing device files are left intact; keep a JSON backup first.`, 'Delete folder', async () => {
      await workspace.deleteFolder(folder);
      for (const [id, note] of drafts) if (projectContains(note, folder)) { drafts.delete(id); failedDrafts.delete(id); }
      if (folderFilter !== null && projectContains({ folder: folderFilter }, folder)) { folderFilter = null; view = 'note'; }
      if (creationFolder !== null && projectContains({ folder: creationFolder }, folder)) creationFolder = null;
      const bookmarks = projectBookmarks();
      if (bookmarks.some(item => projectContains({ folder: item }, folder))) saveProjectBookmarks(bookmarks.filter(item => !projectContains({ folder: item }, folder)));
      renderChrome(); syncRoute(); notice('Folder and its notes deleted.');
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
  try { const config = JSON.parse(storageGet('herd-cloud-config', '{}')); return config && typeof config === 'object' && !Array.isArray(config) ? config : {}; } catch { return {}; }
}
function settingsDialog(section = 'overview', page = null) {
  const saved = cloudConfig();
  const provider = ['google', 'onedrive'].includes(page) ? page : saved.provider;
  const config = provider && provider !== saved.provider ? { provider } : saved;
  const ai = aiConfig();
  const aiProviders = {
    openai: {
      label: 'ChatGPT (OpenAI)',
      endpoint: 'https://api.openai.com/v1/chat/completions',
      model: 'gpt-6.1-sol',
      keyHint: 'Create a secret key at platform.openai.com/api-keys (API credits are billed separately from a consumer ChatGPT subscription).',
      steps: [
        'Open <a href="https://platform.openai.com/api-keys" target="_blank" rel="noopener noreferrer">OpenAI Platform → API keys</a> and create a new secret key.',
        'Ensure your OpenAI API project has active billing or claimed Pro/Business API credits.',
        'Click <b>Use OpenAI preset</b> below to fill the endpoint and recommended model (<code>gpt-6.1-sol</code>, or enter <code>gpt-6-astra</code> / <code>gpt-6-luna</code>), paste your API key, and click <b>Apply AI settings</b>.',
      ],
      note: nativeDesktop ? 'Runs through the native desktop bridge with no browser CORS limits.' : 'If your browser blocks cross-origin error responses on OpenAI, verify your key/credits or use the NitroBison desktop app.',
    },
    claude: {
      label: 'Claude (Anthropic)',
      endpoint: 'https://api.anthropic.com/v1/chat/completions',
      model: 'claude-haiku-5-5',
      keyHint: 'Create a workspace-scoped API key at platform.claude.com/settings/keys.',
      steps: [
        'Open <a href="https://platform.claude.com/settings/keys" target="_blank" rel="noopener noreferrer">Anthropic Console → API Keys</a> and create a key scoped to a specific workspace (unscoped personal keys require an extra workspace header).',
        'Click <b>Use Claude preset</b> below to fill Anthropic’s OpenAI-compatible endpoint and model (<code>claude-haiku-5-5</code> or <code>claude-opus-5-5</code>).',
        'Paste your Anthropic API key and click <b>Apply AI settings</b>.',
      ],
      note: nativeDesktop ? 'Runs directly via the native desktop bridge.' : 'Anthropic’s OpenAI-compatibility endpoint may block direct browser CORS requests; use the NitroBison desktop app if the browser reports a network/CORS error.',
    },
    gemini: {
      label: 'Gemini (Google)',
      endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai/chat/completions',
      model: 'gemini-3.5-flash-lite',
      keyHint: 'Generate an API key in Google AI Studio (aistudio.google.com/apikey).',
      steps: [
        'Open <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer">Google AI Studio → Get API key</a> and create an API key (no Google Cloud project number goes into the fields below).',
        'Click <b>Use Gemini preset</b> below to fill the full OpenAI-compatible REST URL and high-availability model <code>gemini-3.5-flash-lite</code> (or enter <code>gemini-4-hydrogen</code> when capacity allows).',
        'Paste your Gemini API key and click <b>Apply AI settings</b>.',
      ],
      note: 'Works in both browser and desktop app. Free-tier AI Studio keys have rate limits; see Google’s terms regarding free-tier data usage.',
    },
    deepseek: {
      label: 'DeepSeek',
      endpoint: 'https://api.deepseek.com/chat/completions',
      model: 'deepseek-flash',
      keyHint: 'Create an API key at platform.deepseek.com/api_keys with a topped-up balance.',
      steps: [
        'Open <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer">DeepSeek Platform → API keys</a>, top up your API balance, and create a key.',
        'Click <b>Use DeepSeek preset</b> below to fill <code>https://api.deepseek.com/chat/completions</code> and model <code>deepseek-flash</code> (or <code>deepseek-v4-pro</code>; legacy <code>deepseek-chat</code> was retired).',
        'Paste your API key and click <b>Apply AI settings</b>.',
      ],
      note: 'Works in both browser and desktop app with standard Bearer authentication.',
    },
    copilot: {
      label: 'GitHub Copilot / Foundry',
      endpoint: 'https://YOUR-RESOURCE.services.ai.azure.com/models/chat/completions?api-version=2024-05-01-preview',
      model: 'gpt-6.1-sol',
      keyHint: 'GitHub retired models.github.ai; use Microsoft Foundry Models or a local Copilot-compatible gateway.',
      steps: [
        '<b>Note on GitHub Copilot &amp; GitHub Models:</b> Consumer GitHub Copilot subscriptions do not expose a public third-party REST API, and GitHub retired <code>models.github.ai</code> on July 30, 2026 in favor of <a href="https://learn.microsoft.com/en-us/azure/foundry/foundry-models/how-to/quickstart-github-models" target="_blank" rel="noopener noreferrer">Microsoft Foundry Models</a>.',
        'In the Azure / Microsoft Foundry portal, deploy a model and copy its <b>Chat Completions target URI</b> and <b>API key</b>.',
        'Click <b>Use Foundry template</b> below, replace <code>YOUR-RESOURCE</code> with your Foundry resource host, set your deployed model name, paste your key, and click <b>Apply AI settings</b>.',
      ],
      note: 'If your organization runs an approved local OpenAI-compatible gateway on localhost, you can also enter its http://127.0.0.1:PORT/v1/chat/completions URL.',
    },
    local: {
      label: 'Local (Ollama / LM Studio)',
      endpoint: 'http://127.0.0.1:11434/v1/chat/completions',
      model: 'qwen3:8b',
      keyHint: 'Runs 100% locally on your machine; leave API key blank unless authentication is enabled.',
      steps: [
        'Install <a href="https://ollama.com/" target="_blank" rel="noopener noreferrer">Ollama</a> and run <code>ollama pull qwen3:8b</code> (or start <b>LM Studio</b>’s local server on port <code>1234</code> with CORS enabled).',
        'Click <b>Use Ollama preset</b> (port <code>11434</code>) or <b>Use LM Studio preset</b> (port <code>1234</code>) below and enter the exact model tag you pulled/loaded.',
        'Leave <b>API key</b> empty (unless LM Studio token auth is enabled) and click <b>Apply AI settings</b>.',
      ],
      note: nativeDesktop ? 'Desktop connects directly to 127.0.0.1 with no extra Ollama environment flags needed.' : 'In web browsers, set OLLAMA_ORIGINS to allow this page’s origin if Ollama rejects cross-origin requests.',
    },
  };
  const groups = [
    { id: 'overview', label: 'Overview', pages: [['overview', 'At a glance']] },
    { id: 'general', label: 'General', pages: [['appearance', 'Appearance'], ['folders', 'Folders'], ['about', 'About']] },
    { id: 'accounts', label: 'Accounts', pages: [['google', 'Google Drive'], ['onedrive', 'OneDrive']] },
    { id: 'files', label: 'Data & files', pages: [['transfer', 'Import & export']] },
    { id: 'ai', label: 'AI', pages: Object.entries(aiProviders).map(([id, item]) => [`ai-${id}`, item.label]) },
  ];
  const themeOptions = ['system', 'light', 'dark'].map(theme => `<option value="${theme}" ${storageGet('herd-theme', 'system') === theme ? 'selected' : ''}>${theme[0].toUpperCase() + theme.slice(1)}</option>`).join('');
  const storage = storageOverview({ online: navigator.onLine, configuredProvider: typeof saved.clientId === 'string' && saved.clientId.trim() ? saved.provider : null, connection: cloudConnection, folderConnections: deviceFolderLinks() });
  const modal = showDialog('Settings', '', `
    <div class="settings-layout"><nav class="settings-nav" aria-label="Settings categories">${groups.map(group => `<button type="button" data-settings-section="${group.id}">${html(group.label)}</button>`).join('')}</nav><nav class="settings-subnav" aria-label="Settings pages"></nav><div class="settings-content">
    <section class="settings-section settings-overview" data-settings-panel="overview"><h3 class="fb-heading">Overview</h3><div class="settings-overview-grid"><div class="fb-card fb-card--pad"><label class="fb-field">Theme<select id="overview-theme-choice">${themeOptions}</select></label><p class="fb-meta">Appearance applies only on this device.</p></div><div class="fb-card fb-card--pad"><h4 class="fb-heading">AI writing</h4><p class="fb-body">${ai.endpoint && ai.model ? 'Endpoint configured. Requests run only when you choose Generate.' : 'No endpoint configured.'}</p><button class="fb-btn fb-btn--text" data-settings-jump="ai">Configure AI →</button></div></div><h4 class="fb-heading">Connections</h4>${storage.map(item => `<div class="settings-connection"><span>${html(item.label)}${item.folderReferences.map(path => `<small class="local-path">${html(path)}</small>`).join('')}</span><b>${html({ available: 'Saved locally', connected: 'Connected this session', configured: 'Configured · reconnect', offline: 'Offline', 'folder-connected': 'Folder connected', 'folder-error': 'Folder save failed', 'folder-selected': 'Folder selected · enable saving', 'folder-pending': 'Saving folder…' }[item.state] || 'Not connected')}</b></div>`).join('')}<button class="fb-btn fb-btn--secondary" data-settings-jump="accounts">Manage accounts</button><p class="fb-meta">Fresh profiles receive four Getting started notes; existing vaults are kept. OAuth uploads require Sync; enabled local folders are written automatically and your desktop client manages their uploads.</p></section>
    <section class="settings-section" data-settings-panel="appearance" hidden><h3 class="fb-heading">Appearance</h3><label class="fb-field">Theme<select id="theme-choice">${themeOptions}</select></label><p class="fb-body">Light uses the original warm-neutral palette. Dark keeps the slate colors.</p><label class="settings-checkbox"><input id="hide-ai" type="checkbox" ${storageGet('nitrobison-hide-ai', 'false') === 'true' ? 'checked' : ''} />Hide AI buttons</label></section>
    <section class="settings-section" data-settings-panel="folders" hidden><h3 class="fb-heading">Folders</h3><label class="settings-checkbox"><input id="show-hidden-folders" type="checkbox" ${storageGet('nitrobison-show-hidden-folders', 'false') === 'true' ? 'checked' : ''} />Show hidden folders</label><p class="fb-body">Hide or unhide a folder from its action menu. Hidden folders and their contents are hidden from browsing on this device, not deleted or excluded from backups or sync. Enable this setting to find and unhide them. Selecting a folder never hides the other folders.</p></section>
    <section class="settings-section" data-settings-panel="connections" hidden><div class="settings-heading"><h3 class="fb-heading">Cloud accounts</h3><span class="fb-pill">Personal vault only</span></div><p class="fb-body">Connect Google Drive or OneDrive to sync the whole personal vault. Only business Google Drive labels display EA. Verification reads account/folder metadata; OneDrive may create its empty app folder on first verification. No notes upload until Sync. Tokens stay in memory.</p><details class="cloud-setup-guide" open><summary>Private / personal account: quickest setup</summary><ol>${nativeDesktop ? '<li>Install and sign in to the Google Drive or OneDrive desktop client with your own personal account.</li><li>Create a notes directory inside its synced folder.</li><li>Open a NitroBison folder → Show folder path → Choose local folder, or Enable Markdown saving for an old path reference.</li><li>Create a note. Check Folder connected and the .md file in Explorer. Your desktop client handles uploads; NitroBison does not claim it has verified a cloud upload.</li>' : '<li>Ask your host for the correct public OAuth client ID, or register your own app using the provider guide below.</li><li>Google: External audience, your Gmail in Test users while Testing, Web client with this exact origin.</li><li>OneDrive: personal Microsoft accounts, SPA callback shown below, tenant consumers.</li><li>Connect and verify the folder, then choose Sync personal vault. A saved client ID alone is not a connection.</li>'}</ol><p>Desktop folder saving needs no OAuth registration. Hosted/web account sync uses the separate provider steps below. Neither workflow makes an employer-owned business drive private.</p></details>
      <form id="cloud-form" class="dialog-form">
        <label class="fb-field">Provider<select name="provider"><option value="google" ${config.provider === 'google' ? 'selected' : ''}>Google Drive</option><option value="onedrive" ${config.provider === 'onedrive' ? 'selected' : ''}>OneDrive</option></select></label>
        <div class="cloud-setup-intro"><b>First time? Start here.</b><p>${nativeDesktop ? 'Use a desktop/public-client registration, not a Web or SPA client. Sign-in opens your system browser and returns through a temporary loopback callback. Existing browser notes do not move automatically: export a JSON backup there and restore it here first.' : 'One person registers an app for this NitroBison address, then copies its public client ID below. An ordinary cloud sign-in is not enough on its own. If someone hosts NitroBison for you, ask them for the client ID.'} You can keep using local notes without setting up a cloud account.</p></div>
        <details id="google-setup" class="cloud-setup-guide" open><summary><img class="provider-logo" src="/google-drive.svg" alt="" width="24" height="24" />Google Drive — step by step</summary><ol>
          <li>Open <a href="https://console.cloud.google.com/" target="_blank" rel="noopener noreferrer">Google Cloud Console</a>. Create or select a project, then find <b>APIs &amp; Services → Library</b> and enable <b>Google Drive API</b>.</li>
          <li>Open <b>Google Auth Platform</b>. Complete <b>Branding</b> with an app name and contact email. For a personal Gmail account, choose an <b>External</b> audience and add your Google email under <b>Test users</b> while testing. <b>Internal</b> is for users in your own Google Workspace organization.</li>
          <li>Under <b>Data Access</b>, request <code>https://www.googleapis.com/auth/drive.file</code> plus <code>openid profile email</code>. File access stays app-authorized; identity metadata distinguishes personal accounts from Workspace EA.</li>
          <li>Under <b>Clients</b>, create an OAuth client of type ${nativeDesktop ? '<b>Desktop app</b>, in the same project as your web client if you have one. No JavaScript origin or client secret is needed. A web-created vault may not be visible to this client: back it up first. Creating a new cloud vault requires a separate confirmation and does not merge an invisible web copy.' : `<b>Web application</b>. Add this exact <b>Authorized JavaScript origin</b>: <code class="setup-value">${html(location.origin)}</code>Google does not use the Microsoft callback below. Do not add a path to the origin.`}</li>
          <li>Copy the <b>Client ID</b> ending in <code>.apps.googleusercontent.com</code> into the field below. Do not copy a client secret or upload a credentials file.</li>
          <li>Press <b>Connect account</b>, ${nativeDesktop ? 'complete sign-in in your system browser' : 'allow the sign-in popup'}, and choose your Google account. Then press <b>Sync personal vault</b> to merge your notes. Nothing uploads just because you connect.</li>
        </ol><p>Work/Workspace accounts may need an administrator to approve this app. Testing is not the same as publishing an app for everyone.</p></details>
        <details id="onedrive-setup" class="cloud-setup-guide" open hidden><summary><img class="provider-logo" src="/onedrive.svg" alt="" width="24" height="24" />OneDrive — step by step</summary><ol>
          <li>Open <a href="https://entra.microsoft.com/" target="_blank" rel="noopener noreferrer">Microsoft Entra admin center</a>, then <b>App registrations → New registration</b>. If you cannot register an app, ask your administrator or NitroBison host to do this part.</li>
          <li>Name it <b>NitroBison</b>. Personal Microsoft accounts are the documented target for this permission. Choose <b>Personal Microsoft accounts only</b> for that setup, or <b>Accounts in any organizational directory and personal Microsoft accounts</b> for a mixed registration. Work/school sign-in does not guarantee app-folder access; Microsoft's documentation conflicts.</li>
          <li>In <b>Authentication → Add a platform</b>, select ${nativeDesktop ? '<b>Mobile and desktop applications</b> on the <b>same Entra application</b> used by the web client. Add <code class="setup-value">http://localhost</code> as the system-browser loopback redirect; the app chooses a temporary port. A different application ID uses a different OneDrive app folder.' : `<b>Single-page application</b>, not Web. Add this exact redirect URI: <code class="setup-value">${html(location.origin)}/oauth-callback.html</code>If the portal rejects an HTTP <code>127.0.0.1</code> callback, ask your host to register it using Microsoft's documented manifest procedure. Do not change hostnames without backing up your local notes: <code>localhost</code> has separate storage.`}</li>
          <li>In <b>API permissions → Add a permission → Microsoft Graph → Delegated permissions</b>, add <code>Files.ReadWrite.AppFolder</code>. Do not choose Application permissions or create a client secret. Your organization may require administrator consent.</li>
          <li>Return to the app's <b>Overview</b> and copy its <b>Application (client) ID</b> into the field below. Set the tenant to <code>consumers</code> for personal-only, <code>common</code> for a mixed registration, or your Directory (tenant) ID for a single organization. Work/school app-folder sync is unverified and may be blocked by tenant policy.</li>
          <li>Press <b>Connect account</b>, finish Microsoft sign-in, then press <b>Sync personal vault</b>. OneDrive needs to be provisioned for that account. The vault is stored in this app's folder, not an arbitrary SharePoint or Teams library.</li>
        </ol></details>
        <label class="fb-field">Public application client ID<input name="clientId" required value="${html(config.clientId || '')}" autocomplete="off" placeholder="Paste the client ID from your app registration" /></label>
        <label id="microsoft-tenant-field" class="fb-field" hidden>Microsoft tenant<input name="tenant" value="${html(config.tenant || 'common')}" placeholder="common" disabled /><span class="fb-meta"><code>consumers</code>: personal-only; <code>common</code>: mixed sign-in; <code>organizations</code> or tenant ID: work/school sign-in. Match the registration. Work/school app-folder access is unverified; sign-in alone is not proof of sync support.</span></label>
        <p class="fb-meta">Connect while online and ${nativeDesktop ? 'complete sign-in in your system browser' : 'allow popups'}. Client IDs are public identifiers, not passwords. Tokens stay in memory: reconnect after reopening NitroBison. Sync covers the whole personal vault; it does not browse arbitrary shared/team drives.</p>
        <div class="form-actions"><button class="fb-btn fb-btn--secondary">${cloudConnection ? 'Reconnect account' : 'Connect account'}</button>${nativeDesktop ? '<button class="fb-btn fb-btn--text" type="button" id="cancel-native-auth" hidden>Cancel sign-in</button>' : ''}</div>
      </form>
      <div class="cloud-connected"><p class="fb-body" id="cloud-state"></p><div class="form-actions"><button class="fb-btn fb-btn--primary" id="sync-cloud" disabled>${readonly() ? 'Refresh read-only vault' : 'Sync personal vault'}</button><button class="fb-btn fb-btn--secondary" id="disconnect-cloud" ${!cloudConnection ? 'disabled' : ''}>Disconnect</button></div></div>
    </section>
    <section class="settings-section" data-settings-panel="transfer" hidden><h3 class="fb-heading">Import & export</h3><p class="fb-body">Markdown files are portable. A JSON backup also preserves folders and note IDs. Import adds notes; restore replaces the current vault after making a recovery backup.</p>
      <div class="settings-buttons"><button class="fb-btn fb-btn--secondary" data-action="import-md" ${readonly() ? 'disabled' : ''}>Import Markdown files</button><button class="fb-btn fb-btn--secondary" data-action="import-folder" ${readonly() || !('webkitdirectory' in document.createElement('input')) ? 'disabled' : ''}>Import Markdown folder</button><button class="fb-btn fb-btn--secondary" data-action="export-vault" ${!nativeDesktop && !('showDirectoryPicker' in window) ? 'disabled aria-describedby="folder-export-help"' : ''}>Export Markdown folder</button><button class="fb-btn fb-btn--secondary" data-action="export-note" ${!currentNote() ? 'disabled' : ''}>Download current note</button><button class="fb-btn fb-btn--secondary" data-action="backup">Download JSON backup</button><button class="fb-btn fb-btn--secondary" data-action="restore" ${readonly() ? 'disabled' : ''}>Restore JSON backup</button></div>
      <p class="fb-meta" id="folder-export-help">${nativeDesktop ? 'Folder export uses the native directory chooser and creates portable Markdown files.' : 'Folder export is available in browsers with directory access, such as desktop Chrome and Edge. In other browsers, download individual Markdown notes or a complete JSON backup.'} Select an empty destination folder to avoid conflicts. Existing differing files are not overwritten.</p>
    </section>
    <section class="settings-section" data-settings-panel="about" hidden><h3 class="fb-heading">${nativeDesktop ? 'Desktop application' : 'Installation'}</h3><p class="fb-body">${nativeDesktop ? 'The interface is bundled for offline use. Browser notes use a different profile: export a JSON backup there and restore it here. Updates are manual.' : 'Install NitroBison for a focused window and offline access after caching completes.'} Keep external backups before removing app data.</p><p class="fb-meta">NitroBison ${APP_VERSION}</p><button type="button" class="fb-btn fb-btn--secondary" id="check-updates">Check for updates</button><p id="update-status" class="fb-body" role="status"></p>${nativeDesktop ? '' : `<button class="fb-btn fb-btn--secondary" data-action="install">${icon('download')}Installation help</button>`}</section>
    <section class="settings-section" data-settings-panel="ai" hidden>
      <div class="settings-heading"><h3 class="fb-heading" id="ai-provider-heading">AI endpoint &amp; key</h3><span class="fb-pill">OpenAI-compatible</span></div>
      <p class="fb-body">Choose a provider in the middle menu (or enter any custom OpenAI-compatible URL below). Generate from an explicit <code>/AI your request</code> line, or use the <b>Revise Page</b> section in Note details to revise the active note. Nothing is sent automatically.</p>
      <div id="ai-provider-guide" class="cloud-setup-guide ai-provider-guide"></div>
      <form id="ai-config-form" class="dialog-form">
        <label class="fb-field">Chat-completions endpoint<input name="endpoint" type="url" required maxlength="4096" value="${html(ai.endpoint)}" placeholder="https://api.openai.com/v1/chat/completions" autocomplete="off" /></label>
        <label class="fb-field">Model<input name="model" required maxlength="256" value="${html(ai.model)}" placeholder="Model ID from your provider" autocomplete="off" /></label>
        <label class="fb-field">API key <span class="fb-meta" id="ai-key-hint"></span><input name="apiKey" type="password" maxlength="8192" value="${html(aiSettings.apiKey)}" placeholder="Paste API key (leave empty for unauthenticated local models)" autocomplete="off" /></label>
        <label class="settings-checkbox"><input type="checkbox" name="remember" ${aiSettings.remember ? 'checked' : ''} />Remember endpoint, model and API key on this device</label>
        <p class="fb-notice">${nativeDesktop ? 'Remembered settings use OS-encrypted storage in this application profile. They are not included in note backups or cloud sync.' : 'Remembering stores the API key in this browser profile. Browser storage is not a secure secret vault: same-origin scripts and people with access to the profile can read it.'} Leave unchecked for this session only; applying that choice clears previously remembered settings.</p>
        <p class="fb-meta">Never share screenshots containing an API key; revoke any exposed key immediately. Requests time out after 120 seconds and provider charges may apply.</p>
        <div class="form-actions"><button type="button" class="fb-btn fb-btn--text" id="clear-ai-key">Clear key</button><button type="button" class="fb-btn fb-btn--secondary" id="test-ai-connection">Test connection</button><button class="fb-btn fb-btn--primary">Apply AI settings</button></div>
        <div id="ai-config-status" class="settings-feedback" role="status" hidden>${icon('ai')}<span id="ai-config-message"></span>${button('dismiss-ai-feedback', 'Dismiss AI status', 'close', 'type="button"')}</div>
      </form>
    </section>
    </div></div>`);
  for (const selector of ['#theme-choice', '#overview-theme-choice']) $(selector, modal).addEventListener('change', event => { setTheme(event.target.value); $('#theme-choice', modal).value = event.target.value; $('#overview-theme-choice', modal).value = event.target.value; });
  $('#check-updates', modal).addEventListener('click', async event => {
    const status = $('#update-status', modal);
    const button = event.currentTarget;
    button.disabled = true;
    status.textContent = 'Checking GitHub…';
    try {
      const response = await fetch('https://api.github.com/repos/emiltange/NitroBison/releases/latest', { headers: { Accept: 'application/vnd.github+json' } });
      if (!response.ok) throw new Error(`GitHub answered ${response.status}`);
      const release = await response.json();
      const latest = String(release.tag_name).replace(/^v/, '');
      const releaseUrl = /^https:\/\/github\.com\//.test(release.html_url) ? release.html_url : 'https://github.com/emiltange/NitroBison/releases/latest';
      status.innerHTML = latest.localeCompare(APP_VERSION, undefined, { numeric: true }) > 0
        ? `NitroBison ${html(latest)} is available. <a href="${html(releaseUrl)}" target="_blank" rel="noopener noreferrer">Download it from GitHub</a>.`
        : `You're up to date (${html(APP_VERSION)}).`;
    } catch (error) {
      status.textContent = `Could not check for updates: ${error.message}`;
    } finally { button.disabled = false; }
  });
  $('#hide-ai', modal).addEventListener('change', event => { storageSet('nitrobison-hide-ai', String(event.target.checked)); applyHideAI(); });
  $('#show-hidden-folders', modal).addEventListener('change', event => { void run(() => { try { localStorage.setItem('nitrobison-show-hidden-folders', String(event.target.checked)); } catch (error) { event.target.checked = storageGet('nitrobison-show-hidden-folders', 'false') === 'true'; throw error; } renderChrome(); }); });
  $('#ai-config-form', modal).addEventListener('submit', event => {
    event.preventDefault();
    void run(async () => {
      const values = Object.fromEntries(new FormData(event.target));
      const remember = values.remember === 'on';
      const checked = await writeAISettings({ endpoint: values.endpoint.trim(), model: values.model.trim(), apiKey: values.apiKey.trim() }, remember, nativeDesktop);
      aiSettings = { ...checked, remember };
      renderChrome();
      showAISettingsFeedback(modal, remember ? `AI settings applied · remembered on this device${nativeDesktop ? ' using OS encryption' : ' in browser storage'}.` : 'AI settings applied for this session only. Previously remembered settings cleared.', event.submitter);
    });
  });
  $('#clear-ai-key', modal).addEventListener('click', event => {
    const trigger = event.currentTarget;
    void run(async () => {
      const checked = await writeAISettings({ ...aiConfig(), apiKey: '' }, aiSettings.remember, nativeDesktop);
      aiSettings = { ...checked, remember: aiSettings.remember };
      $('#ai-config-form [name="apiKey"]', modal).value = '';
      renderChrome();
      showAISettingsFeedback(modal, 'API key cleared from this session and remembered settings.', trigger);
    });
  });
  bindAIConnectionTest($('#ai-config-form', modal), $('#test-ai-connection', modal), modal);
  $('#cancel-native-auth', modal)?.addEventListener('click', () => void run(() => nativeDesktop.cancelAuthorization()));
  const providerChoice = $('#cloud-form [name="provider"]', modal);
  const updateProviderSetup = () => {
    const microsoft = providerChoice.value === 'onedrive';
    $('#google-setup', modal).hidden = microsoft;
    $('#onedrive-setup', modal).hidden = !microsoft;
    $('#microsoft-tenant-field', modal).hidden = !microsoft;
    $('[name="tenant"]', modal).disabled = !microsoft;
    const entry = storage.find(item => item.id === providerChoice.value);
    $('.settings-heading h3', modal).textContent = entry.label;
    $('#cloud-state', modal).textContent = `${entry.detail}${entry.folderReferences.length ? ` Folder: ${entry.folderReferences.join(' · ')}` : ''}${readonly() && cloudConnection?.connected ? ' Connected vault is read-only; refresh never uploads.' : ''}`;
    const sameProvider = cloudConnection?.connected && (cloudConnection.name === 'OneDrive' ? 'onedrive' : 'google') === providerChoice.value;
    $('#sync-cloud', modal).disabled = !sameProvider || !navigator.onLine;
  };
  providerChoice.addEventListener('change', updateProviderSetup);
  updateProviderSetup();
  const detectAIProviderPage = () => {
    const currentUrl = ($('#ai-config-form [name="endpoint"]', modal)?.value || ai.endpoint || '').toLowerCase();
    if (currentUrl.includes('anthropic.com')) return 'ai-claude';
    if (currentUrl.includes('generativelanguage.googleapis.com')) return 'ai-gemini';
    if (currentUrl.includes('deepseek.com')) return 'ai-deepseek';
    if (currentUrl.includes('azure.com') || currentUrl.includes('github')) return 'ai-copilot';
    if (currentUrl.includes('127.0.0.1') || currentUrl.includes('localhost')) return 'ai-local';
    return 'ai-openai';
  };
  const renderAIProviderGuide = providerKey => {
    const info = aiProviders[providerKey] || aiProviders.openai;
    $('#ai-provider-heading', modal).textContent = `${info.label} — setup & key`;
    $('#ai-key-hint', modal).textContent = info.keyHint;
    const extraPreset = providerKey === 'local'
      ? `<button type="button" class="fb-btn fb-btn--secondary" data-ai-preset-endpoint="http://127.0.0.1:1234/v1/chat/completions" data-ai-preset-model="local-model">Use LM Studio preset (:1234)</button>`
      : '';
    const presetLabel = providerKey === 'copilot' ? 'Use Foundry template' : providerKey === 'local' ? 'Use Ollama preset (:11434)' : `Use ${info.label.split(' ')[0]} preset`;
    $('#ai-provider-guide', modal).innerHTML = `<div class="ai-guide-header"><b>${html(info.label)} step-by-step</b><div class="ai-preset-actions"><button type="button" class="fb-btn fb-btn--secondary" data-ai-preset-endpoint="${html(info.endpoint)}" data-ai-preset-model="${html(info.model)}">${html(presetLabel)}</button>${extraPreset}</div></div><ol>${info.steps.map(step => `<li>${step}</li>`).join('')}</ol><div class="ai-preset-preview"><span>Endpoint: <code>${html(info.endpoint)}</code></span><span>Example model: <code>${html(info.model)}</code></span></div><p class="fb-meta">${html(info.note)}</p>`;
  };
  $('#ai-provider-guide', modal).addEventListener('click', event => {
    const preset = event.target.closest('[data-ai-preset-endpoint]');
    if (!preset) return;
    $('#ai-config-form [name="endpoint"]', modal).value = preset.dataset.aiPresetEndpoint;
    if (!$('#ai-config-form [name="model"]', modal).value.trim() || Object.values(aiProviders).some(p => p.model === $('#ai-config-form [name="model"]', modal).value.trim()) || $('#ai-config-form [name="model"]', modal).value === 'local-model') {
      $('#ai-config-form [name="model"]', modal).value = preset.dataset.aiPresetModel;
    }
    $('#ai-config-form [name="apiKey"]', modal).focus();
  });
  let activeSection;
  const activateSettings = (sectionId, pageId) => {
    const normalizedSection = sectionId === 'ai' || String(pageId || '').startsWith('ai-') ? 'ai' : sectionId;
    const group = groups.find(item => item.id === normalizedSection) || groups[0];
    const fallbackPage = group.id === 'accounts' && ['google', 'onedrive'].includes(saved.provider) ? saved.provider : group.id === 'ai' ? detectAIProviderPage() : group.pages[0][0];
    const selectedPage = group.pages.some(([id]) => id === pageId) ? pageId : fallbackPage;
    activeSection = group.id;
    modal.querySelectorAll('[data-settings-section]').forEach(control => control.setAttribute('aria-current', control.dataset.settingsSection === group.id ? 'page' : 'false'));
    $('.settings-subnav', modal).innerHTML = group.pages.map(([id, label]) => `<button type="button" data-settings-page="${id}" ${id === selectedPage ? 'aria-current="page"' : ''}>${html(label)}</button>`).join('');
    const panel = ['google', 'onedrive'].includes(selectedPage) ? 'connections' : selectedPage.startsWith('ai-') ? 'ai' : selectedPage;
    modal.querySelectorAll('[data-settings-panel]').forEach(item => { item.hidden = item.dataset.settingsPanel !== panel; });
    if (['google', 'onedrive'].includes(selectedPage)) { providerChoice.value = selectedPage; updateProviderSetup(); }
    if (selectedPage.startsWith('ai-')) renderAIProviderGuide(selectedPage.slice(3));
    $('.settings-content', modal).scrollTop = 0;
  };
  $('.settings-layout', modal).addEventListener('click', event => { const category = event.target.closest('[data-settings-section], [data-settings-jump]'); const subpage = event.target.closest('[data-settings-page]'); if (category) activateSettings(category.dataset.settingsSection || category.dataset.settingsJump); else if (subpage) activateSettings(activeSection, subpage.dataset.settingsPage); });
  activateSettings(section, page);
  $('#cloud-form', modal).addEventListener('submit', event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    storageSet('herd-cloud-config', JSON.stringify(values));
    renderChrome();
    const submit = $('button', event.target);
    submit.disabled = true;
    if (nativeDesktop) $('#cancel-native-auth', modal).hidden = false;
    $('#cloud-state').textContent = 'Connecting… Complete sign-in in the provider window.';
    run(async () => {
      const connection = await connectCloud(values);
      try { await connection.verify(); } catch (error) { connection.disconnect(); throw error; }
      cloudConnection?.disconnect();
      cloudConnection = connection;
      if ($('#modal').open) settingsDialog('accounts', values.provider);
      renderChrome();
    }).finally(() => { renderChrome(); if (submit.isConnected) { submit.disabled = false; if (nativeDesktop) $('#cancel-native-auth', modal).hidden = true; if (!cloudConnection && $('#cloud-state')) $('#cloud-state').textContent = 'Not connected. Check the error message and try again.'; } });
  });
  $('#sync-cloud', modal).addEventListener('click', event => {
    const control = event.currentTarget;
    control.disabled = true;
    $('#cloud-state').textContent = 'Syncing… Local and cloud edits are being merged.';
    run(async () => { await workspace.syncCloud(cloudConnection); await cloudConnection.verify(); if ($('#modal').open) settingsDialog('accounts', providerChoice.value); renderChrome(); }, 'Cloud refresh complete.').finally(() => { if (control.isConnected) control.disabled = false; });
  });
  $('#disconnect-cloud', modal).addEventListener('click', () => { cloudConnection.disconnect(); cloudConnection = null; settingsDialog('accounts', providerChoice.value); renderChrome(); notice('Cloud disconnected. Your local notes are unchanged.'); });
}

function aiConfig() { return { endpoint: aiSettings.endpoint, model: aiSettings.model }; }
function openAIChat() {
  view = 'ai-chat';
  if ($('#modal').open) $('#modal').close();
  $('.workspace-shell').classList.remove('sidebar-open', 'context-open');
  renderChrome();
  syncRoute();
  $('#ai-page-input')?.focus();
}

function aiConnectDialog(pendingPrompt = '') {
  const currentEndpoint = (aiSettings.endpoint || '').toLowerCase();
  let activeProvider = AI_PROVIDER_CATALOG.find(item => {
    if (item.id === 'claude' && currentEndpoint.includes('anthropic.com')) return true;
    if (item.id === 'gemini' && currentEndpoint.includes('generativelanguage.googleapis.com')) return true;
    if (item.id === 'deepseek' && currentEndpoint.includes('deepseek.com')) return true;
    if (item.id === 'copilot' && currentEndpoint.includes('azure.com')) return true;
    if (item.id === 'local' && (currentEndpoint.includes('127.0.0.1') || currentEndpoint.includes('localhost'))) return true;
    if (item.id === 'openai' && currentEndpoint.includes('openai.com')) return true;
    return false;
  }) || AI_PROVIDER_CATALOG[0];

  const modal = showDialog(
    isAIConfigured(aiSettings) ? 'Manage AI connection' : 'Connect your AI provider',
    'NitroBison AI',
    `<div class="ai-connect-dialog">
      <p class="fb-body">Choose your AI provider (ChatGPT, Claude, Gemini, DeepSeek, Microsoft Foundry, or offline Local AI), open its key/setup page if you haven’t set one up yet, and connect below.</p>
      <div class="ai-connect-grid" role="group" aria-label="AI providers">
        ${AI_PROVIDER_CATALOG.map(provider => `
          <button type="button" class="ai-connect-card" data-connect-provider="${html(provider.id)}" aria-pressed="${provider.id === activeProvider.id}">
            <b>${html(provider.shortLabel)}</b>
            <small>${html(provider.summary)}</small>
          </button>
        `).join('')}
      </div>
      <div class="ai-connect-howto" id="ai-connect-howto"></div>
      <form id="ai-quick-connect-form" class="dialog-form">
        <label class="fb-field">API key <span class="fb-meta" id="ai-quick-key-note"></span><input name="apiKey" type="password" maxlength="8192" value="${html(aiSettings.apiKey)}" placeholder="Paste your API key…" autocomplete="off" /></label>
        <div class="properties-dates">
          <label class="fb-field">Model<input name="model" required maxlength="256" value="${html(aiSettings.model || activeProvider.model)}" autocomplete="off" /></label>
          <label class="fb-field">Endpoint URL<input name="endpoint" type="url" required maxlength="4096" value="${html(aiSettings.endpoint || activeProvider.endpoint)}" autocomplete="off" /></label>
        </div>
        <label class="settings-checkbox"><input type="checkbox" name="remember" ${aiSettings.remember ? 'checked' : ''} />Remember on this device${nativeDesktop ? ' (OS-encrypted)' : ''}</label>
        <div class="form-actions">
          <button type="button" class="fb-btn fb-btn--text" id="ai-open-full-guide">Full step-by-step setup guide →</button>
          <button type="button" class="fb-btn fb-btn--secondary" data-action="close-modal">Cancel</button>
          <button type="button" class="fb-btn fb-btn--secondary" id="test-ai-quick-connection">Test connection</button>
          <button type="submit" class="fb-btn fb-btn--primary">${pendingPrompt ? 'Connect & send' : 'Connect AI'}</button>
        </div>
        <div id="ai-config-status" class="settings-feedback" role="status" hidden>${icon('ai')}<span id="ai-config-message"></span>${button('dismiss-ai-feedback', 'Dismiss AI status', 'close', 'type="button"')}</div>
      </form>
    </div>`
  );

  const syncSelectedProvider = (provider, overwriteFields = false) => {
    activeProvider = provider;
    modal.querySelectorAll('[data-connect-provider]').forEach(btn => {
      btn.setAttribute('aria-pressed', String(btn.dataset.connectProvider === provider.id));
    });
    const localNoKey = provider.id === 'local';
    $('#ai-connect-howto', modal).innerHTML = `<span>Need a key or setup instructions for <b>${html(provider.label)}</b>?</span><a href="${html(provider.setupUrl)}" target="_blank" rel="noopener noreferrer">${html(provider.setupLinkText)}</a>`;
    $('#ai-quick-key-note', modal).textContent = localNoKey ? '(Optional for localhost)' : '(Required)';
    const keyField = $('#ai-quick-connect-form [name="apiKey"]', modal);
    keyField.required = !localNoKey;
    keyField.placeholder = localNoKey ? 'Leave empty for unauthenticated Ollama / LM Studio' : `Paste your ${provider.shortLabel} API key…`;
    if (overwriteFields) {
      $('#ai-quick-connect-form [name="endpoint"]', modal).value = provider.endpoint;
      $('#ai-quick-connect-form [name="model"]', modal).value = provider.model;
    }
  };

  syncSelectedProvider(activeProvider, !aiSettings.endpoint);
  modal.querySelectorAll('[data-connect-provider]').forEach(btn => {
    btn.addEventListener('click', () => {
      const found = AI_PROVIDER_CATALOG.find(item => item.id === btn.dataset.connectProvider);
      if (found) syncSelectedProvider(found, true);
      $('#ai-quick-connect-form [name="apiKey"]', modal).focus();
    });
  });
  $('#ai-open-full-guide', modal).addEventListener('click', () => {
    settingsDialog('ai', `ai-${activeProvider.id}`);
  });
  $('#ai-quick-connect-form', modal).addEventListener('submit', event => {
    event.preventDefault();
    const values = Object.fromEntries(new FormData(event.target));
    const remember = values.remember === 'on';
    void run(async () => {
      const next = { endpoint: values.endpoint.trim(), model: values.model.trim(), apiKey: values.apiKey.trim() };
      if (!isAIConfigured(next)) throw new Error('Enter a valid API key for this provider (or choose Local AI on localhost).');
      const checked = await writeAISettings(next, remember, nativeDesktop);
      aiSettings = { ...checked, remember };
      modal.close();
      renderChrome();
      notice(`Connected to ${activeProvider.shortLabel} (${checked.model}).`);
      if (pendingPrompt) {
        if (view !== 'ai-chat') openAIChat();
        aiChat?.submitPendingPrompt(pendingPrompt);
      }
    });
  });
  bindAIConnectionTest($('#ai-quick-connect-form', modal), $('#test-ai-quick-connection', modal), modal);
}

function showAISettingsFeedback(modal, message, trigger, tone = 'success') {
  clearTimeout(aiFeedbackTimer);
  const status = $('#ai-config-status', modal);
  if (!status) return;
  $('#ai-config-message', modal).textContent = message;
  status.dataset.tone = tone;
  status.setAttribute('role', tone === 'error' ? 'alert' : 'status');
  status.hidden = false;
  status.scrollIntoView({ block: 'nearest' });
  if (tone === 'success') {
    aiFeedbackTimer = setTimeout(() => { status.hidden = true; }, 10000);
  }
  if (!matchMedia('(prefers-reduced-motion: reduce)').matches && trigger && !trigger.matches(':focus-visible')) {
    const style = getComputedStyle(status);
    const duration = style.getPropertyValue('--dur-popover').trim();
    status.getAnimations().forEach(animation => animation.cancel());
    status.animate([{ opacity: 0, transform: `translateY(${style.getPropertyValue('--enter-shift').trim()})` }, { opacity: 1, transform: 'translateY(0)' }], { duration: parseFloat(duration) * (duration.endsWith('ms') ? 1 : 1000), easing: style.getPropertyValue('--ease-out').trim() });
  }
}

function bindAIConnectionTest(form, trigger, modal) {
  let activeController = null;
  trigger.addEventListener('click', async () => {
    if (activeController) {
      activeController.abort();
      return;
    }
    const values = Object.fromEntries(new FormData(form));
    const candidate = {
      endpoint: String(values.endpoint || '').trim(),
      model: String(values.model || '').trim(),
      apiKey: String(values.apiKey || '').trim(),
    };
    const controller = new AbortController();
    activeController = controller;
    aiRequest?.abort();
    aiRequest = controller;
    const originalText = trigger.textContent;
    trigger.textContent = 'Cancel test';
    showAISettingsFeedback(modal, `Testing connection to ${candidate.model || 'provider'}…`, trigger, 'pending');
    try {
      const { model, reply, latencyMs } = await testAIConnection(candidate, { signal: controller.signal });
      if (!form.isConnected) return;
      showAISettingsFeedback(modal, `Connected (${latencyMs} ms) · ${model} replied: “${reply}”`, trigger, 'success');
    } catch (error) {
      if (!form.isConnected) return;
      if (error?.name === 'AbortError') {
        showAISettingsFeedback(modal, 'Connection test cancelled.', trigger, 'pending');
      } else {
        showAISettingsFeedback(modal, error?.message || 'Connection test failed.', trigger, 'error');
      }
    } finally {
      if (activeController === controller) activeController = null;
      if (aiRequest === controller) aiRequest = null;
      if (trigger.isConnected) trigger.textContent = originalText;
    }
  });
}

async function aiDialog(revise = false) {
  const draft = drafts.get(selected);
  if (draft && !await persist(draft)) return;
  if (pending) throw new Error('Wait for your note edits to finish saving before using AI.');
  const source = currentNote();
  if (!source || readonly()) return;
  const command = findAICommand(source.content, $('#editor').selectionStart);
  const config = aiConfig();
  if ((!revise && !command) || !config.endpoint || !config.model) {
    const modal = showDialog('AI writing', '', `<p class="fb-body">${revise || command ? 'Configure an endpoint and model first.' : 'In Write (Markdown) or Split, type /AI followed by your request on its own line. Keep the caret on that line and press Ctrl/⌘ + Enter, or choose Generate with AI.'}</p><button class="fb-btn fb-btn--secondary" id="open-ai-settings">AI settings</button>`);
    $('#open-ai-settings', modal).addEventListener('click', () => settingsDialog('ai'));
    return;
  }
  validateAIConfig({ ...config, apiKey: aiSettings.apiKey });
  const context = revise ? `\n\nNote: ${source.title}\n\nMarkdown:\n${source.content}` : '';
  const instruction = revise ? 'Revise this Markdown note according to the request. Return only the complete revised Markdown, without a wrapping code fence.\n\nRequest:\n' : '';
  const promptLimit = 65536 - instruction.length - context.length;
  if (promptLimit < 1) throw new Error('This note is too large for the 65536-character AI context limit. No content was sent.');
  aiRequest?.abort();
  let result = null;
  const modal = showDialog(revise ? 'Revise this note with AI' : 'Write with AI', '', `<p class="fb-body">${revise ? `Your request and the full Markdown of “${html(source.title)}”` : 'Only the prompt below'} will be sent to <b>${html(new URL(config.endpoint).origin)}</b>. ${revise ? 'No other notes or private device paths are sent.' : 'No note context is sent.'} Review the generated Markdown before applying. Provider charges may apply.</p>${revise ? `<details><summary>Note context to send</summary><pre class="reference-excerpt">${html(source.content)}</pre></details>` : ''}<form id="ai-generate-form" class="dialog-form"><label class="fb-field">${revise ? 'What should change?' : 'Prompt'}<textarea id="ai-prompt" required maxlength="${promptLimit}" rows="4">${html(revise ? '' : command.prompt)}</textarea></label><div class="form-actions"><button type="button" class="fb-btn fb-btn--text" id="ai-cancel" hidden>Cancel generation</button><button class="fb-btn fb-btn--primary" id="ai-generate">${revise ? 'Generate revision' : 'Generate'}</button></div></form><p id="ai-status" class="fb-meta" role="status"></p><div id="ai-result-section" class="dialog-form" hidden><label class="fb-field">Generated Markdown<textarea id="ai-result" readonly rows="10"></textarea></label><p class="fb-meta">${revise ? 'Applying replaces the full note content; title and folder stay unchanged.' : 'Only the original /AI line is replaced.'} If the note changes, keep the generated text here and copy it manually.</p><button class="fb-btn fb-btn--primary" id="ai-apply">${revise ? 'Apply revision' : 'Insert into note'}</button></div>`);
  const form = $('#ai-generate-form', modal);
  const submit = $('#ai-generate', modal);
  const cancel = $('#ai-cancel', modal);
  const status = $('#ai-status', modal);
  const resultField = $('#ai-result', modal);
  const resultSection = $('#ai-result-section', modal);
  cancel.addEventListener('click', () => aiRequest?.abort());
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (aiRequest) return;
    const controller = new AbortController();
    aiRequest = controller;
    submit.disabled = true;
    cancel.hidden = false;
    status.textContent = 'Generating…';
    try {
      const generated = await generateAI({ ...config, apiKey: aiSettings.apiKey }, instruction + $('#ai-prompt', modal).value + context, { signal: controller.signal });
      if (!modal.open || !form.isConnected) return;
      result = generated;
      resultField.value = generated;
      resultSection.hidden = false;
      status.textContent = 'Generated. Review before inserting.';
    } catch (error) { if (form.isConnected) status.textContent = error.name === 'AbortError' ? 'Generation cancelled. Your note is unchanged.' : error.message; }
    finally { if (aiRequest === controller) aiRequest = null; if (form.isConnected) { submit.disabled = false; cancel.hidden = true; } }
  });
  $('#ai-apply', modal).addEventListener('click', async () => {
    const current = currentNote();
    if (!result || pending || drafts.has(source.id) || current?.id !== source.id || current.content !== source.content || readonly()) { report(new Error('The note changed or is still saving. Copy the generated Markdown before closing; the note was not overwritten.')); return; }
    pending++; renderChrome();
    try {
      await workspace.applyAIRevision(source.id, source.content, revise ? result : source.content.slice(0, command.start) + result + source.content.slice(command.end));
      modal.close(); notice(revise ? 'AI revision applied and saved.' : 'AI writing inserted and saved.');
    } catch (error) { report(error); }
    finally { pending--; renderChrome(); }
  });
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
  if (count === null) return;
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
  const referenceControl = event.target.closest('[data-reference-source]');
  if (referenceControl) {
    event.preventDefault();
    showReferenceMenu(referenceControl, referenceControl.dataset.referenceSource, referenceControl.dataset.referenceTarget, referenceControl.dataset.referenceOpen);
    return;
  }
  const noteControl = event.target.closest('[data-note]');
  if (noteControl && !event.target.closest('.graph-view')) {
    if (noteControl.matches('a') && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return;
    event.preventDefault();
    const preview = noteControl.closest('#preview, #folder-overview-body');
    if (preview) {
      const source = preview.id === 'preview' ? currentNote() : folderOverview(notes(), folderFilter).note;
      if (source) showReferenceMenu(noteControl, source.id, noteControl.dataset.note);
    } else {
      const targetWs = noteControl.dataset.workspaceId;
      if ($('#modal').open) $('#modal').close();
      if ($('#reference-menu').matches(':popover-open')) $('#reference-menu').hidePopover();
      if (targetWs && targetWs !== workspace.id) await run(async () => { await switchActiveWorkspace(targetWs); openNote(noteControl.dataset.note); });
      else openNote(noteControl.dataset.note);
    }
    return;
  }
  const modeControl = event.target.closest('button[data-mode]');
  if (modeControl) {
    if (readonly() && modeControl.dataset.mode !== 'preview') return;
    mode = modeControl.dataset.mode;
    renderNote();
    if (mode === 'modern') modernWrite?.focus();
    return;
  }
  const headingControl = event.target.closest('[data-heading]');
  if (headingControl) {
    if (mode === 'edit' || mode === 'modern') { mode = 'preview'; renderNote(); }
    requestAnimationFrame(() => { const heading = document.getElementById(headingControl.dataset.heading); heading?.scrollIntoView({ block: 'start' }); heading?.setAttribute('tabindex', '-1'); heading?.focus({ preventScroll: true }); });
    return;
  }
  const folderSummary = event.target.closest('.tree-folder > summary');
  if (folderSummary && !event.target.closest('button')) { event.preventDefault(); openProject(folderSummary.parentElement.dataset.folder); return; }
  const control = event.target.closest('[data-action]');
  if (!control || control.disabled) return;
  const action = control.dataset.action;
  if (control.closest('#folder-menu, #workspace-menu')) control.closest('[popover]').hidePopover();
  if (action === 'home') { event.preventDefault(); view = 'home'; folderFilter = null; creationFolder = null; $('.workspace-shell').classList.remove('sidebar-open', 'context-open'); renderChrome(); syncRoute(); $('#main').focus(); }
  else if (action === 'notes') { folderFilter = null; creationFolder = null; query = ''; $('#search').value = ''; view = 'note'; renderChrome(); syncRoute(); }
  else if (action === 'views') openViews(undefined, control.dataset.viewLayout);
  else if (action === 'ai-chat') openAIChat();
  else if (action === 'workspace-menu') { event.preventDefault(); showWorkspaceMenu(control); }
  else if (action === 'switch-workspace') await run(() => switchActiveWorkspace(control.dataset.workspaceId));
  else if (action === 'new-workspace') workspaceDialog(false);
  else if (action === 'rename-workspace') workspaceDialog(true);
  else if (action === 'tag-view') await run(async () => { if (control.dataset.workspaceId && control.dataset.workspaceId !== workspace.id) await switchActiveWorkspace(control.dataset.workspaceId); openViews(control.dataset.tag); });
  else if (action === 'views-all-folders') { folderFilter = null; creationFolder = null; renderChrome(); syncRoute(); }
  else if (action === 'properties') await run(() => propertiesDialog(control.dataset.id || selected));
  else if (action === 'repair-properties' && !readonly()) { $('#modal').close(); mode = 'edit'; openNote(control.dataset.id); $('#editor').focus(); }
  else if (action === 'insert-list-db') insertInlineListDatabase();
  else if (action === 'export-record') { const note = notes().find(item => item.id === control.dataset.id); if (note) { download(`${filename(note.title)}.md`, note.content, 'text/markdown;charset=utf-8'); notice('Original Markdown note exported with its properties.'); } }
  else if (action === 'graph') { view = 'graph'; $('.workspace-shell').classList.remove('sidebar-open', 'context-open'); renderChrome(); syncRoute(); }
  else if (action === 'sidebar') {
    const shell = $('.workspace-shell');
    const opened = sidebarDesktop.matches ? !shell.classList.toggle('sidebar-closed') : shell.classList.toggle('sidebar-open');
    syncSidebarToggle();
    if (opened) (view === 'graph' ? $('#graph-navigation input[type="search"]') : view === 'views' ? $('#views-side-navigation select, #views-side-navigation button') : $('#search'))?.focus();
  }
  else if (action === 'note-details') {
    const shell = $('.workspace-shell');
    const opened = matchMedia('(min-width: 1161px)').matches ? !shell.classList.toggle('context-closed') : shell.classList.toggle('context-open');
    document.querySelectorAll('[data-action="note-details"]').forEach(item => item.setAttribute('aria-expanded', String(opened)));
    if (opened) $('#context-panel [data-action="note-details"]').focus({ preventScroll: true });
    else $('.note-toolbar [data-action="note-details"]').focus({ preventScroll: true });
  }
  else if (action === 'new-note') createNote();
  else if (action === 'folder-toggle') {
    event.preventDefault();
    const folder = control.closest('.tree-folder');
    folder.open = !folder.open;
    control.setAttribute('aria-expanded', String(folder.open));
    const label = folder.dataset.folder ? `${folder.dataset.folder} pages` : 'Private pages';
    control.setAttribute('aria-label', `${folder.open ? 'Collapse' : 'Expand'} ${label}`);
  }
  else if (action === 'folder-edit' && view === 'folder') editFolderOverview();
  else if (action === 'folder-directory' && view === 'folder') void chooseFolderDirectory();
  else if (action === 'folder-directory-clear' && view === 'folder') await run(() => workspace.saveFolderPreferences(folderFilter, { directory: null }), 'Device folder location cleared.');
  else if (action === 'folder-banner' && view === 'folder') { bannerTarget = { folder: folderFilter, scope: bookmarkKey() }; $('#folder-banner-file').click(); }
  else if (action === 'folder-remove-banner' && view === 'folder') await run(() => workspace.saveFolderPreferences(folderFilter, { banner: null }), 'Banner hidden for you on this device.');
  else if (action === 'folder-directory-open' && nativeDesktop && view === 'folder') await run(() => nativeDesktop.openDirectory(workspace.folderPreferences[folderFilter].directory));
  else if (action === 'folder-menu') { event.preventDefault(); showFolderMenu(control.dataset.folder, control); }
  else if (action === 'folder-new-note') createNote(control.dataset.folder);
  else if (action === 'folder-new-folder' && !readonly()) folderDialog(null, false, control.dataset.folder);
  else if (action === 'folder-path' && nativeDesktop) folderPathDialog(control.dataset.folder);
  else if (action === 'folder-saving' && nativeDesktop) await run(async () => {
    const folder = control.dataset.folder;
    const inDialog = Boolean(control.closest('#modal'));
    await workspace.saveFolderPreferences(folder, { directorySync: !workspace.folderPreferences[folder]?.directorySync });
    if (inDialog && $('#modal').open) folderPathDialog(folder);
  });
  else if (action === 'folder-hide') await run(async () => {
    const folder = control.dataset.folder;
    const hidden = !workspace.folderPreferences[folder]?.hidden;
    await workspace.saveFolderPreferences(folder, { hidden });
    if (hidden && creationFolder !== null && projectContains({ folder: creationFolder }, folder)) creationFolder = null;
    if (hidden && currentNote() && projectContains(currentNote(), folder)) selected = null;
    if (hidden && folderFilter !== null && projectContains({ folder: folderFilter }, folder)) { folderFilter = null; creationFolder = null; selected = null; view = 'note'; }
    renderChrome(); syncRoute();
    notice(hidden ? 'Folder hidden on this device. Enable Show hidden folders in Settings to find it again.' : 'Folder no longer hidden.');
  });
  else if (action === 'folder-graph') openGraphFolder(control.dataset.folder);
  else if (action === 'ai') await run(aiDialog);
  else if (action === 'ai-revise') await run(() => aiDialog(true));
  else if (action === 'linked-folders') { graphMode = 'folders'; folderFilter = null; view = 'graph'; $('.workspace-shell').classList.remove('sidebar-open', 'context-open'); renderChrome(); syncRoute(); }
  else if (action === 'close-menu') { const menu = control.closest('[popover]'); if (menu.matches(':popover-open')) menu.hidePopover(); (popoverTrigger?.isConnected ? popoverTrigger : $('#main')).focus({ preventScroll: true }); }
  else if (action === 'dismiss-notice') { clearTimeout(noticeTimer); $('#announcement').hidden = true; }
  else if (action === 'dismiss-ai-feedback') { clearTimeout(aiFeedbackTimer); const box = control.closest('#ai-config-status') || $('#ai-config-status'); if (box) box.hidden = true; }
  else if (action === 'link-note') linkNoteDialog();
  else if (action === 'reference-location') {
    $('#reference-menu').hidePopover();
    await run(() => locateReference(control.dataset.source, control.dataset.target, Number(control.dataset.occurrence)));
  }
  else if (action === 'tags') await run(() => tagUsageDialog());
  else if (action === 'tag-remove') {
    const note = currentNote();
    if (!note || readonly()) return;
    let content = note.content;
    for (let { start, end } of tagOccurrences(content, control.dataset.tag).reverse()) {
      if (content[end] === ' ') end++; else if (content[start - 1] === ' ') start--; // take one neighbouring space with the tag
      content = content.slice(0, start) + content.slice(end);
    }
    void updateDraft({ content: content.trimEnd() });
    renderNote();
  }
  else if (action === 'tag-usage') await run(() => tagUsageDialog(control.dataset.tag, control.dataset.workspaceId || workspace.id));
  else if (action === 'new-folder' && !readonly()) folderDialog(null, false, creationFolder);
  else if (action === 'new-project' && !readonly()) folderDialog(null, true);
  else if (action === 'manage-folder' && !readonly()) folderDialog(control.dataset.folder);
  else if (action === 'all-notes' || action === 'all-folders') {
    folderFilter = null; creationFolder = null; query = ''; view = 'note'; $('#search').value = '';
    if (action === 'all-folders') {
      if (sidebarDesktop.matches) $('.workspace-shell').classList.remove('sidebar-closed');
      else $('.workspace-shell').classList.add('sidebar-open');
    }
    renderChrome(); syncRoute();
    if (action === 'all-folders') $('#search').focus();
  }
  else if (action === 'settings') settingsDialog(control.dataset.provider ? 'accounts' : 'overview', control.dataset.provider);
  else if (action === 'close-modal') $('#modal').close();
  else if (action === 'dismiss-error') $('#error-banner').hidden = true;
  else if (action === 'delete-note' && currentNote() && !readonly()) { const note = currentNote(); confirmAction('Let this note go?', `Delete “${note.title}”? It will also be deleted from connected vaults on your next sync. Keep a backup if you may want it later.`, 'Delete note', async () => { await workspace.deleteNote(note.id); drafts.delete(note.id); failedDrafts.delete(note.id); selected = null; renderChrome(); }); }
  else if (action === 'export-note' && currentNote()) { const note = currentNote(); download(`${filename(note.title)}.md`, note.content, 'text/markdown;charset=utf-8'); notice('Markdown note exported.'); }
  else if (action === 'import-md') $('#markdown-files').click();
  else if (action === 'import-folder') $('#markdown-folder').click();
  else if (action === 'restore') $('#backup-file').click();
  else if (action === 'backup') await run(async () => { download(`nitrobison-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(await workspace.exportSnapshot(), null, 2), 'application/json'); notice('JSON backup downloaded.'); });
  else if (action === 'export-vault') await run(exportMarkdownFolder);
  else if (action === 'install') await run(async () => { const message = await installApp(); if (message) showDialog('Keep your ideas close', nativeDesktop ? 'Desktop installation' : 'Install NitroBison', `<p class="fb-body">${html(message)}</p>${nativeDesktop ? '<p class="fb-notice">Notes stay in the NitroBison application profile, not the selected folder. Keep JSON backups before reinstalling or removing app data.</p>' : '<p class="fb-body">Chrome or Edge: open the browser menu and choose Install NitroBison or Install this page as an app. Safari on iPhone/iPad: Share → Add to Home Screen. Safari on Mac: File → Add to Dock.</p><p class="fb-notice">Offline use is available after the app has finished caching. Keep backups: uninstalling or clearing browser data can remove local notes.</p>'}`); });
}
function handleKeyboard(event) {
  const summary = event.target.closest('.tree-folder > summary');
  if (summary && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) { event.preventDefault(); showFolderMenu(summary.parentElement.dataset.folder, summary); return; }
  const menu = event.target.closest('#folder-menu, #reference-menu, #workspace-menu');
  if (menu) {
    if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
      event.preventDefault();
      const items = [...menu.querySelectorAll('button:not(:disabled)')];
      const index = items.indexOf(document.activeElement);
      items[event.key === 'Home' ? 0 : event.key === 'End' ? items.length - 1 : (index + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      menu.hidePopover();
      (popoverTrigger?.isConnected ? popoverTrigger : $('#main')).focus({ preventScroll: true });
    } else if (event.key === 'Tab') menu.hidePopover();
    return;
  }
  if (!(event.metaKey || event.ctrlKey)) {
    if (event.key === 'Escape' && !sidebarDesktop.matches && $('.workspace-shell').classList.contains('sidebar-open')) { $('.workspace-shell').classList.remove('sidebar-open'); syncSidebarToggle(); $('[data-action="sidebar"]').focus(); }
    return;
  }
  if (event.key === 'Enter' && event.target === $('#editor')) {
    const content = currentNote()?.content || '';
    const prefixLen = content.length - propertiesBody(content).length;
    if (findListCommand(propertiesBody(content), Math.max(0, $('#editor').selectionStart - prefixLen))) { event.preventDefault(); insertInlineListDatabase(); return; }
    if (findAICommand(content, $('#editor').selectionStart)) { event.preventDefault(); void run(aiDialog); return; }
  }
  if (event.key.toLowerCase() === 's') { event.preventDefault(); if (failedDrafts.size) [...failedDrafts].forEach(id => persist(drafts.get(id))); else notice(pending ? 'Your edits are saving on this device.' : workspace.status); }
  if (event.key.toLowerCase() === 'k') {
    event.preventDefault();
    if ($('#modal').open) $('#modal').close();
    if (view === 'home') { view = 'note'; renderChrome(); syncRoute(); }
    if (!(view === 'views' && isHalfWidthTaskMenu())) {
      if (sidebarDesktop.matches) $('.workspace-shell').classList.remove('sidebar-closed');
      else $('.workspace-shell').classList.add('sidebar-open');
      syncSidebarToggle();
    }
    const search = view === 'graph' ? $('#graph-navigation input[type="search"]') : view === 'views' ? $('#collection-view [data-view-search]') : $('#search');
    search?.focus();
    search?.select();
  }
  if (event.key.toLowerCase() === 'n' && !$('#modal').open) { event.preventDefault(); createNote(); }
}

async function start() {
  try {
    workspace = await openWorkspace();
    collectionPreferences = readViewPreferences();
    buildShell();
    mountTitlebar(nativeDesktop);
    try { aiSettings = await readAISettings(nativeDesktop); } catch (error) { report(error); }
    workspace.subscribe(() => { renderChrome(); void syncDeviceFolders(); });
    readRoute();
    void syncDeviceFolders();
    registerOffline(message => { if (message) notice(message); });
  } catch (error) {
    $('#app').innerHTML = `<main class="startup"><img src="/logo.png" alt="NitroBison" width="64" height="64" /><h1>Your ideas are still yours.</h1><p role="alert">We couldn’t open the local vault. ${html(error.message)}</p><p>Check that browser storage is enabled and there is free space on this device. Existing data has not been deliberately cleared.</p><button class="fb-btn fb-btn--primary" id="retry-start">Try again</button></main>`;
    $('#retry-start').addEventListener('click', () => location.reload());
  }
}
void start();
