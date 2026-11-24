import { Marked } from 'marked';
import DOMPurify from 'dompurify';
import { escapeHtml, headingSlug, resolveNoteLink, safeResource } from './markdown-model.js';
import { propertiesBody } from './collections.js';
import { hydrateListDatabases } from './list-database.js';

let diagramSequence = 0;
let mermaidModule;
let diagramQueue = Promise.resolve();

export function markdownHtml(content, notes = [], fromNote = {}, bodyOnly = false) {
  const headingCounts = new Map();
  let listBlockIndex = 0;
  const markdown = new Marked({
    gfm: true,
    breaks: false,
    renderer: {
      html({ text }) { return escapeHtml(text); },
      heading({ tokens, depth, text }) {
        const plain = text.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_~`]/g, '');
        return `<h${depth} id="${escapeHtml(headingSlug(plain, headingCounts))}">${this.parser.parseInline(tokens)}</h${depth}>`;
      },
      link({ href, tokens }) {
        const label = this.parser.parseInline(tokens);
        const note = resolveNoteLink(href, notes, fromNote);
        if (note) return `<a href="#note=${encodeURIComponent(note.id)}" data-note="${escapeHtml(note.id)}" class="wiki-link">${label}</a>`;
        const safe = safeResource(href);
        if (!safe) return label;
        if (/\.md(?:#.*)?$/i.test(href)) return `<span class="missing-link" title="This note is not in the vault">${label}</span>`;
        return `<a href="${escapeHtml(safe)}"${/^https?:/i.test(safe) ? ' target="_blank" rel="noopener noreferrer"' : ''}>${label}</a>`;
      },
      image({ text }) { return `<span class="blocked-image" title="Images are blocked to prevent tracking">Image: ${escapeHtml(text || 'untitled')} · blocked for privacy</span>`; },
      code({ text, lang }) {
        if (['nitrobison-list', 'list-database'].includes(lang?.trim().toLowerCase())) return `<div class="list-db-block" data-list-db-index="${listBlockIndex++}"><pre class="list-db-source">${escapeHtml(text)}</pre></div>`;
        if (lang?.trim().toLowerCase() === 'mermaid') return `<div class="mermaid-block"><pre class="mermaid-source">${escapeHtml(text)}</pre></div>`;
        return `<pre><code>${escapeHtml(text)}</code></pre>`;
      },
    },
    extensions: [{
      name: 'wikilink',
      level: 'inline',
      start(source) { return source.indexOf('[['); },
      tokenizer(source) {
        const match = /^\[\[([^\]\n]+)\]\]/.exec(source);
        if (match) return { type: 'wikilink', raw: match[0], target: match[1] };
      },
      renderer(token) {
        const [target, alias] = token.target.split('|');
        const note = resolveNoteLink(target, notes, fromNote);
        const label = escapeHtml(alias || target);
        return note ? `<a class="wiki-link" href="#note=${encodeURIComponent(note.id)}" data-note="${escapeHtml(note.id)}">${label}</a>` : `<span class="missing-link" title="This note is not in the vault">${label}</span>`;
      },
    }],
  });
  return DOMPurify.sanitize(markdown.parse(bodyOnly ? String(content) : propertiesBody(String(content))), {
    USE_PROFILES: { html: true },
    FORBID_TAGS: ['style', 'iframe', 'object', 'form', 'video', 'audio', 'source', 'img'],
    FORBID_ATTR: ['style', 'src', 'srcset'],
  });
}

export function renderMarkdown(container, content, notes = [], fromNote = {}, bodyOnly = false, options = {}) {
  container.innerHTML = markdownHtml(content, notes, fromNote, bodyOnly);
  hydrateListDatabases(container, { notes, fromNote, ...options });
  for (const block of container.querySelectorAll('.mermaid-block')) {
    const source = block.textContent;
    const id = `herd-diagram-${++diagramSequence}`;
    diagramQueue = diagramQueue.catch(() => {}).then(async () => {
      if (!block.isConnected) return;
      try {
        // Untrusted diagram text cannot configure Mermaid or request external resources.
        if (/(?:%%\{|^\s*---|https?:|data:|file:|<|@import|url\s*\(|\b(?:image|img)\s*:)/im.test(source)) throw new Error('External resources, HTML and diagram configuration are disabled.');
        mermaidModule ||= import('mermaid');
        const { default: mermaid } = await mermaidModule;
        const dark = document.documentElement.dataset.theme === 'dark';
        mermaid.initialize({ startOnLoad: false, securityLevel: 'strict', htmlLabels: false, theme: dark ? 'dark' : 'neutral', flowchart: { htmlLabels: false }, suppressErrorRendering: true, maxTextSize: 50000, maxEdges: 500 });
        const { svg } = await mermaid.render(id, source);
        if (!block.isConnected) return;
        block.innerHTML = DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true, svgFilters: true }, FORBID_TAGS: ['foreignObject', 'image', 'a', 'script'], FORBID_ATTR: ['href', 'xlink:href'] });
        block.setAttribute('role', 'img');
        block.setAttribute('aria-label', 'Mermaid diagram');
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent = 'Diagram source';
        const pre = document.createElement('pre');
        pre.textContent = source;
        details.append(summary, pre);
        block.append(details);
      } catch (error) {
        document.getElementById(`d${id}`)?.remove();
        if (!block.isConnected) return;
        const message = document.createElement('p');
        message.className = 'fb-error';
        message.textContent = `Diagram could not be rendered. ${error.message?.split('\n')[0] || 'Check the Mermaid syntax.'}`;
        block.prepend(message);
      }
    });
  }
}
