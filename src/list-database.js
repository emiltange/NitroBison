import { NOTE_STATUSES, readProperties, withProperties } from './collections.js';
import { escapeHtml, extractTags } from './markdown-model.js';
import { validatePath } from './core.js';

const defaults = { title: 'Tasks', folder: '', tag: '', status: '', sort: 'updated' };
const statusLabels = { 'Not started': 'To-do', Doing: 'In progress', 'In review': 'In review', Done: 'Complete' };
const statusTone = status => status === 'Done' ? 'done' : status === 'In review' ? 'review' : status === 'Doing' ? 'doing' : 'todo';
const listLanguages = new Set(['nitrobison-list', 'list-database']);

export function parseListDatabaseConfig(source) {
  try {
    const supplied = String(source ?? '').trim() ? JSON.parse(source) : {};
    if (!supplied || typeof supplied !== 'object' || Array.isArray(supplied)) throw new Error('List settings must be a JSON object.');
    for (const key of Object.keys(supplied)) if (!Object.hasOwn(defaults, key)) throw new Error(`Unsupported list setting: ${key}.`);
    const config = { ...defaults, ...supplied };
    if (typeof config.title !== 'string' || !config.title.trim() || config.title.length > 120 || /[\x00-\x1f\x7f]/.test(config.title)) throw new Error('List title must be 1–120 characters without control characters.');
    config.title = config.title.trim();
    if (config.folder !== '*' && config.folder !== '/') validatePath(config.folder);
    if (typeof config.tag !== 'string' || (config.tag && (!/^[\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*$/u.test(config.tag) || /^\d+$/.test(config.tag)))) throw new Error('List tag must be a tag name without #.');
    config.tag = config.tag.toLocaleLowerCase();
    if (typeof config.status !== 'string' || config.status.length > 80 || (config.status && !config.status.trim()) || /[\x00-\x1f\x7f]/.test(config.status)) throw new Error('List status must be empty or 1–80 characters without control characters.');
    if (!['updated', 'title', 'status', 'start'].includes(config.sort)) throw new Error('List sort must be updated, title, status, or start.');
    return { config, error: null };
  } catch (failure) {
    return { config: { ...defaults }, error: failure instanceof SyntaxError ? 'Invalid JSON in list settings. Repair the fenced block in Write (Markdown) mode; your source is unchanged.' : failure.message };
  }
}

export function serializeListDatabaseBlock(config = {}) {
  const parsed = parseListDatabaseConfig(JSON.stringify(config));
  if (parsed.error) throw new Error(parsed.error);
  return `\`\`\`nitrobison-list\n${JSON.stringify(parsed.config)}\n\`\`\``;
}

function* markdownLines(content) {
  let offset = 0;
  let fence = null;
  for (const text of content.split('\n')) {
    const line = text.replace(/\r$/, '');
    const marker = /^ {0,3}(`{3,}|~{3,})(.*)$/.exec(line);
    const inside = !!fence;
    let opening = null;
    let closing = false;
    if (fence) {
      if (marker && marker[1][0] === fence.character && marker[1].length >= fence.length && !marker[2].trim()) {
        fence = null;
        closing = true;
      }
    } else if (marker && (marker[1][0] !== '`' || !marker[2].includes('`'))) {
      opening = marker[2].trim().toLowerCase();
      fence = { character: marker[1][0], length: marker[1].length };
    }
    yield { line, start: offset, end: offset + line.length, inside, opening, closing };
    offset += text.length + 1;
  }
}

export function findListCommand(content, cursorOffset = content.length) {
  for (const record of markdownLines(content)) {
    if (cursorOffset < record.start || cursorOffset > record.end || record.inside || record.opening !== null) continue;
    const match = /^ {0,3}\/list(?:\s+view)?(?:[ \t]+(.*?))?[ \t]*$/i.exec(record.line);
    if (match) return { start: record.start, end: record.end, title: (match[1] || '').trim() };
  }
  return null;
}

export function insertListDatabaseMarkdown(content, cursorOffset = content.length, config = {}) {
  const offset = Math.max(0, Math.min(content.length, cursorOffset));
  const command = findListCommand(content, offset);
  const block = serializeListDatabaseBlock({ ...config, title: command?.title || config.title || 'Tasks' });
  if (command) return { content: content.slice(0, command.start) + block + content.slice(command.end) };
  const before = content.slice(0, offset);
  const after = content.slice(offset);
  const separation = text => !text || /\r?\n\r?\n$/.test(text) ? '' : /\r?\n$/.test(text) ? '\n' : '\n\n';
  const trailing = !after || /^(?:\r?\n){2}/.test(after) ? '' : /^\r?\n/.test(after) ? '\n' : '\n\n';
  return { content: before + separation(before) + block + trailing + after };
}

export function updateListDatabaseBlock(content, blockIndex, nextConfig) {
  let index = 0;
  let start = null;
  for (const record of markdownLines(content)) {
    if (record.opening !== null && listLanguages.has(record.opening)) {
      if (index++ === blockIndex) start = record.start;
    }
    if (start !== null && record.closing) return { content: content.slice(0, start) + serializeListDatabaseBlock(nextConfig) + content.slice(record.end) };
  }
  return { content: start === null ? content : content.slice(0, start) + serializeListDatabaseBlock(nextConfig) };
}

function resolvedFolder(config, fromNote) {
  return config.folder === '*' ? null : config.folder === '/' ? '' : config.folder || fromNote?.folder || '';
}

export function queryListDatabase(notes, config = {}, fromNote = {}, searchQuery = '') {
  const settings = { ...defaults, ...config };
  const folder = resolvedFolder(settings, fromNote);
  const tag = settings.tag.toLocaleLowerCase();
  const search = String(searchQuery).trim().toLocaleLowerCase();
  const records = notes.filter(note => !note.deleted && (!fromNote?.id || note.id !== fromNote.id) && (folder === null || (note.folder || '') === folder || (folder && (note.folder || '').startsWith(`${folder}/`))))
    .map(note => {
      const tags = extractTags(note.content);
      let properties;
      let error = null;
      try { properties = readProperties(note.content); }
      catch (failure) { error = failure.message; properties = { status: 'Not started', start: '', end: '' }; }
      return { note, properties, tags, error };
    }).filter(({ note, properties, tags }) => (!tag || tags.includes(tag)) && (!settings.status || properties.status === settings.status) && (!search || [note.title, note.folder, properties.status, statusLabels[properties.status] || properties.status, ...tags.map(value => `#${value}`)].join(' ').toLocaleLowerCase().includes(search)));
  const titleOrder = (a, b) => a.note.title.localeCompare(b.note.title);
  const workflow = status => { const index = NOTE_STATUSES.indexOf(status); return index < 0 ? NOTE_STATUSES.length : index; };
  return records.sort((a, b) => {
    if (settings.sort === 'title') return titleOrder(a, b);
    if (settings.sort === 'status') return workflow(a.properties.status) - workflow(b.properties.status) || titleOrder(a, b);
    if (settings.sort === 'start') return (a.properties.start || '9999-99-99').localeCompare(b.properties.start || '9999-99-99') || titleOrder(a, b);
    return b.note.updatedAt - a.note.updatedAt || titleOrder(a, b);
  });
}

const icons = {
  list: '<path d="M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01"/>',
  page: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>',
  settings: '<path d="M4 7h16M4 17h16M8 4v6M16 14v6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
};
const icon = name => `<svg class="list-db-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${icons[name]}</svg>`;
const option = (value, label, current) => `<option value="${escapeHtml(value)}"${value === current ? ' selected' : ''}>${escapeHtml(label)}</option>`;
const dateFormatter = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' });
const formattedDate = value => dateFormatter.format(new Date(`${value}T00:00:00Z`));

export function hydrateListDatabases(container, { notes = [], fromNote = {}, readOnly = false, customStatuses = [], onOpenNote, onPatchProperties, onCreateNote, onOpenProperties, onUpdateBlock } = {}) {
  for (const block of container.querySelectorAll('.list-db-block')) {
    const source = block.querySelector('.list-db-source');
    if (!source) continue;
    const parsed = parseListDatabaseConfig(source.textContent);
    if (parsed.error) {
      const notice = block.ownerDocument.createElement('p');
      notice.className = 'fb-error';
      notice.textContent = parsed.error;
      block.prepend(notice);
      continue;
    }
    let config = parsed.config;
    let localNotes = notes;
    let keyboardStatusChange = false;
    let creating = false;
    const pendingStatuses = new Set();
    const blockIndex = Number(block.dataset.listDbIndex);
    const canCreate = !readOnly && !!onCreateNote;
    const allStatuses = [...new Set([...NOTE_STATUSES, ...customStatuses, ...notes.filter(note => !note.deleted).map(note => {
      try { return readProperties(note.content).status; } catch { return 'Not started'; }
    }), ...(config.status ? [config.status] : [])])];
    const folders = new Set();
    for (const note of notes.filter(note => !note.deleted)) {
      const parts = (note.folder || '').split('/').filter(Boolean);
      for (let i = 1; i <= parts.length; i++) folders.add(parts.slice(0, i).join('/'));
    }
    if (config.folder && !['*', '/'].includes(config.folder)) folders.add(config.folder);
    if (fromNote?.folder) folders.add(fromNote.folder);
    block.innerHTML = `<section class="list-db" aria-label="${escapeHtml(config.title)}">
      <div class="list-db-header">
        <div class="list-db-heading">${icon('list')}<strong data-list-heading>${escapeHtml(config.title)}</strong><span class="list-db-count" data-list-count></span><span class="list-db-scopes" data-list-scopes></span></div>
        <div class="list-db-controls">
          <label class="list-db-search" hidden>${icon('search')}<input type="search" placeholder="Search pages…" aria-label="Search this list" data-list-search></label>
          <button type="button" class="list-db-icon-button" data-list-search-toggle title="Search pages" aria-label="Search pages" aria-expanded="false">${icon('search')}</button>
          <button type="button" class="list-db-settings-toggle" data-list-settings-toggle title="View settings" aria-label="View settings: filter and sort" aria-expanded="false">${icon('settings')}<span>Filter &amp; sort</span></button>
          <button type="button" class="list-db-new" data-list-new-toggle${canCreate ? '' : ' disabled'}>${icon('plus')}New</button>
        </div>
      </div>
      <div class="list-db-settings" hidden>
        <label>Title<input data-list-setting="title" value="${escapeHtml(config.title)}" maxlength="120" required></label>
        <label>Folder<select data-list-setting="folder">${option('', 'Current folder', config.folder)}${option('*', 'All folders', config.folder)}${option('/', 'Vault root', config.folder)}${[...folders].sort().map(folder => option(folder, folder, config.folder)).join('')}</select></label>
        <label>Status<select data-list-setting="status">${option('', 'All statuses', config.status)}${allStatuses.map(status => option(status, statusLabels[status] || status, config.status)).join('')}</select></label>
        <label>#Tag<input data-list-setting="tag" value="${escapeHtml(config.tag)}" placeholder="Any tag"></label>
        <label>Sort<select data-list-setting="sort">${[['updated', 'Newest first'], ['title', 'Title A–Z'], ['status', 'Status'], ['start', 'Start date']].map(([value, label]) => option(value, label, config.sort)).join('')}</select></label>
      </div>
      <p class="fb-error list-db-error" data-list-error role="alert" hidden></p>
      <div class="list-db-rows" role="list"></div>
      <form class="list-db-create" hidden><input name="title" placeholder="New page title…" aria-label="New page title" maxlength="200" required><button type="submit" class="list-db-new">Add</button><button type="button" data-list-create-cancel>Cancel</button></form>
      <button type="button" class="list-db-add-page" data-list-new-toggle${canCreate ? '' : ' disabled'}>${icon('plus')}New page</button>
    </section>`;
    const list = block.querySelector('.list-db');
    const rows = block.querySelector('.list-db-rows');
    const search = block.querySelector('[data-list-search]');
    const searchLabel = block.querySelector('.list-db-search');
    const searchToggle = block.querySelector('[data-list-search-toggle]');
    const settings = block.querySelector('.list-db-settings');
    const form = block.querySelector('.list-db-create');
    const titleInput = form.elements.title;
    const errorNotice = block.querySelector('[data-list-error]');
    const rowNodes = new Map();
    const reportError = failure => { errorNotice.textContent = failure?.message || String(failure); errorNotice.hidden = false; };
    let currentRecords = [];
    let searchManuallyToggled = false;

    function renderRows(animate = false) {
      const previous = animate ? new Map([...rowNodes].map(([id, node]) => [id, node.getBoundingClientRect()])) : null;
      currentRecords = queryListDatabase(localNotes, config, fromNote, search.value);
      const activeIds = new Set(currentRecords.map(record => record.note.id));
      for (const [id, row] of rowNodes) if (!activeIds.has(id)) { row.remove(); rowNodes.delete(id); }
      rows.querySelector('.list-db-empty')?.remove();
      for (const record of currentRecords) {
        const { note, properties, tags, error } = record;
        let row = rowNodes.get(note.id);
        if (!row) {
          row = block.ownerDocument.createElement('div');
          row.className = 'list-db-row';
          row.setAttribute('role', 'listitem');
          row.innerHTML = `<span class="list-db-page-icon">${icon('page')}</span><a href="#note=${encodeURIComponent(note.id)}" data-note="${escapeHtml(note.id)}" class="list-db-title">${escapeHtml(note.title)}</a><div class="list-db-properties"><span class="list-db-tags"></span><span class="list-db-date"></span><select class="list-db-status" data-list-status="${escapeHtml(note.id)}" aria-label="Status for ${escapeHtml(note.title)}"></select><button type="button" class="list-db-icon-button" data-action="properties" data-id="${escapeHtml(note.id)}" title="Properties" aria-label="Properties for ${escapeHtml(note.title)}"${onOpenProperties ? '' : ' disabled'}>${icon('more')}</button></div>`;
          rowNodes.set(note.id, row);
        }
        row.querySelector('.list-db-title').textContent = note.title;
        row.querySelector('.list-db-tags').innerHTML = tags.slice(0, 2).map(tag => `<span class="list-db-tag">#${escapeHtml(tag)}</span>`).join('');
        const date = row.querySelector('.list-db-date');
        date.hidden = !properties.start;
        date.textContent = properties.start ? formattedDate(properties.start) : '';
        date.title = properties.start ? `${properties.start}${properties.end ? ` – ${properties.end}` : ''}` : '';
        const status = row.querySelector('[data-list-status]');
        status.innerHTML = [...new Set([...allStatuses, properties.status])].map(value => option(value, statusLabels[value] || value, properties.status)).join('');
        status.dataset.tone = statusTone(properties.status);
        status.disabled = readOnly || !!error || pendingStatuses.has(note.id);
        row.title = error || '';
        rows.append(row);
      }
      if (!currentRecords.length) {
        const empty = block.ownerDocument.createElement('div');
        empty.className = 'list-db-empty';
        empty.textContent = search.value || config.tag || config.status ? 'No pages match these filters.' : 'No pages yet. Add your first page below.';
        rows.append(empty);
      }
      block.querySelector('[data-list-count]').textContent = String(currentRecords.length);
      block.querySelector('[data-list-heading]').textContent = config.title;
      list.setAttribute('aria-label', config.title);
      const folder = resolvedFolder(config, fromNote);
      block.querySelector('[data-list-scopes]').innerHTML = `<span class="list-db-scope">${escapeHtml(folder === null ? 'All folders' : folder || 'Vault root')}</span>${config.tag ? `<span class="list-db-scope">#${escapeHtml(config.tag)}</span>` : ''}`;
      if (currentRecords.length >= 3 && !searchManuallyToggled) {
        searchLabel.hidden = false;
        searchToggle.setAttribute('aria-expanded', 'true');
      }
      if (previous && !block.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
        const easing = block.ownerDocument.defaultView?.getComputedStyle(list).getPropertyValue('--ease-out').trim() || 'cubic-bezier(0.23, 1, 0.32, 1)';
        for (const [id, row] of rowNodes) {
          const before = previous.get(id);
          const after = row.getBoundingClientRect();
          if (before && (before.top !== after.top || before.left !== after.left)) row.animate?.([{ transform: `translate(${before.left - after.left}px, ${before.top - after.top}px)` }, { transform: 'translate(0, 0)' }], { duration: 200, easing });
        }
      }
    }

    searchLabel.hidden = queryListDatabase(localNotes, config, fromNote).length < 3;
    searchToggle.setAttribute('aria-expanded', String(!searchLabel.hidden));
    search.addEventListener('input', () => renderRows());
    searchToggle.addEventListener('click', () => {
      searchManuallyToggled = true;
      searchLabel.hidden = !searchLabel.hidden;
      searchToggle.setAttribute('aria-expanded', String(!searchLabel.hidden));
      if (!searchLabel.hidden) search.focus();
      else { search.value = ''; renderRows(); }
    });
    block.querySelector('[data-list-settings-toggle]').addEventListener('click', event => {
      settings.hidden = !settings.hidden;
      event.currentTarget.setAttribute('aria-expanded', String(!settings.hidden));
    });
    settings.addEventListener('change', async event => {
      const key = event.target.dataset.listSetting;
      if (!key) return;
      const value = key === 'tag' ? event.target.value.replace(/^#/, '').trim() : event.target.value;
      const updated = parseListDatabaseConfig(JSON.stringify({ ...config, [key]: value }));
      if (updated.error) { reportError(new Error(updated.error)); return; }
      config = updated.config;
      event.target.value = config[key];
      errorNotice.hidden = true;
      renderRows();
      if (onUpdateBlock && !readOnly) {
        try { await onUpdateBlock(blockIndex, { ...config }); }
        catch (failure) { reportError(failure); }
      }
    });
    rows.addEventListener('keydown', event => { if (event.target.matches('[data-list-status]')) keyboardStatusChange = true; });
    rows.addEventListener('pointerdown', () => { keyboardStatusChange = false; });
    rows.addEventListener('change', async event => {
      const select = event.target.closest('[data-list-status]');
      if (!select || readOnly) return;
      const record = currentRecords.find(record => record.note.id === select.dataset.listStatus);
      if (!record || record.error) return;
      const status = select.value;
      const previousNote = record.note;
      const animate = !keyboardStatusChange;
      pendingStatuses.add(previousNote.id);
      localNotes = localNotes.map(note => note.id === previousNote.id ? { ...note, content: withProperties(note.content, { status }) } : note);
      errorNotice.hidden = true;
      renderRows(animate);
      try {
        const updated = await onPatchProperties?.(previousNote, { status });
        if (updated?.id === previousNote.id) localNotes = localNotes.map(note => note.id === updated.id ? updated : note);
      } catch (failure) {
        localNotes = localNotes.map(note => note.id === previousNote.id ? previousNote : note);
        reportError(failure);
      } finally { pendingStatuses.delete(previousNote.id); renderRows(); }
    });
    rows.addEventListener('click', event => {
      const propertiesButton = event.target.closest('[data-action="properties"]');
      if (propertiesButton) {
        event.preventDefault();
        event.stopPropagation();
        const record = currentRecords.find(record => record.note.id === propertiesButton.dataset.id);
        if (record) onOpenProperties?.(record.note);
        return;
      }
      const link = event.target.closest('[data-note]');
      if (link && onOpenNote && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault();
        event.stopPropagation();
        const record = currentRecords.find(record => record.note.id === link.dataset.note);
        if (record) onOpenNote(record.note);
      }
    });
    function closeCreation() {
      if (creating) return;
      form.hidden = true;
      form.reset();
      block.querySelector('.list-db-add-page').hidden = false;
    }
    for (const button of block.querySelectorAll('[data-list-new-toggle]')) button.addEventListener('click', () => {
      if (!canCreate) return;
      form.hidden = false;
      block.querySelector('.list-db-add-page').hidden = true;
      titleInput.focus();
    });
    block.querySelector('[data-list-create-cancel]').addEventListener('click', closeCreation);
    form.addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); closeCreation(); } });
    form.addEventListener('submit', async event => {
      event.preventDefault();
      const title = titleInput.value.trim();
      if (!title || !canCreate || creating) return;
      creating = true;
      for (const control of form.elements) control.disabled = true;
      errorNotice.hidden = true;
      try {
        const note = await onCreateNote({ title, folder: resolvedFolder(config, fromNote) ?? fromNote?.folder ?? '', tag: config.tag, status: config.status || 'Not started' });
        if (note?.id) localNotes = [...localNotes.filter(existing => existing.id !== note.id), note];
        creating = false;
        closeCreation();
        renderRows();
      } catch (failure) { reportError(failure); }
      finally { creating = false; for (const control of form.elements) control.disabled = false; }
    });
    renderRows();
  }
}
