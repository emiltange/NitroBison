import { escapeHtml, extractNoteTargets, extractTags, resolveNoteLink } from './markdown-model.js';

export function buildGraph(notes) {
  const nodes = notes.filter(note => !note.deleted).map(note => ({ id: note.id, title: note.title, folder: note.folder }));
  const edges = [];
  for (const note of notes.filter(note => !note.deleted)) {
    const seen = new Set();
    for (const target of extractNoteTargets(note.content)) {
      const resolved = resolveNoteLink(target, notes, note);
      if (!resolved || seen.has(resolved.id)) continue;
      seen.add(resolved.id);
      edges.push({ source: note.id, target: resolved.id });
    }
  }
  return { nodes, edges };
}

export function scopeGraph(graph, folder = null) {
  const primary = new Set(graph.nodes.filter(node => folder === null || node.folder === folder || (folder !== '' && node.folder.startsWith(`${folder}/`))).map(node => node.id));
  const visible = new Set(primary);
  for (const edge of graph.edges) {
    if (primary.has(edge.source)) visible.add(edge.target);
    if (primary.has(edge.target)) visible.add(edge.source);
  }
  return {
    nodes: graph.nodes.filter(node => visible.has(node.id)).map(node => ({ ...node, external: !primary.has(node.id) })),
    edges: graph.edges.filter(edge => visible.has(edge.source) && visible.has(edge.target)),
  };
}

export function filterRelatedGraph(notes, graph, { tags = [], links = [], match = 'all' } = {}) {
  const activeNotes = notes.filter(note => !note.deleted);
  const activeNoteById = new Map(activeNotes.map(note => [note.id, note]));
  const selectedTags = [...new Set([...tags].map(tag => String(tag).trim().replace(/^#/, '').toLocaleLowerCase()).filter(Boolean))];
  const selectedLinks = [...new Set([...links].filter(id => activeNoteById.has(id)))];
  match = match === 'any' ? 'any' : 'all';
  const noteTags = new Map();
  const counts = new Map();
  for (const note of activeNotes) {
    const extracted = new Set(extractTags(note.content));
    noteTags.set(note.id, extracted);
    for (const tag of extracted) counts.set(tag, (counts.get(tag) || 0) + 1);
  }
  const fullGraph = buildGraph(activeNotes);
  const neighbors = new Map(fullGraph.nodes.map(node => [node.id, new Set()]));
  for (const edge of fullGraph.edges) {
    if (edge.source === edge.target) continue;
    neighbors.get(edge.source).add(edge.target);
    neighbors.get(edge.target).add(edge.source);
  }
  const tagCounts = [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  const linkOptions = fullGraph.nodes.map(node => ({ ...node, count: neighbors.get(node.id).size })).sort((a, b) => a.title.localeCompare(b.title) || a.folder.localeCompare(b.folder));
  const metadata = { match, selectedTags, selectedLinks, tagCounts, linkOptions };
  if (!selectedTags.length && !selectedLinks.length) {
    return { ...metadata, active: false, nodes: graph.nodes, edges: graph.edges, matchedIds: [], anchorIds: [], matchedNotes: [], anchorNotes: [] };
  }
  const anchors = new Set(selectedLinks);
  function decorate(node) {
    const matchedTags = selectedTags.filter(tag => noteTags.get(node.id).has(tag));
    const matchedLinks = selectedLinks.filter(id => neighbors.get(id).has(node.id));
    const satisfied = matchedTags.length + matchedLinks.length;
    const matched = match === 'any' ? satisfied > 0 : satisfied === selectedTags.length + selectedLinks.length;
    const anchor = anchors.has(node.id);
    return { ...node, anchor, matched, matchedTags, matchedLinks, role: anchor ? 'anchor' : 'match' };
  }
  const candidates = graph.nodes.filter(node => activeNoteById.has(node.id)).map(decorate);
  const matchedIds = candidates.filter(node => node.matched).map(node => node.id);
  const nodes = candidates.filter(node => node.anchor || node.matched);
  const scopedIds = new Set(graph.nodes.map(node => node.id));
  for (const node of fullGraph.nodes) {
    if (anchors.has(node.id) && !scopedIds.has(node.id)) nodes.push(decorate({ ...node, external: true }));
  }
  const visibleIds = new Set(nodes.map(node => node.id));
  return {
    ...metadata, active: true, nodes,
    edges: fullGraph.edges.filter(edge => visibleIds.has(edge.source) && visibleIds.has(edge.target)),
    matchedIds,
    anchorIds: nodes.filter(node => node.anchor).map(node => node.id),
    matchedNotes: nodes.filter(node => node.matched && !node.anchor),
    anchorNotes: nodes.filter(node => node.anchor),
  };
}

export function buildFolderGraph(notes, folders = [], linkedFolders = []) {
  return groupFolders(buildGraph(notes), folders, linkedFolders);
}

function groupFolders(graph, folders, linkedFolders = []) {
  const groups = new Map();
  function addFolder(folder) {
    if (!groups.has(folder)) groups.set(folder, { id: folder, title: folder || 'Vault root', folder, noteCount: 0, internalLinks: 0 });
    const slash = folder.lastIndexOf('/');
    if (slash > 0) addFolder(folder.slice(0, slash));
  }
  addFolder('');
  for (const folder of folders) addFolder(folder);
  for (const link of linkedFolders) addFolder(link.folder);
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  for (const node of graph.nodes) {
    addFolder(node.folder || '');
    groups.get(node.folder || '').noteCount += 1;
  }
  const pairs = new Map();
  for (const edge of graph.edges) {
    const source = byId.get(edge.source).folder || '';
    const target = byId.get(edge.target).folder || '';
    if (source === target) { groups.get(source).internalLinks += 1; continue; }
    const pair = [source, target].sort();
    const key = JSON.stringify(pair);
    if (!pairs.has(key)) pairs.set(key, { source: pair[0], target: pair[1], count: 0 });
    pairs.get(key).count += 1;
  }
  return { nodes: [...groups.values()], edges: [...pairs.values()] };
}

export function mountGraph(container, allNotes, onOpen, options = {}) {
  const noteGraph = buildGraph(allNotes);
  const linkedFolders = options.linkedFolders || [];
  const folderGraph = groupFolders(noteGraph, options.folders || [], linkedFolders);
  const folderChoices = [null, ...folderGraph.nodes.map(node => node.folder).sort((a, b) => a.localeCompare(b))];
  let folder = options.folder ?? null;
  if (!folderChoices.includes(folder)) folderChoices.push(folder);
  let mode = options.mode === 'folders' ? 'folders' : 'notes';
  let query = '';
  const selectedTags = new Set();
  const selectedLinks = new Set();
  let relationMatch = 'all';
  let relations = filterRelatedGraph(allNotes, noteGraph);
  let camera = { x: 0, y: 0, zoom: 1 };
  let frame = null;
  let motionPaused = false;
  let layoutSteps = 0;
  let disposed = false;
  let graph = { nodes: [], edges: [] };
  let positions = [];
  let lines = [];
  let nodeElements = [];
  let viewport;
  let svg;
  let gesture = null;
  let suppressClick = false;
  let selection = null;
  let selectionIndex = -1;
  let selectionOrigin = null;
  const pointers = new Map();
  const removers = [];
  const view = container.ownerDocument.defaultView;
  const reducedMotion = view.matchMedia('(prefers-reduced-motion: reduce)');
  const narrowLayout = view.matchMedia('(max-width: 650px)');
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const plural = (count, noun) => `${count} ${noun}${count === 1 ? '' : 's'}`;
  container.innerHTML = `<div class="graph-toolbar"><div><span class="fb-eyebrow">A different perspective</span><h2 class="fb-title">Your connected ideas</h2></div><div class="graph-zoom" role="group" aria-label="Graph zoom"><button class="fb-btn fb-btn--secondary" data-zoom="out" aria-label="Zoom out">−</button><button class="fb-btn fb-btn--secondary" data-zoom="reset" aria-label="Reset graph position and zoom">100%</button><button class="fb-btn fb-btn--secondary" data-zoom="in" aria-label="Zoom in">+</button></div></div><div class="graph-controls"><div class="graph-modes" role="group" aria-label="Graph view"><button class="fb-btn fb-btn--secondary" data-graph-mode="notes">Notes</button><button class="fb-btn fb-btn--secondary" data-graph-mode="folders">Folders</button></div><label class="fb-field graph-scope">Folder scope<select aria-label="Graph folder scope">${folderChoices.map((path, index) => `<option value="${index}">${escapeHtml(path === null ? 'All folders' : path === '' ? 'Vault root (no folder)' : path)}</option>`).join('')}</select></label><button class="fb-btn fb-btn--secondary" data-graph-all>All folders</button><label class="fb-field graph-search">Find a note or folder<input type="search" placeholder="Filter the graph…" aria-label="Filter graph notes or folders" /></label></div><p class="graph-help">Drag a node to arrange it; drag the background to pan. Scroll or pinch to zoom. Select a node or list item to inspect its links.</p><p class="graph-status" role="status" aria-live="polite"></p><div class="graph-stage"><div class="graph-canvas"></div><aside class="graph-inspector" aria-label="Graph node details" hidden></aside></div><details class="graph-alternative" open><summary>Keyboard-friendly navigation</summary><div class="graph-note-list"></div></details>`;
  const canvas = container.querySelector('.graph-canvas');
  const stage = container.querySelector('.graph-stage');
  stage.insertAdjacentHTML('beforebegin', `<section class="graph-relations" aria-label="Relationship filter"><header class="graph-relations-heading"><div><h3 class="fb-eyebrow">Relationship filter</h3><p class="fb-meta">Find documents shared by linked notes and topics.</p></div><button type="button" class="fb-btn fb-btn--text" data-graph-clear-filters hidden>Clear filters</button></header><fieldset class="graph-relation-tags"><legend class="fb-meta">Topics</legend><div class="graph-tag-strip">${relations.tagCounts.length ? relations.tagCounts.map(({ tag, count }) => `<button type="button" class="fb-chip" data-graph-tag="${escapeHtml(tag)}" aria-pressed="false">#${escapeHtml(tag)} <span class="graph-tag-count">${count}</span></button>`).join('') : '<p class="fb-meta">Add #tags in notes to filter by topic</p>'}</div></fieldset><div class="graph-relation-options"><label class="fb-field graph-link-picker">Linked to…<select data-graph-add-link aria-label="Add a linked note filter"></select></label><div class="graph-match-toggle" role="group" aria-label="Match selected relationships"><button type="button" class="fb-btn fb-btn--secondary" data-graph-match="all" aria-pressed="true">Match all (shared)</button><button type="button" class="fb-btn fb-btn--secondary" data-graph-match="any" aria-pressed="false">Match any</button></div></div><div class="graph-selected-links" data-graph-selected-links aria-label="Selected link anchors"></div><p class="fb-meta graph-relation-hint">Shift+click a note on the graph or in the list to add or remove a link anchor.</p><div class="graph-filter-results" data-graph-filter-results hidden></div></section>`);
  const relationPanel = container.querySelector('.graph-relations');
  const addLinkSelect = relationPanel.querySelector('[data-graph-add-link]');
  const filterResults = relationPanel.querySelector('[data-graph-filter-results]');
  const help = container.querySelector('.graph-help');
  const inspector = container.querySelector('.graph-inspector');
  const noteById = new Map(noteGraph.nodes.map(node => [node.id, node]));
  const list = container.querySelector('.graph-note-list');
  const scopeSelect = container.querySelector('select');
  const status = container.querySelector('.graph-status');
  const reset = container.querySelector('[data-zoom="reset"]');
  container.querySelector('.graph-controls').insertAdjacentHTML('beforeend', '<button type="button" class="fb-btn fb-btn--secondary" data-graph-motion>Pause motion</button>');
  const motionControl = container.querySelector('[data-graph-motion]');
  const controls = container.querySelector('.graph-controls');
  const searchInput = controls.querySelector('input');
  const modeControls = [...controls.querySelectorAll('[data-graph-mode]')];
  const allFoldersControl = controls.querySelector('[data-graph-all]');
  const navigation = options.navigation || null;
  let navigationMenu = null;
  if (navigation) {
    navigation.innerHTML = `<div class="graph-navigation-menu" role="navigation" aria-label="Graph navigation"><section class="graph-navigation-section"><h3 class="graph-navigation-heading" data-graph-list-heading></h3></section><section class="graph-navigation-section graph-navigation-linked-folders"><h3 class="graph-navigation-heading">Linked folders <span>${linkedFolders.length}</span></h3><div class="graph-navigation-linked-list">${linkedFolders.length ? linkedFolders.map(link => {
      const provider = link.provider === 'google' ? link.accountType === 'business' ? 'Google Workspace EA' : 'Google Drive' : link.provider === 'onedrive' ? 'OneDrive' : 'Local folder';
      const status = { connected: 'Folder connected', error: 'Folder save failed', selected: 'Enable Markdown saving', pending: 'Saving Markdown…' }[link.status] || 'Folder status unavailable';
      return `<button type="button" class="graph-list-note graph-navigation-linked-folder" data-graph-inspect-folder="${escapeHtml(link.folder)}" aria-pressed="false"><span>${escapeHtml(link.folder || 'Vault root')}</span><small class="graph-navigation-provider">${provider}${link.manualService ? ' · service label selected manually' : ''}</small><small class="graph-navigation-path">${escapeHtml(link.directory)}</small><small class="graph-navigation-link-status">${status}${link.status === 'connected' && Number.isFinite(link.fileCount) ? ` · ${plural(link.fileCount, 'Markdown file')}` : ''}</small></button>`;
    }).join('') : '<p class="graph-navigation-empty">No linked folders on this device.</p>'}</div><p class="graph-navigation-help">Linked folders are device location references. A folder connection does not verify cloud sign-in or a completed upload.</p></section></div>`;
    navigationMenu = navigation.querySelector('.graph-navigation-menu');
    controls.classList.add('graph-navigation-controls');
    navigationMenu.prepend(controls);
    list.classList.add('graph-navigation-list');
    navigation.querySelector('.graph-navigation-section').append(list);
    container.querySelector('.graph-alternative').remove();
  }
  const listHeading = navigationMenu?.querySelector('[data-graph-list-heading]');
  const interactionRoots = navigation && !container.contains(navigation) ? [container, navigation] : [container];

  function matchReason(node) {
    return [
      node.matchedLinks.length ? `Linked to ${node.matchedLinks.map(id => noteById.get(id).title).join(' & ')}` : '',
      node.matchedTags.map(tag => `#${tag}`).join(' · '),
    ].filter(Boolean).join(' · ');
  }
  function paintRelations() {
    relationPanel.hidden = mode === 'folders';
    if (relationPanel.hidden) return;
    relationPanel.querySelectorAll('[data-graph-tag]').forEach(button => button.setAttribute('aria-pressed', String(selectedTags.has(button.dataset.graphTag))));
    relationPanel.querySelectorAll('[data-graph-match]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.graphMatch === relationMatch)));
    relationPanel.querySelector('[data-graph-clear-filters]').hidden = !relations.active;
    addLinkSelect.innerHTML = '<option value="">Choose a note…</option>' + relations.linkOptions.filter(node => !selectedLinks.has(node.id)).map(node => `<option value="${escapeHtml(node.id)}">${escapeHtml(`${node.title} · ${node.folder || 'Vault root'} · ${plural(node.count, 'connection')}`)}</option>`).join('');
    relationPanel.querySelector('[data-graph-selected-links]').innerHTML = relations.selectedLinks.map(id => `<button type="button" class="fb-chip graph-link-pill" data-graph-remove-link="${escapeHtml(id)}" aria-label="${escapeHtml(`Remove ${noteById.get(id).title} from link filter`)}"><span>${escapeHtml(noteById.get(id).title)}</span><span aria-hidden="true">×</span></button>`).join('');
    filterResults.hidden = !relations.active;
    if (!relations.active) { filterResults.replaceChildren(); return; }
    filterResults.innerHTML = `<div class="graph-filter-result-heading"><strong>${plural(relations.matchedNotes.length, relationMatch === 'all' ? 'shared document' : 'related document')}</strong><span class="fb-meta">${relationMatch === 'all' ? 'Matching every selected link and tag' : 'Matching at least one selected link or tag'}${query ? ' · within your search' : ''}</span></div>${relations.anchorNotes.length ? `<p class="fb-meta">${plural(relations.anchorNotes.length, 'selected anchor')} kept visible; anchors are separate from document results.</p>` : ''}${relations.matchedNotes.length ? `<div class="graph-matched-documents">${relations.matchedNotes.map(node => `<button type="button" class="fb-chip graph-matched-document" data-graph-inspect-note="${escapeHtml(node.id)}"><strong>${escapeHtml(node.title)}</strong><small>${escapeHtml(matchReason(node))}</small><small class="fb-meta">${escapeHtml(node.folder || 'Vault root')}</small></button>`).join('')}</div>` : `<p class="graph-filter-empty fb-meta">No documents match ${relationMatch === 'all' ? 'all' : 'any'} selected links and tags${query ? ' within your search' : ''}.${relations.anchorNotes.some(node => node.matched) ? ' Only selected anchors match; no additional documents found.' : ''}</p>`}`;
  }
  function applyRelationshipFilters() {
    const changedMode = mode !== 'notes';
    mode = 'notes';
    draw();
    if (changedMode) options.onMode?.(mode);
  }
  function toggleLink(id, keepInspector = false) {
    if (!noteById.has(id)) return;
    if (selectedLinks.has(id)) selectedLinks.delete(id);
    else selectedLinks.add(id);
    applyRelationshipFilters();
    if (keepInspector) {
      inspectNode('note', id);
      inspector.querySelector('[data-graph-pin-link]').focus({ preventScroll: true });
    } else {
      const index = graph.nodes.findIndex(node => node.id === id);
      (nodeElements[index] || addLinkSelect).focus({ preventScroll: true });
    }
  }

  function updateMotionControl() {
    motionControl.disabled = reducedMotion.matches;
    motionControl.textContent = reducedMotion.matches ? 'Reduced motion' : motionPaused ? 'Resume motion' : 'Pause motion';
  }

  function listen(target, type, listener, settings) {
    target.addEventListener(type, listener, settings);
    removers.push(() => target.removeEventListener(type, listener, settings));
  }
  function stopMotion() {
    if (frame !== null) view.cancelAnimationFrame(frame);
    frame = null;
  }
  function startMotion() {
    if (frame !== null || disposed || !positions.length || reducedMotion.matches || container.ownerDocument.hidden) return;
    if (motionPaused && !layoutSteps && !(gesture?.kind === 'node' && gesture.moved)) return;
    let painted = view.performance.now();
    function tick(now) {
      frame = null;
      if (disposed || reducedMotion.matches || container.ownerDocument.hidden) return;
      const dragging = gesture?.kind === 'node' && gesture.moved;
      const layout = layoutSteps > 0 || dragging;
      if (layout) {
        stepLayout();
        if (layoutSteps > 0) layoutSteps -= 1;
      }
      const drift = !motionPaused && now - painted >= 1000 / 30;
      if (drift) {
        for (let index = 0; index < positions.length; index += 1) {
          if (gesture?.kind === 'node' && index === gesture.index) continue;
          const point = positions[index], phase = index * 2.4;
          point.x = clamp(point.x + (Math.sin(now / 1800 + phase) - Math.sin(painted / 1800 + phase)) * 12, 25, 675);
          point.y = clamp(point.y + (Math.cos(now / 2200 + phase) - Math.cos(painted / 2200 + phase)) * 8, 45, 425);
        }
      }
      if (now - painted >= 1000 / 30) painted = now;
      if (layout || drift) paintPositions();
      if (!motionPaused || layoutSteps > 0 || dragging) frame = view.requestAnimationFrame(tick);
    }
    frame = view.requestAnimationFrame(tick);
  }
  function releasePointers() {
    const captured = [...pointers.entries()];
    pointers.clear();
    gesture = null;
    for (const [id, pointer] of captured) {
      if (pointer.target.hasPointerCapture?.(id)) pointer.target.releasePointerCapture(id);
    }
    canvas.classList.remove('is-dragging');
  }
  function paintCamera() {
    viewport?.setAttribute('transform', `translate(${camera.x} ${camera.y}) scale(${camera.zoom})`);
    reset.textContent = `${Math.round(camera.zoom * 100)}%`;
    positionInspector();
  }
  function paintPositions() {
    positions.forEach((point, index) => nodeElements[index].setAttribute('transform', `translate(${point.x} ${point.y})`));
    for (const line of lines) {
      const source = positions[line.source], target = positions[line.target];
      if (line.loop) {
        line.element.setAttribute('d', `M ${source.x - 7} ${source.y - 7} C ${source.x - 40} ${source.y - 55}, ${source.x + 40} ${source.y - 55}, ${source.x + 7} ${source.y - 7}`);
      } else {
        line.element.setAttribute('x1', source.x);
        line.element.setAttribute('y1', source.y);
        line.element.setAttribute('x2', target.x);
        line.element.setAttribute('y2', target.y);
      }
      if (line.label) {
        line.label.setAttribute('x', (source.x + target.x) / 2);
        line.label.setAttribute('y', (source.y + target.y) / 2 - 7);
      }
    }
  }
  function stepLayout() {
    const pinned = gesture?.kind === 'node' ? gesture.index : -1;
    const cells = new Map();
    positions.forEach((point, index) => {
      point.vx += (350 - point.x) * .001;
      point.vy += (235 - point.y) * .001;
      const key = `${Math.floor(point.x / 70)},${Math.floor(point.y / 70)}`;
      if (!cells.has(key)) cells.set(key, []);
      cells.get(key).push(index);
    });
    positions.forEach((point, index) => {
      const cellX = Math.floor(point.x / 70), cellY = Math.floor(point.y / 70);
      for (let x = cellX - 1; x <= cellX + 1; x += 1) {
        for (let y = cellY - 1; y <= cellY + 1; y += 1) {
          for (const otherIndex of cells.get(`${x},${y}`) || []) {
            if (otherIndex <= index) continue;
            const other = positions[otherIndex];
            const dx = point.x - other.x || .1, dy = point.y - other.y || .1;
            const distance = Math.hypot(dx, dy);
            if (distance >= 70) continue;
            const force = (70 - distance) * .018 / distance;
            point.vx += dx * force; point.vy += dy * force;
            other.vx -= dx * force; other.vy -= dy * force;
          }
        }
      }
    });
    for (const line of lines) {
      if (line.loop) continue;
      const source = positions[line.source], target = positions[line.target];
      const dx = target.x - source.x, dy = target.y - source.y;
      const distance = Math.max(1, Math.hypot(dx, dy));
      const force = (distance - 105) * .003 / distance;
      source.vx += dx * force; source.vy += dy * force;
      target.vx -= dx * force; target.vy -= dy * force;
    }
    let speed = 0;
    for (let index = 0; index < positions.length; index += 1) {
      const point = positions[index];
      if (index === pinned) { point.vx = 0; point.vy = 0; continue; }
      point.vx = clamp(point.vx * .8, -5, 5);
      point.vy = clamp(point.vy * .8, -5, 5);
      point.x = clamp(point.x + point.vx, 35, 665);
      point.y = clamp(point.y + point.vy, 55, 420);
      speed = Math.max(speed, Math.abs(point.vx), Math.abs(point.vy));
    }
    return speed;
  }
  function settle(animate) {
    if (disposed) return;
    if (!animate || reducedMotion.matches) {
      for (let index = 0; index < 55; index += 1) stepLayout();
      layoutSteps = 0;
      paintPositions();
    } else layoutSteps = 55;
    startMotion();
  }
  function draw(animate = false) {
    stopMotion();
    releasePointers();
    closeInspector(false);
    graph = scopeGraph(mode === 'folders' ? folderGraph : noteGraph, folder);
    const visible = graph.nodes.filter(node => (mode === 'notes' && selectedLinks.has(node.id)) || `${node.folder}/${node.title}`.toLowerCase().includes(query));
    const ids = new Set(visible.map(node => node.id));
    graph = { nodes: visible, edges: graph.edges.filter(edge => ids.has(edge.source) && ids.has(edge.target)) };
    if (mode === 'notes') {
      relations = filterRelatedGraph(allNotes, graph, { tags: selectedTags, links: selectedLinks, match: relationMatch });
      graph = { nodes: relations.nodes, edges: relations.edges };
    }
    paintRelations();
    const filterActive = mode === 'notes' && relations.active;
    scopeSelect.value = String(folderChoices.indexOf(folder));
    modeControls.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.graphMode === mode)));
    allFoldersControl.disabled = folder === null;
    if (listHeading) listHeading.textContent = `${mode === 'folders' ? 'Folders' : 'Notes'} in this view · ${graph.nodes.length}`;
    const outside = graph.nodes.filter(node => node.external).length;
    status.textContent = `${plural(graph.nodes.length, mode === 'folders' ? 'folder' : 'note')} · ${plural(graph.edges.reduce((total, edge) => total + (edge.count || 1), 0), 'link')}${outside ? ` · ${outside} outside this folder (dashed outline)` : ''}`;
    if (filterActive) status.textContent = `${plural(relations.matchedNotes.length, relationMatch === 'all' ? 'shared document' : 'related document')} · ${plural(relations.anchorNotes.length, 'link anchor')} · ${status.textContent}`;
    help.textContent = `${filterActive ? `Matching ${relationMatch === 'all' ? 'all' : 'any'} selected links and tags. Selected link anchors stay visible. ` : ''}Drag a node to arrange it; drag the background to pan. Scroll or pinch to zoom. Select a node to inspect its links.${mode === 'notes' ? ' Use the Relationship filter or Shift+click notes to select link anchors.' : ''}`;
    const counts = new Map(graph.nodes.map(node => [node.id, 0]));
    const titles = new Map(graph.nodes.map(node => [node.id, node.title]));
    for (const edge of graph.edges) {
      counts.set(edge.source, counts.get(edge.source) + (edge.count || 1));
      if (edge.target !== edge.source) counts.set(edge.target, counts.get(edge.target) + (edge.count || 1));
    }
    function description(node) {
      return mode === 'folders'
        ? `${plural(node.noteCount, 'note')} directly in folder; ${plural(counts.get(node.id), 'cross-folder link')}; ${plural(node.internalLinks, 'internal link')}`
        : `${node.folder || 'Vault root'}; ${plural(counts.get(node.id), 'connection')}${node.anchor ? '; selected link anchor' : node.matched ? '; related match' : ''}`;
    }
    const graphNodeById = new Map(graph.nodes.map(node => [node.id, node]));
    const nodeClasses = node => `${node.external ? ' is-external' : ''}${node.anchor ? ' is-anchor' : ''}${node.matched ? ' is-match' : ''}`;
    const isFilterEdge = edge => filterActive && edge.source !== edge.target && ((graphNodeById.get(edge.source).anchor && graphNodeById.get(edge.target).matched) || (graphNodeById.get(edge.target).anchor && graphNodeById.get(edge.source).matched));
    canvas.innerHTML = graph.nodes.length ? `<svg viewBox="0 0 700 470" role="group" tabindex="0" aria-label="${mode === 'folders' ? 'Folder' : 'Note'} graph. Select a node to inspect its links.${mode === 'notes' ? ' Shift+click a note to toggle its link filter.' : ''} Drag nodes to move them, drag the background to pan, and scroll or pinch to zoom. Arrow keys pan; plus and minus zoom; zero resets."><g class="graph-viewport"><g class="graph-edges">${graph.edges.map((edge, index) => `<g data-graph-edge="${index}"${isFilterEdge(edge) ? ' class="is-filter-edge"' : ''}>${edge.source === edge.target ? '<path />' : '<line />'}<title>${escapeHtml(`${titles.get(edge.source)} — ${titles.get(edge.target)}: ${plural(edge.count || 1, 'link')}`)}</title>${mode === 'folders' ? `<text text-anchor="middle">${edge.count}</text>` : ''}</g>`).join('')}</g>${graph.nodes.map((node, index) => `<g class="graph-node${nodeClasses(node)}${mode === 'folders' ? ' is-folder' : ''}" data-graph-node="${index}" role="button" tabindex="0" aria-pressed="false" aria-label="${escapeHtml(`Inspect ${mode === 'folders' ? 'folder' : 'note'} ${node.title}; ${description(node)}${node.external ? '; outside this folder' : ''}`)}"><title>${escapeHtml(`${node.title} · ${description(node)}${node.external ? ' · Outside this folder' : ''}`)}</title><circle class="graph-node-hit" r="24" />${node.anchor ? `<circle class="graph-node-anchor-ring" r="${Math.min(9 + Math.sqrt(counts.get(node.id)) * 2, 20) + 6}" />` : ''}<circle class="graph-node-dot" r="${Math.min(9 + Math.sqrt(counts.get(node.id)) * 2, 20)}" /><text y="35" text-anchor="middle">${escapeHtml(node.title.length > 27 ? `${node.title.slice(0, 26)}…` : node.title)}</text></g>`).join('')}</g></svg>` : `<div class="fb-state"><b>${filterActive ? 'No matching documents.' : 'No ideas in this view.'}</b><p>${filterActive ? 'Change the selected links or tags, or clear filters.' : 'Choose another folder, clear your search, or add a note.'}</p></div>`;
    list.innerHTML = graph.nodes.map((node, index) => `<button type="button" class="graph-list-note${navigation ? ' graph-navigation-entity' : ''}${nodeClasses(node)}" data-graph-node="${index}" aria-pressed="false"><span>${escapeHtml(node.title)}</span><small>${escapeHtml(description(node))}</small>${node.anchor ? '<small class="fb-pill graph-anchor-label">Link anchor</small>' : node.matched ? '<small class="fb-pill graph-match-label">Related match</small>' : ''}${node.external ? '<small class="graph-external-label">Outside this folder</small>' : ''}</button>`).join('') || (navigation ? '<p class="graph-navigation-empty">No matching entities. Change your filters, choose another folder, or clear the search.</p>' : '');
    svg = canvas.querySelector('svg');
    viewport = svg?.querySelector('.graph-viewport');
    if (!svg) { positions = []; lines = []; nodeElements = []; return; }
    const indices = new Map(graph.nodes.map((node, index) => [node.id, index]));
    positions = graph.nodes.map((node, index) => {
      const angle = index * 2.399963229728653;
      const radius = graph.nodes.length === 1 ? 0 : 185 * Math.sqrt((index + 1) / graph.nodes.length);
      return { x: 350 + Math.cos(angle) * radius * 1.25, y: 235 + Math.sin(angle) * radius * .85, vx: 0, vy: 0 };
    });
    nodeElements = [...svg.querySelectorAll('.graph-node')];
    const edgeElements = [...svg.querySelectorAll('[data-graph-edge]')];
    lines = graph.edges.map((edge, index) => {
      const group = edgeElements[index];
      return { source: indices.get(edge.source), target: indices.get(edge.target), element: group.querySelector('line, path'), label: group.querySelector('text'), loop: edge.source === edge.target };
    });
    paintPositions();
    paintCamera();
    settle(animate);
  }
  function selectFolder(path) {
    folder = path;
    mode = 'notes';
    camera = { x: 0, y: 0, zoom: 1 };
    draw();
    options.onFolder?.(path);
    options.onScope?.(path);
  }
  function activate(index, origin) {
    const node = graph.nodes[Number(index)];
    if (!node) return;
    selectionOrigin = origin;
    inspectNode(mode === 'folders' ? 'folder' : 'note', node.id);
  }
  function paintSelection() {
    const id = !selection ? null : mode === 'folders'
      ? selection.kind === 'folder' ? selection.id : noteById.get(selection.id)?.folder || ''
      : selection.kind === 'note' ? selection.id : null;
    selectionIndex = selection ? graph.nodes.findIndex(node => node.id === id) : -1;
    for (const root of interactionRoots) {
      root.querySelectorAll('[data-graph-node]').forEach(element => {
        const selected = Number(element.dataset.graphNode) === selectionIndex;
        element.classList.toggle('is-selected', selected);
        element.setAttribute('aria-pressed', String(selected));
      });
      root.querySelectorAll('[data-graph-inspect-folder]').forEach(element => {
        const selected = selection?.kind === 'folder' && element.dataset.graphInspectFolder === selection.id;
        element.classList.toggle('is-selected', selected);
        element.setAttribute('aria-pressed', String(selected));
      });
    }
  }
  function positionInspector() {
    if (inspector.hidden || narrowLayout.matches) return;
    const bounds = stage.getBoundingClientRect();
    const canvasBounds = canvas.getBoundingClientRect();
    const width = inspector.offsetWidth, height = inspector.offsetHeight;
    let x = bounds.width - width - 12, y = canvasBounds.top - bounds.top + 12;
    const point = positions[selectionIndex];
    const matrix = point && svg?.getScreenCTM();
    if (matrix) {
      const graphX = camera.x + point.x * camera.zoom, graphY = camera.y + point.y * camera.zoom;
      const anchorX = matrix.a * graphX + matrix.c * graphY + matrix.e - bounds.left;
      const anchorY = matrix.b * graphX + matrix.d * graphY + matrix.f - bounds.top;
      x = anchorX + 26 + width <= bounds.width - 12 ? anchorX + 26 : anchorX - width - 26;
      y = anchorY - 24;
    }
    inspector.style.left = `${clamp(x, 12, Math.max(12, bounds.width - width - 12))}px`;
    inspector.style.top = `${clamp(y, canvasBounds.top - bounds.top + 12, Math.max(canvasBounds.top - bounds.top + 12, canvasBounds.bottom - bounds.top - height - 12))}px`;
  }
  function closeInspector(restoreFocus = true) {
    const focusTarget = selectionOrigin?.isConnected ? selectionOrigin : nodeElements[selectionIndex] || svg;
    selection = null;
    selectionOrigin = null;
    inspector.hidden = true;
    inspector.replaceChildren();
    paintSelection();
    if (restoreFocus) focusTarget?.focus({ preventScroll: true });
  }
  function inspectNoteButton(note) {
    return `<button type="button" class="graph-inspector-link" data-graph-inspect-note="${escapeHtml(note.id)}" aria-label="${escapeHtml(`Inspect note ${note.title} in ${note.folder || 'Vault root'}`)}"><span>${escapeHtml(note.title)}</span><small>${escapeHtml(note.folder || 'Vault root')}</small></button>`;
  }
  function referenceSection(edges, direction, isFolder) {
    const outgoing = direction === 'outgoing';
    return `<section class="graph-inspector-section"><h4>${outgoing ? 'Outgoing links' : 'Incoming links'} <span>${edges.length}</span></h4>${edges.length ? `<ul>${edges.map(edge => {
      const source = noteById.get(edge.source), target = noteById.get(edge.target);
      return isFolder
        ? `<li class="graph-inspector-reference">${inspectNoteButton(source)}<span class="graph-inspector-arrow" aria-label="links to">→</span>${inspectNoteButton(target)}</li>`
        : `<li>${inspectNoteButton(outgoing ? target : source)}</li>`;
    }).join('')}</ul>` : `<p class="graph-inspector-empty">${outgoing ? 'No outgoing document links.' : 'No documents link here yet.'}</p>`}</section>`;
  }
  function inspectNode(kind, id) {
    const node = kind === 'folder' ? folderGraph.nodes.find(item => item.id === id) : noteById.get(id);
    if (!node) return;
    selection = { kind, id };
    const isFolder = kind === 'folder';
    const outgoing = noteGraph.edges.filter(edge => isFolder ? noteById.get(edge.source).folder === node.folder : edge.source === id);
    const incoming = noteGraph.edges.filter(edge => isFolder ? noteById.get(edge.target).folder === node.folder : edge.target === id);
    inspector.innerHTML = `<header class="graph-inspector-header"><div><span class="fb-eyebrow">${isFolder ? 'Folder' : 'Note'} details</span><h3 tabindex="-1">${escapeHtml(node.title)}</h3><p>${escapeHtml(isFolder ? `${plural(node.noteCount, 'document')} directly in this folder` : node.folder || 'Vault root')}</p></div><button type="button" class="graph-inspector-close" data-graph-close aria-label="Close node details">×</button></header><div class="graph-inspector-actions"><button type="button" class="fb-btn" data-graph-open${isFolder && !options.onOpenFolder ? ' disabled' : ''}>${isFolder ? 'Open folder' : 'Open note'}</button>${isFolder ? '<button type="button" class="fb-btn fb-btn--secondary" data-graph-explore-folder>Explore folder graph</button>' : ''}</div>${isFolder ? '<p class="graph-inspector-explanation">References involving documents directly in this folder. Arrows run from the linking document to its target.</p>' : ''}${referenceSection(outgoing, 'outgoing', isFolder)}${referenceSection(incoming, 'incoming', isFolder)}`;
    if (!isFolder) {
      inspector.querySelector('.graph-inspector-actions').insertAdjacentHTML('beforeend', `<button type="button" class="fb-btn fb-btn--secondary" data-graph-pin-link="${escapeHtml(id)}" aria-pressed="${selectedLinks.has(id)}">${selectedLinks.has(id) ? 'Remove from link filter' : 'Pin to link filter'}</button>`);
      const relatedNode = mode === 'notes' && relations.active ? relations.nodes.find(item => item.id === id) : null;
      if (relatedNode) inspector.querySelector('.graph-inspector-actions').insertAdjacentHTML('afterend', `<p class="graph-inspector-explanation">${relatedNode.anchor ? 'Selected link anchor. ' : 'Related document. '}${escapeHtml(matchReason(relatedNode))}</p>`);
    }
    inspector.hidden = false;
    inspector.scrollTop = 0;
    paintSelection();
    positionInspector();
    inspector.querySelector('h3').focus({ preventScroll: !narrowLayout.matches });
  }
  function localPoint(clientX, clientY) {
    const point = svg.createSVGPoint();
    point.x = clientX; point.y = clientY;
    const matrix = svg.getScreenCTM();
    return matrix ? point.matrixTransform(matrix.inverse()) : point;
  }
  function zoomAt(zoom, anchor = { x: 350, y: 235 }) {
    const next = clamp(zoom, .35, 3.5);
    const ratio = next / camera.zoom;
    camera.x = anchor.x - (anchor.x - camera.x) * ratio;
    camera.y = anchor.y - (anchor.y - camera.y) * ratio;
    camera.zoom = next;
    paintCamera();
  }
  function resetView() {
    camera = { x: 0, y: 0, zoom: 1 };
    paintCamera();
  }
  function handleClick(event) {
    if (suppressClick && canvas.contains(event.target)) { event.preventDefault(); suppressClick = false; return; }
    const tag = event.target.closest('[data-graph-tag]');
    if (tag) {
      if (selectedTags.has(tag.dataset.graphTag)) selectedTags.delete(tag.dataset.graphTag);
      else selectedTags.add(tag.dataset.graphTag);
      applyRelationshipFilters();
      return;
    }
    const removeLink = event.target.closest('[data-graph-remove-link]');
    if (removeLink) { toggleLink(removeLink.dataset.graphRemoveLink); addLinkSelect.focus({ preventScroll: true }); return; }
    const pinLink = event.target.closest('[data-graph-pin-link]');
    if (pinLink) { toggleLink(pinLink.dataset.graphPinLink, true); return; }
    const match = event.target.closest('[data-graph-match]');
    if (match) { relationMatch = match.dataset.graphMatch; applyRelationshipFilters(); return; }
    if (event.target.closest('[data-graph-clear-filters]')) {
      selectedTags.clear(); selectedLinks.clear();
      applyRelationshipFilters();
      addLinkSelect.focus({ preventScroll: true });
      return;
    }
    if (event.target.closest('[data-graph-motion]')) {
      motionPaused = !motionPaused;
      updateMotionControl();
      if (motionPaused) { layoutSteps = 0; stopMotion(); }
      else startMotion();
      return;
    }
    const node = event.target.closest('[data-graph-node]');
    if (node) {
      if (event.shiftKey && mode === 'notes') toggleLink(graph.nodes[Number(node.dataset.graphNode)].id);
      else activate(node.dataset.graphNode, node);
      return;
    }
    const linkedNote = event.target.closest('[data-graph-inspect-note]');
    if (linkedNote) { selectionOrigin = linkedNote; inspectNode('note', linkedNote.dataset.graphInspectNote); return; }
    const linkedFolder = event.target.closest('[data-graph-inspect-folder]');
    if (linkedFolder) { selectionOrigin = linkedFolder; inspectNode('folder', linkedFolder.dataset.graphInspectFolder); return; }
    if (event.target.closest('[data-graph-close]')) { closeInspector(); return; }
    if (event.target.closest('[data-graph-open]') && selection) {
      if (selection.kind === 'folder') options.onOpenFolder?.(selection.id);
      else onOpen(selection.id);
      return;
    }
    if (event.target.closest('[data-graph-explore-folder]') && selection?.kind === 'folder') { selectFolder(selection.id); return; }
    const zoom = event.target.closest('[data-zoom]');
    if (zoom) {
      if (zoom.dataset.zoom === 'reset') resetView();
      else zoomAt(camera.zoom * (zoom.dataset.zoom === 'in' ? 1.25 : .8));
      return;
    }
    const button = event.target.closest('[data-graph-mode]');
    if (button) {
      mode = button.dataset.graphMode;
      camera = { x: 0, y: 0, zoom: 1 };
      draw();
      options.onMode?.(mode);
    }
    if (event.target.closest('[data-graph-all]')) selectFolder(null);
  }
  function handleKeydown(event) {
    const node = event.target.closest('.graph-node');
    const listNode = event.target.closest('[data-graph-node]');
    if (listNode && mode === 'notes' && event.shiftKey && ['Enter', ' '].includes(event.key)) {
      event.preventDefault();
      toggleLink(graph.nodes[Number(listNode.dataset.graphNode)].id);
      return;
    }
    if (event.key === 'Escape' && selection) { event.preventDefault(); closeInspector(); return; }
    if (node && ['Enter', ' '].includes(event.key)) { event.preventDefault(); activate(node.dataset.graphNode, node); return; }
    if (event.target !== svg) return;
    const directions = { ArrowLeft: [35, 0], ArrowRight: [-35, 0], ArrowUp: [0, 35], ArrowDown: [0, -35] };
    if (directions[event.key]) {
      event.preventDefault();
      camera.x += directions[event.key][0]; camera.y += directions[event.key][1]; paintCamera();
    } else if (['+', '=', '-', '0'].includes(event.key)) {
      event.preventDefault();
      if (event.key === '0') resetView();
      else zoomAt(camera.zoom * (event.key === '-' ? .8 : 1.25));
    }
  }
  for (const root of interactionRoots) {
    listen(root, 'click', handleClick);
    listen(root, 'keydown', handleKeydown);
  }
  listen(scopeSelect, 'change', event => selectFolder(folderChoices[Number(event.target.value)]));
  listen(searchInput, 'input', event => { query = event.target.value.toLowerCase(); draw(); });
  listen(addLinkSelect, 'change', event => {
    if (!event.target.value) return;
    toggleLink(event.target.value);
    addLinkSelect.focus({ preventScroll: true });
  });
  listen(canvas, 'wheel', event => {
    if (!svg) return;
    event.preventDefault();
    const units = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 470 : 1;
    zoomAt(camera.zoom * Math.exp(-event.deltaY * units * (event.ctrlKey ? .008 : .002)), localPoint(event.clientX, event.clientY));
  }, { passive: false });
  listen(canvas, 'pointerdown', event => {
    if (!svg || event.button !== 0 || pointers.size >= 2) return;
    if (!pointers.size) suppressClick = false;
    const node = event.target.closest('.graph-node');
    const target = node || svg;
    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY, target });
    target.setPointerCapture(event.pointerId);
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()];
      const midpoint = localPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      gesture = { kind: 'pinch', distance: Math.max(1, Math.hypot(a.x - b.x, a.y - b.y)), zoom: camera.zoom, anchor: { x: (midpoint.x - camera.x) / camera.zoom, y: (midpoint.y - camera.y) / camera.zoom }, moved: true };
      suppressClick = true;
    } else {
      const start = localPoint(event.clientX, event.clientY);
      const index = node ? Number(node.dataset.graphNode) : null;
      gesture = { kind: node ? 'node' : 'pan', pointerId: event.pointerId, start, clientX: event.clientX, clientY: event.clientY, index, origin: node ? { ...positions[index] } : { ...camera }, moved: false };
    }
    canvas.classList.add('is-dragging');
  });
  listen(canvas, 'pointermove', event => {
    if (!gesture || !pointers.has(event.pointerId)) return;
    const pointer = pointers.get(event.pointerId);
    pointer.x = event.clientX; pointer.y = event.clientY;
    if (gesture.kind === 'pinch') {
      const [a, b] = [...pointers.values()];
      if (!b) return;
      const midpoint = localPoint((a.x + b.x) / 2, (a.y + b.y) / 2);
      camera.zoom = clamp(gesture.zoom * Math.hypot(a.x - b.x, a.y - b.y) / gesture.distance, .35, 3.5);
      camera.x = midpoint.x - gesture.anchor.x * camera.zoom;
      camera.y = midpoint.y - gesture.anchor.y * camera.zoom;
      paintCamera();
      return;
    }
    if (gesture.pointerId !== event.pointerId) return;
    if (Math.hypot(event.clientX - gesture.clientX, event.clientY - gesture.clientY) > 5) gesture.moved = true;
    if (!gesture.moved) return;
    const point = localPoint(event.clientX, event.clientY);
    if (gesture.kind === 'node') {
      const position = positions[gesture.index];
      position.x = clamp(gesture.origin.x + (point.x - gesture.start.x) / camera.zoom, 25, 675);
      position.y = clamp(gesture.origin.y + (point.y - gesture.start.y) / camera.zoom, 45, 425);
      position.vx = 0; position.vy = 0;
      paintPositions();
      settle(true);
    } else {
      camera.x = gesture.origin.x + point.x - gesture.start.x;
      camera.y = gesture.origin.y + point.y - gesture.start.y;
      paintCamera();
    }
  });
  function endPointer(event) {
    const pointer = pointers.get(event.pointerId);
    if (!pointer) return;
    const dragged = gesture?.kind === 'node' && gesture.moved;
    suppressClick ||= Boolean(gesture?.moved) || event.type !== 'pointerup';
    pointers.delete(event.pointerId);
    if (pointer.target.hasPointerCapture?.(event.pointerId)) pointer.target.releasePointerCapture(event.pointerId);
    if (pointers.size) {
      const [id, remaining] = [...pointers.entries()][0];
      gesture = { kind: 'pan', pointerId: id, start: localPoint(remaining.x, remaining.y), clientX: remaining.x, clientY: remaining.y, origin: { ...camera }, moved: true };
    } else {
      gesture = null;
      canvas.classList.remove('is-dragging');
      if (dragged) settle(true);
    }
  }
  listen(canvas, 'pointerup', endPointer);
  listen(canvas, 'pointercancel', endPointer);
  listen(canvas, 'lostpointercapture', endPointer);
  listen(reducedMotion, 'change', () => {
    updateMotionControl();
    if (reducedMotion.matches) stopMotion();
    else startMotion();
  });
  listen(container.ownerDocument, 'visibilitychange', () => {
    stopMotion();
    if (!container.ownerDocument.hidden) startMotion();
  });
  listen(view, 'resize', positionInspector);
  updateMotionControl();
  draw(true);
  if (options.focus && ['note', 'folder'].includes(options.focus.kind) && typeof options.focus.id === 'string') {
    const index = graph.nodes.findIndex(node => node.id === options.focus.id && (mode === 'folders' ? 'folder' : 'note') === options.focus.kind);
    selectionOrigin = list.querySelector(`[data-graph-node="${index}"]`) || [...(navigationMenu?.querySelectorAll('[data-graph-inspect-folder]') || [])].find(element => options.focus.kind === 'folder' && element.dataset.graphInspectFolder === options.focus.id) || null;
    inspectNode(options.focus.kind, options.focus.id);
  }
  return () => {
    disposed = true;
    stopMotion();
    releasePointers();
    for (const remove of removers) remove();
    navigationMenu?.remove();
  };
}
