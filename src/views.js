import { escapeHtml as html } from './markdown-model.js';
import { collectionRecords, NOTE_STATUSES, statusLabel, statusTone, addDays } from './collections.js';
import { folderOverview, safeBanner } from './folders.js';

export const NOTE_LAYOUTS = ['Table', 'Board', 'Timeline', 'Gallery'];
export const todayDate = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
};
const viewLabels = { Table: 'Task table', Board: 'Kanban board', Timeline: 'Timeline', Gallery: 'Gallery' };
const viewIcons = {
  Table: '<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18M3 14h18M9 4v16"/>',
  Board: '<rect x="3" y="4" width="5" height="16" rx="1.5"/><rect x="10" y="4" width="5" height="11" rx="1.5"/><rect x="17" y="4" width="4" height="14" rx="1.5"/>',
  Timeline: '<path d="M5 3v18M3 6h9M3 12h15M3 18h18"/><path d="M9 4v4M15 10v4M19 16v4"/>',
  Gallery: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
};
const icon = paths => `<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
const title = record => `<button type="button" class="collection-note-title" data-note="${html(record.note.id)}">${html(record.note.title)}</button>`;
const tags = record => record.tags.map(tag => `<button type="button" class="collection-tag" data-action="tag-view" data-tag="${html(tag)}">#${html(tag)}</button>`).join('');
const dates = record => record.properties.start ? `${html(record.properties.start)}${record.properties.end && record.properties.end !== record.properties.start ? ` → ${html(record.properties.end)}` : ''}` : '';
const actions = record => `<button type="button" class="collection-properties" data-action="properties" data-id="${html(record.note.id)}" aria-label="${record.error ? 'Repair properties' : 'Properties'} for ${html(record.note.title)}" title="${record.error ? 'Repair properties' : 'Properties'}">···</button>`;
const statusControl = (record, statuses, readOnly) => `<label class="collection-status-field"><span class="sr-only">Status for ${html(record.note.title)}</span><select data-property="status" data-id="${html(record.note.id)}" data-tone="${statusTone(record.properties.status)}" ${readOnly || record.error ? 'disabled' : ''}>${statuses.map(status => `<option value="${html(status)}" ${status === record.properties.status ? 'selected' : ''}>${html(statusLabel(status))}</option>`).join('')}</select></label>`;
const error = record => record.error ? `<p class="fb-error collection-error" role="status">${html(record.error)}</p>` : '';
const metadata = record => {
  const items = [record.tags.length ? `<span class="collection-tags">${tags(record)}</span>` : '', record.properties.start ? `<span class="collection-schedule">${dates(record)}</span>` : '', record.note.folder ? `<span class="collection-folder">${html(record.note.folder)}</span>` : ''].filter(Boolean);
  return items.length ? `<div class="collection-metadata">${items.join('')}</div>` : '';
};
const newPage = (status, readOnly) => `<button type="button" class="collection-column-new" data-new-status="${html(status)}" ${readOnly ? 'disabled' : ''}><span aria-hidden="true">+</span> New page</button>`;
const card = (record, statuses, readOnly, drag = false, compact = false) => `<article class="collection-card${compact ? ' collection-compact-record' : ''}" data-record-id="${html(record.note.id)}" data-tone="${statusTone(record.properties.status)}" ${drag && !readOnly && !record.error ? `draggable="true" data-board-note="${html(record.note.id)}"` : ''}>${title(record)}${metadata(record)}<div class="collection-card-controls">${statusControl(record, statuses, readOnly)}${actions(record)}</div>${error(record)}</article>`;

function table(records, statuses, readOnly) {
  return `<div class="collection-scroll" tabindex="0" role="region" aria-label="Task table"><table class="collection-table"><thead><tr><th scope="col">Task</th><th scope="col">Status</th><th scope="col">Folder</th><th scope="col">Schedule</th><th scope="col"><span class="sr-only">Properties</span></th></tr></thead><tbody>${records.map(record => `<tr data-record-id="${html(record.note.id)}" data-tone="${statusTone(record.properties.status)}"><td>${title(record)}${record.tags.length ? `<div class="collection-tags">${tags(record)}</div>` : ''}${error(record)}</td><td>${statusControl(record, statuses, readOnly)}</td><td class="collection-table-folder">${html(record.note.folder || 'Vault root')}</td><td><div class="collection-table-dates">${['start', 'end'].map(key => `<label><span class="sr-only">${key === 'start' ? 'Start' : 'Inclusive end'} date for ${html(record.note.title)}</span><input type="date" min="0001-01-01" max="9999-12-31" data-property="${key}" data-id="${html(record.note.id)}" value="${html(record.properties[key])}" ${readOnly || record.error ? 'disabled' : ''}/></label>`).join('<span aria-hidden="true">→</span>')}</div></td><td>${actions(record)}</td></tr>`).join('') || '<tr><td colspan="5" class="collection-empty">No matching tasks.</td></tr>'}</tbody><tfoot><tr><td colspan="5">${newPage('Not started', readOnly)}</td></tr></tfoot></table></div>`;
}

function board(records, statuses, customStatuses, readOnly, addingSwimlane) {
  const customSet = new Set(customStatuses);
  return `<div class="collection-board">${statuses.map(status => {
    const matches = records.filter(record => record.properties.status === status);
    const removable = !readOnly && customSet.has(status) && matches.length === 0;
    return `<section class="collection-column" data-board-status="${html(status)}" data-tone="${statusTone(status)}" aria-label="${html(statusLabel(status))}"><header class="collection-column-heading"><h2 class="collection-status-pill"><span class="collection-status-dot" aria-hidden="true"></span>${html(statusLabel(status))}</h2><span class="collection-column-count" aria-label="${matches.length} tasks">${matches.length}</span>${removable ? `<button type="button" class="collection-swimlane-remove" data-remove-swimlane="${html(status)}" aria-label="Remove ${html(status)} swimlane" title="Remove empty swimlane">×</button>` : ''}</header>${matches.length ? `<div class="collection-column-cards">${matches.map(record => card(record, statuses, readOnly, true)).join('')}</div>` : ''}${newPage(status, readOnly)}</section>`;
  }).join('')}${readOnly ? '' : `<section class="collection-column collection-column--add" aria-label="Add swimlane">${addingSwimlane ? `<form class="collection-swimlane-form"><label class="sr-only" for="new-swimlane-input">Swimlane name</label><input id="new-swimlane-input" name="swimlane" placeholder="Swimlane name (e.g. Blocked)…" maxlength="80" required autocomplete="off"/><div class="collection-swimlane-actions"><button type="submit" class="collection-new">Add</button><button type="button" class="collection-export" data-cancel-swimlane>Cancel</button></div></form>` : `<button type="button" class="collection-add-swimlane" data-add-swimlane><span aria-hidden="true">+</span> Add swimlane</button>`}</section>`}</div>`;
}

function dateNavigation(start, end) {
  return `<div class="collection-date-nav" role="group" aria-label="Visible date range"><button type="button" class="collection-date-step" data-date-step="-1" ${start >= '0001-01-29' ? '' : 'disabled'} aria-label="Previous 28 days">←</button><h2><time datetime="${start}">${html(start)}</time> – <time datetime="${end}">${html(end)}</time></h2><button type="button" class="collection-date-step" data-date-step="1" ${start <= '9999-11-06' ? '' : 'disabled'} aria-label="Next 28 days">→</button><button type="button" class="collection-date-today" data-date-today>Today</button><label class="collection-date-jump"><span class="sr-only">Jump to date</span><input type="date" min="0001-01-01" max="9999-12-31" value="${start}" data-date-jump/></label></div>`;
}

function scheduledExtras(records, start, end, statuses, readOnly) {
  const unscheduled = records.filter(record => !record.properties.start || record.error);
  const outside = records.filter(record => record.properties.start && !record.error && (record.properties.start > end || (record.properties.end || record.properties.start) < start));
  return [[unscheduled, 'Unscheduled / needs repair'], [outside, 'Outside this range']].map(([matches, label]) => matches.length ? `<section class="collection-date-extra"><h2>${label}<span class="collection-count">${matches.length}</span></h2><div class="collection-date-records">${matches.map(record => card(record, statuses, readOnly, false, true)).join('')}</div></section>` : '').join('');
}

function timeline(records, date, statuses, readOnly) {
  const start = date > '9999-12-04' ? '9999-12-04' : date;
  const end = addDays(start, 27);
  const scheduled = records.filter(record => record.properties.start && !record.error && record.properties.start <= end && (record.properties.end || record.properties.start) >= start);
  const days = Array.from({ length: 28 }, (_, index) => addDays(start, index));
  const rows = scheduled.map(record => {
    const first = days.findIndex(day => day >= record.properties.start);
    const last = days.findLastIndex(day => day <= (record.properties.end || record.properties.start));
    return `<div class="collection-timeline-row" data-record-id="${html(record.note.id)}" data-tone="${statusTone(record.properties.status)}"><div class="collection-timeline-label">${title(record)}<span class="fb-meta">${dates(record)} · ${html(statusLabel(record.properties.status))}</span>${actions(record)}</div><div class="collection-timeline-track"><button type="button" class="collection-gantt-bar" style="grid-column:${first + 1} / ${last + 2}" data-action="properties" data-id="${html(record.note.id)}" aria-label="${html(record.note.title)}: ${dates(record)}, ${html(statusLabel(record.properties.status))}. Open properties">${html(record.note.title)}</button></div></div>`;
  }).join('');
  return dateNavigation(start, end) + `<div class="collection-scroll" tabindex="0" role="region" aria-label="Timeline and Gantt chart"><div class="collection-timeline"><div class="collection-timeline-row"><div class="fb-meta">Task / inclusive dates</div><div class="collection-timeline-days">${days.map(day => `<time datetime="${day}" title="${day}">${day.slice(-2)}</time>`).join('')}</div></div>${rows || '<p class="collection-empty">No tasks scheduled in these 28 days.</p>'}</div></div>` + scheduledExtras(records, start, end, statuses, readOnly);
}

function gallery(records, notes, statuses, readOnly, preferences) {
  return `<div class="collection-gallery">${records.map(record => {
    const overview = folderOverview(notes, record.note.folder);
    const preference = preferences[record.note.folder] || {};
    const folderBanner = Object.hasOwn(preference, 'banner') ? preference.banner : overview.banner;
    const artwork = [...record.properties.body.matchAll(/!\[[^\]\n]*\]\((data:image\/(?:png|jpeg|webp);base64,[A-Za-z0-9+/]+={0,2})\)/g)].map(match => match[1]).find(safeBanner);
    const banner = safeBanner(folderBanner) ? folderBanner : artwork;
    const text = record.properties.body.replace(/```[\s\S]*?```/g, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/[#*_>`]/g, '').trim().slice(0, 240);
    return `<article class="collection-gallery-card" data-record-id="${html(record.note.id)}" data-tone="${statusTone(record.properties.status)}"><button type="button" class="collection-gallery-cover" data-note="${html(record.note.id)}" aria-label="Open ${html(record.note.title)}">${banner ? `<img src="${html(banner)}" alt="" loading="lazy"/>` : `<span>${html(text || 'No preview text yet.')}</span>`}</button><div class="collection-gallery-content">${title(record)}${metadata(record)}<div class="collection-card-controls">${statusControl(record, statuses, readOnly)}${actions(record)}</div>${error(record)}</div></article>`;
  }).join('') || '<p class="collection-empty">No matching tasks.</p>'}</div>`;
}

export function renderCollections(container, { notes, tag, folder, layout, date, customStatuses = [], readOnly, folderPreferences = {}, navigation = null, isCompactNav = false, onPatch, onPreference, onFolder, onCreateNote, onAddSwimlane, onRemoveSwimlane, onError }) {
  folder ??= null;
  tag ||= '';
  date ||= todayDate();
  if (!NOTE_LAYOUTS.includes(layout)) layout = 'Table';
  const cleanCustom = customStatuses.filter(s => typeof s === 'string' && s.trim() && !NOTE_STATUSES.includes(s));
  const options = { notes, tag, folder, layout, date, customStatuses: cleanCustom, readOnly, folderPreferences, navigation, isCompactNav, onPatch, onPreference, onFolder, onCreateNote, onAddSwimlane, onRemoveSwimlane, onError };
  const allRecords = collectionRecords(notes, { tag, folder });
  const statuses = [...new Set([...NOTE_STATUSES, ...cleanCustom, ...allRecords.map(record => record.properties.status)])];
  const query = String(container._searchQuery || '').trim().toLowerCase();
  const sortBy = ['updated', 'title', 'status', 'start'].includes(container._sortBy) ? container._sortBy : 'updated';
  container._searchQuery ||= '';
  container._sortBy = sortBy;
  const records = allRecords.filter(record => !query || [record.note.title, record.note.folder, record.properties.status, statusLabel(record.properties.status), ...record.tags, record.properties.body].join(' ').toLowerCase().includes(query));
  records.sort((a, b) => {
    const byTitle = () => a.note.title.localeCompare(b.note.title);
    if (sortBy === 'title') return byTitle();
    if (sortBy === 'status') return statuses.indexOf(a.properties.status) - statuses.indexOf(b.properties.status) || byTitle();
    if (sortBy === 'start') return (a.properties.start || '9999-99-99').localeCompare(b.properties.start || '9999-99-99') || byTitle();
    return (b.note.updatedAt || 0) - (a.note.updatedAt || 0) || byTitle();
  });
  const focused = container.ownerDocument.activeElement;
  const searchFocus = focused?.matches('[data-view-search]') && container.contains(focused) ? { start: focused.selectionStart, end: focused.selectionEnd, direction: focused.selectionDirection } : null;
  const sameLayout = container._prevLayout === layout;
  container._prevRects = sameLayout ? new Map([...container.querySelectorAll('[data-record-id]')].map(element => [element.dataset.recordId, element.getBoundingClientRect()])) : new Map();
  container._prevLayout = layout;
  const layouts = { Table: () => table(records, statuses, readOnly), Board: () => board(records, statuses, cleanCustom, readOnly, Boolean(container._addingSwimlane)), Timeline: () => timeline(records, date, statuses, readOnly), Gallery: () => gallery(records, notes, statuses, readOnly, folderPreferences) };
  container.innerHTML = `<header class="collection-heading"><div class="collection-heading-title"><h1>${html(folder === null ? 'Workspace tasks' : folder || 'Vault root')}</h1><span class="collection-filter-pill">${html(viewLabels[layout])}</span>${tag ? `<span class="collection-filter-pill">#${html(tag)}</span>` : ''}<span class="collection-count">${records.length} ${records.length === 1 ? 'task' : 'tasks'}</span></div><div class="collection-toolbar-controls"><label class="collection-search">${icon('<circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/>')}<input type="search" data-view-search value="${html(container._searchQuery || '')}" placeholder="Search tasks" aria-label="Search tasks" autocomplete="off"/></label><label class="collection-sort"><span class="sr-only">Sort tasks</span><select data-view-sort>${[['updated', 'Last edited'], ['title', 'Title'], ['status', 'Status'], ['start', 'Schedule']].map(([value, label]) => `<option value="${value}" ${sortBy === value ? 'selected' : ''}>${label}</option>`).join('')}</select></label><button type="button" class="collection-export" data-action="backup">Export JSON</button><button type="button" class="collection-new" data-new-status="Not started" ${readOnly ? 'disabled' : ''}>${icon('<path d="M12 5v14M5 12h14"/>')}New</button></div></header>${readOnly ? '<p class="permission-notice" role="status">Read-only workspace</p>' : ''}${layouts[layout]()}`;
  if (navigation) {
    const folders = new Set(['']);
    for (const note of notes.filter(note => !note.deleted)) {
      const parts = note.folder.split('/');
      for (let depth = 1; depth <= parts.length; depth++) folders.add(parts.slice(0, depth).join('/'));
    }
    if (folder !== null) folders.add(folder);
    const topics = [...new Set([...collectionRecords(notes, { folder }).flatMap(record => record.tags), ...(tag ? [tag] : [])])].sort();
    const counts = { Table: allRecords.length, Board: allRecords.filter(record => record.properties.status !== 'Done').length, Timeline: allRecords.filter(record => record.properties.start && !record.error).length };
    navigation.innerHTML = isCompactNav
      ? `<div class="topbar-views-tabs" role="group" aria-label="Task layouts">${NOTE_LAYOUTS.map(name => `<button type="button" class="collection-nav-item" data-layout="${name}" ${name === layout ? 'aria-current="page"' : ''}>${icon(viewIcons[name])}<span>${viewLabels[name]}</span>${Object.hasOwn(counts, name) ? `<span class="collection-nav-count">${counts[name]}</span>` : ''}</button>`).join('')}</div><div class="topbar-views-filters"><label class="collection-nav-filter"><span class="sr-only">Folder filter</span><select data-view-folder aria-label="Folder filter"><option value="*" ${folder === null ? 'selected' : ''}>All folders</option>${[...folders].sort().map(path => `<option value="${html(path)}" ${path === folder ? 'selected' : ''}>${html(path || 'Vault root')}</option>`).join('')}</select></label><label class="collection-nav-filter"><span class="sr-only">Tag filter</span><select data-view-tag aria-label="Tag filter"><option value="">All tags</option>${topics.map(topic => `<option value="${html(topic)}" ${topic === tag ? 'selected' : ''}>#${html(topic)}</option>`).join('')}</select></label>${folder !== null || tag ? '<button type="button" class="collection-nav-reset" data-action="views-all-folders" title="Reset filters">Reset</button>' : ''}</div>`
      : `<section class="collection-side-section"><h2>Task views</h2><div class="collection-side-items">${NOTE_LAYOUTS.map(name => `<button type="button" class="collection-side-item" data-layout="${name}" ${name === layout ? 'aria-current="page"' : ''}>${icon(viewIcons[name])}<span>${viewLabels[name]}</span>${Object.hasOwn(counts, name) ? `<span class="collection-nav-count">${counts[name]}</span>` : ''}</button>`).join('')}</div></section><section class="collection-side-section"><h2>Filters</h2><label class="collection-side-filter">Folder<select data-view-folder><option value="*" ${folder === null ? 'selected' : ''}>All folders</option>${[...folders].sort().map(path => `<option value="${html(path)}" ${path === folder ? 'selected' : ''}>${html(path || 'Vault root')}</option>`).join('')}</select></label><label class="collection-side-filter">Tag<select data-view-tag><option value="">All tags</option>${topics.map(topic => `<option value="${html(topic)}" ${topic === tag ? 'selected' : ''}>#${html(topic)}</option>`).join('')}</select></label>${folder !== null || tag ? '<button type="button" class="collection-nav-reset" data-action="views-all-folders">Reset filters</button>' : ''}</section>`;
    navigation.onclick = event => {
      const control = event.target.closest('[data-layout], [data-action="views-all-folders"]');
      if (!control || control.disabled) return;
      if (control.dataset.layout) onPreference?.({ layout: control.dataset.layout });
      else { event.stopPropagation(); onPreference?.({ tag: '' }); onFolder?.(null); }
    };
    navigation.onchange = event => {
      const control = event.target;
      if (control.matches('[data-view-folder]')) onFolder?.(control.value === '*' ? null : control.value);
      else if (control.matches('[data-view-tag]')) onPreference?.({ tag: control.value });
    };
  }
  const reduceMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches || container._keyboardInteraction || searchFocus;
  const nextRects = new Map();
  for (const element of container.querySelectorAll('[data-record-id]')) {
    const next = element.getBoundingClientRect();
    const previous = container._prevRects.get(element.dataset.recordId);
    nextRects.set(element.dataset.recordId, next);
    if (!reduceMotion && previous && element.animate) {
      const dx = previous.left - next.left;
      const dy = previous.top - next.top;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) element.animate([{ transform: `translate(${dx}px, ${dy}px) scale(0.985)` }, { transform: 'translate(0, 0) scale(1)' }], { duration: 220, easing: 'cubic-bezier(0.23, 1, 0.32, 1)' });
    }
    if (!reduceMotion && element.dataset.recordId === container._lastPatchedId) element.classList.add('is-landing');
  }
  container._prevRects = nextRects;
  container._lastPatchedId = null;
  if (searchFocus) {
    const input = container.querySelector('[data-view-search]');
    input.focus({ preventScroll: true });
    input.setSelectionRange(searchFocus.start, searchFocus.end, searchFocus.direction);
  }
  container.onkeydown = () => { container._keyboardInteraction = true; };
  container.onpointerdown = () => { container._keyboardInteraction = false; };
  container.oninput = event => {
    if (!event.target.matches('[data-view-search]')) return;
    container._searchQuery = event.target.value;
    renderCollections(container, options);
  };
  const swimlaneForm = container.querySelector('.collection-swimlane-form');
  if (swimlaneForm) {
    const input = swimlaneForm.querySelector('input');
    input?.focus({ preventScroll: true });
    swimlaneForm.onsubmit = event => {
      event.preventDefault();
      const name = input.value.trim();
      if (!name) return;
      try {
        container._addingSwimlane = false;
        onAddSwimlane?.(name);
      } catch (failure) { onError?.(failure); }
    };
    swimlaneForm.onkeydown = event => {
      if (event.key === 'Escape') { event.preventDefault(); container._addingSwimlane = false; renderCollections(container, options); }
    };
  }
  container.onclick = event => {
    const control = event.target.closest('[data-layout], [data-date-step], [data-date-today], [data-new-status], [data-add-swimlane], [data-cancel-swimlane], [data-remove-swimlane]');
    if (!control || control.disabled) return;
    if (control.dataset.layout) onPreference?.({ layout: control.dataset.layout });
    else if (control.hasAttribute('data-add-swimlane')) { container._addingSwimlane = true; renderCollections(container, options); }
    else if (control.hasAttribute('data-cancel-swimlane')) { container._addingSwimlane = false; renderCollections(container, options); }
    else if (control.hasAttribute('data-remove-swimlane')) onRemoveSwimlane?.(control.dataset.removeSwimlane);
    else if (control.hasAttribute('data-new-status')) {
      if (!readOnly) void Promise.resolve().then(() => onCreateNote?.({ folder: folder ?? '', status: control.dataset.newStatus })).catch(onError);
    } else if (control.hasAttribute('data-date-today')) onPreference?.({ date: todayDate() });
    else {
      try { onPreference?.({ date: addDays(date > '9999-12-04' ? '9999-12-04' : date, Number(control.dataset.dateStep) * 28) }); }
      catch (failure) { onError?.(failure); }
    }
  };
  const patchRecord = async (record, patch) => {
    if (patch.status) container._lastPatchedId = record.note.id;
    try { await onPatch(record, patch); }
    catch (failure) { container._lastPatchedId = null; throw failure; }
  };
  container.onchange = event => {
    const control = event.target;
    if (control.matches('[data-view-sort]')) { container._sortBy = control.value; renderCollections(container, options); return; }
    if (control.matches('[data-date-jump]')) {
      if (control.value && control.validity.valid) onPreference?.({ date: control.value });
      return;
    }
    if (!control.matches('[data-property]') || readOnly) return;
    const record = records.find(item => item.note.id === control.dataset.id);
    if (!record || record.error) return;
    control.disabled = true;
    void patchRecord(record, { [control.dataset.property]: control.value }).catch(failure => { control.value = record.properties[control.dataset.property]; onError?.(failure); }).finally(() => { if (control.isConnected) control.disabled = false; });
  };
  let dragged = null;
  const clearDrag = () => {
    dragged = null;
    container.querySelectorAll('.is-drag-over, .is-dragging').forEach(element => element.classList.remove('is-drag-over', 'is-dragging'));
  };
  container.ondragstart = event => {
    const control = event.target.closest('[data-board-note]');
    if (!control || readOnly) return;
    dragged = records.find(record => record.note.id === control.dataset.boardNote);
    if (!dragged || dragged.error) { event.preventDefault(); return; }
    container._keyboardInteraction = false;
    control.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('application/x-nitrobison-status', dragged.note.id);
  };
  container.ondragover = event => {
    const column = event.target.closest('[data-board-status]');
    if (!column || !dragged || readOnly) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    container.querySelectorAll('.is-drag-over').forEach(element => { if (element !== column) element.classList.remove('is-drag-over'); });
    column.classList.add('is-drag-over');
  };
  container.ondragleave = event => {
    const column = event.target.closest('[data-board-status]');
    if (column && !column.contains(event.relatedTarget)) column.classList.remove('is-drag-over');
  };
  container.ondrop = event => {
    const column = event.target.closest('[data-board-status]');
    const record = dragged;
    clearDrag();
    if (!column || !record || readOnly) return;
    event.preventDefault();
    if (record.properties.status !== column.dataset.boardStatus) void patchRecord(record, { status: column.dataset.boardStatus }).catch(onError);
  };
  container.ondragend = clearDrag;
}
