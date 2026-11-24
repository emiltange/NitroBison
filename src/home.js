import { escapeHtml as html } from './markdown-model.js';
import { favoriteFolders, projectContains, projectOverview, recentProjects, storageOverview } from './projects.js';

const stateLabels = {
  unconfigured: 'Not configured',
  configured: 'Configured · reconnect',
  connected: 'Connected this session',
  offline: 'Offline',
  'folder-connected': 'Folder connected',
  'folder-error': 'Folder save failed',
  'folder-selected': 'Folder selected · enable saving',
  'folder-pending': 'Saving folder…',
};

const providerLogos = { google: '/google-drive.svg', onedrive: '/onedrive.svg' };

export function renderHome(container, { snapshot, online, configuredProvider, connection, folderConnections = [], readonly, bookmarks, icon, folderPreferences = {} }) {
  const allProjects = projectOverview(snapshot);
  const projects = recentProjects(allProjects);
  const favorites = favoriteFolders(snapshot, bookmarks);
  const storage = storageOverview({ online, configuredProvider, connection, folderConnections });
  const noteCount = allProjects.reduce((total, project) => total + project.noteCount, 0);
  const badges = storage.filter(item => item.projectBadge).map(item => `<span class="fb-pill">${html(item.projectBadge)}</span>`).join('');
  const connected = storage.find(item => item.state === 'connected' && ['google', 'onedrive'].includes(item.id));
  const storageSummary = connected ? `${connected.label} · explicit sync` : connection?.connected && !online ? 'Cloud offline · local notes available' : folderConnections.some(link => link.status === 'connected') ? 'Linked Markdown folders' : 'On this device · cloud optional';
  const dateFormat = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  const cards = projects.map((project, index) => {
    const documentNote = project.overviewNote || project.latestNote;
    const saved = bookmarks.includes(project.folder);
    const size = index === 0 ? 'featured' : index < 3 ? 'medium' : 'small';
    const preference = folderPreferences[project.folder] || {};
    const banner = Object.hasOwn(preference, 'banner') ? preference.banner : project.banner;
    const linkedFolders = folderConnections.filter(link => projectContains({ folder: link.folder }, project.folder) || projectContains({ folder: project.folder }, link.folder));
    return `<article class="fb-card passport-project-wrap passport-project-wrap--${size}">
      <button class="fb-card-link passport-project" data-project="${html(project.folder)}">
        <span class="passport-project-cover${banner ? ' has-banner' : ''}" aria-hidden="true">${banner ? `<img class="passport-project-banner" src="${html(banner)}" alt="" />` : `<span class="passport-document">
          <span class="passport-document-path">${html(documentNote?.folder || project.folder || 'Vault root')}</span>
          <span class="passport-document-title">${html(documentNote?.title || project.title)}</span>
          <span class="passport-document-preview">${html(project.description)}</span>
          <span class="passport-document-file">${documentNote ? `${html(documentNote.title)}.md` : 'Your next document starts here'}</span>
        </span>`}</span>
        <span class="passport-project-content">
          <span class="passport-project-top"><span class="passport-project-folder"><span class="sr-only">Open project </span>${icon(project.folder ? 'folder' : 'book')}${html(project.title)}</span>${project.sample ? '<span class="fb-pill passport-sample">Sample</span>' : ''}</span>
          <span class="passport-project-title">${html(project.overviewNote ? project.title : documentNote?.title || project.title)}</span>
          <span class="passport-project-description">${html(project.description)}</span>
          <span class="passport-project-location">${preference.directory ? `${preference.directorySync ? 'Markdown folder' : 'Selected folder'} · ${html(preference.directory)}` : html(documentNote?.folder || project.folder || 'Vault root')}</span>
          <span class="passport-project-meta">${project.noteCount} ${project.noteCount === 1 ? 'note' : 'notes'}${project.updatedAt ? ` · Updated <time datetime="${new Date(project.updatedAt).toISOString()}">${html(dateFormat.format(project.updatedAt))}</time>` : ' · Ready for your first idea'} <span aria-hidden="true">→</span></span>
          <span class="passport-project-badges">${badges}${linkedFolders.slice(0, 3).map(link => `<span class="fb-pill ${link.status === 'connected' ? 'fb-pill--ok' : 'fb-pill--waiting'}">${html(link.status === 'connected' ? 'Folder connected' : link.status === 'error' ? 'Folder save failed' : link.status === 'selected' ? 'Enable Markdown saving' : 'Saving folder…')}${link.provider === 'google' && link.accountType === 'business' ? ' · EA' : ''}</span>`).join('')}${linkedFolders.length > 3 ? `<span class="fb-meta">+${linkedFolders.length - 3} in Graph</span>` : ''}</span>
        </span>
      </button>
      <button class="fb-icon-btn passport-bookmark" data-bookmark="${html(project.folder)}" aria-pressed="${saved}" aria-label="${saved ? 'Remove' : 'Add'} ${html(project.title)} ${saved ? 'from' : 'to'} favorite folders" title="${saved ? 'Remove from' : 'Add to'} favorite folders">${icon('star')}</button>
    </article>`;
  }).join('');
  container.innerHTML = `
    <div class="passport-overview">
      <section class="passport-hero fb-card" aria-labelledby="home-title">
        <div class="passport-intro"><img class="passport-mascot" src="/logo.png" alt="NitroBison mascot, a running cow carrying a notebook" width="130" height="130" /><div><h1 id="home-title">Good ideas.<br />Room to roam.</h1><p>Your notes, projects and connected ideas, all in one place. Write in Markdown, follow a thought, and keep your knowledge yours.</p><button class="fb-btn fb-btn--secondary" data-action="all-notes">${icon('notes')}Browse your notes →</button></div></div>
        <dl class="passport-facts"><div><dt>Projects</dt><dd>${allProjects.length}</dd></div><div><dt>Notes</dt><dd>${noteCount}</dd></div><div class="passport-storage-fact"><dt>Where your ideas live</dt><dd>${html(storageSummary)}</dd><span>Nothing syncs until you choose.</span></div></dl>
      </section>
      <aside class="passport-drives" aria-labelledby="drives-title">
        <div class="fb-section-head"><div><h2 id="drives-title" class="fb-heading">Your storage & drives</h2><p class="fb-subtitle">Real connections. Clear boundaries.</p></div></div>
        <div class="passport-drive-list">${storage.map(item => `<button class="fb-card-link passport-drive" data-action="settings" ${providerLogos[item.id] ? `data-provider="${html(item.id)}"` : ''}><span class="passport-drive-heading">${providerLogos[item.id] ? `<img class="provider-logo" src="${providerLogos[item.id]}" alt="" width="24" height="24" />` : icon('device')}<span>${html(item.label)}</span></span><span class="fb-pill ${['connected', 'folder-connected'].includes(item.state) ? 'fb-pill--ok' : item.state !== 'unconfigured' && item.state !== 'available' ? 'fb-pill--waiting' : ''}">${html(item.state === 'available' ? 'On this device' : stateLabels[item.state] || item.state)}</span><span class="passport-drive-detail">${html(item.detail)}</span>${item.folderReferences.slice(0, 3).map(path => `<span class="passport-drive-scope local-path">${html(path)}</span>`).join('')}${item.folderReferences.length > 3 ? `<span class="passport-drive-scope">+${item.folderReferences.length - 3} more · see Graph</span>` : ''}<span class="passport-drive-scope">${html(item.scope)}</span><span class="passport-drive-action">${item.id === 'local' ? 'Storage & backups' : 'Manage connection'} →</span></button>`).join('')}</div>
        ${folderConnections.length ? `<button class="fb-btn fb-btn--secondary passport-linked-folders" data-action="linked-folders">${icon('graph')}All linked folders in Graph · ${folderConnections.length}</button>` : ''}
        <p class="passport-drive-footnote">OAuth sync covers the whole vault and needs this session's sign-in. Linked desktop folders save Markdown separately; your provider's desktop client handles uploads. A folder connection is not proof of cloud sign-in or a completed upload.</p>
      </aside>
    </div>
    <section class="passport-favorites" aria-labelledby="favorite-folders-title">
      <h2 id="favorite-folders-title" class="fb-eyebrow">Favorite folders</h2>
      ${favorites.length ? `<p class="sr-only" id="favorite-folders-help">Use the left and right arrow keys to browse favorite folders. More favorites are available by scrolling.</p><ul class="passport-favorite-list" tabindex="0" aria-labelledby="favorite-folders-title" aria-describedby="favorite-folders-help">${favorites.map(folder => `<li><button class="fb-chip passport-favorite" data-project="${html(folder.folder)}" title="${html(folder.title)}">${html(folder.title)}</button></li>`).join('')}</ul>` : '<p class="passport-favorites-empty">Star a folder to keep it close. Favorites stay in this browser, just for you.</p>'}
    </section>
    <section class="passport-projects" aria-labelledby="projects-title">
      <div class="fb-section-head"><div><h2 id="projects-title" class="fb-heading">Your projects <span class="fb-meta">${allProjects.length}</span></h2><p class="fb-subtitle">The latest six projects, introduced by their README when available.</p></div><button class="fb-btn fb-btn--primary" data-action="new-project" ${readonly ? 'disabled' : ''}>${icon('plus')}New project</button></div>
      <p class="passport-section-note">Projects are your top-level folders, including their subfolders. Open all notes to see every project.</p>
      <div class="passport-project-grid">${cards || `<div class="fb-state passport-empty"><b>No projects yet.</b><p>Create a project to give related notes a home, or start a note in your vault.</p><button class="fb-btn fb-btn--secondary" data-action="new-note" ${readonly ? 'disabled' : ''}>Create a note</button></div>`}</div>
    </section>`;
  const favoriteList = container.querySelector('.passport-favorite-list');
  if (favoriteList) {
    const buttons = [...favoriteList.querySelectorAll('button')];
    favoriteList.addEventListener('keydown', event => {
      if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const current = buttons.indexOf(document.activeElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : Math.max(0, Math.min(buttons.length - 1, current + (event.key === 'ArrowRight' ? 1 : -1)));
      event.preventDefault();
      buttons[next].focus();
    });
  }
}
