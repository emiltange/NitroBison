export function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
}

function pathParts(path) {
  const parts = [];
  for (const part of path.split('/')) {
    if (part === '..') parts.pop();
    else if (part && part !== '.') parts.push(part);
  }
  return parts.join('/');
}

export function resolveNoteLink(target, notes, fromNote = {}) {
  let value;
  try { value = decodeURIComponent(String(target).split('|')[0].split('#')[0]).trim(); } catch { return null; }
  if (!value || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(value)) return null;
  const relative = value.startsWith('.') || (/\.md$/i.test(value) && !value.startsWith('/'));
  value = value.replace(/\.md$/i, '');
  const active = notes.filter(note => !note.deleted);
  const canonical = path => path.toLocaleLowerCase();
  if (!relative && !value.includes('/')) {
    const matches = active.filter(note => canonical(note.title) === canonical(value));
    return matches.find(note => (note.folder || '') === (fromNote.folder || '')) || (matches.length === 1 ? matches[0] : null);
  }
  const path = pathParts(relative ? `${fromNote.folder || ''}/${value}` : value);
  return active.find(note => canonical(pathParts(`${note.folder || ''}/${note.title}`)) === canonical(path)) || null;
}

export function safeResource(value, image = false) {
  if (image) return null; // Markdown never initiates a network request just by being opened.
  const url = String(value || '').trim();
  if (!url || /[\u0000-\u0020\u007f\\]/.test(url) || url.startsWith('//')) return null;
  const scheme = url.match(/^([a-z][a-z\d+.-]*):/i)?.[1]?.toLowerCase();
  return !scheme || ['http', 'https', 'mailto'].includes(scheme) ? url : null;
}

function withoutCode(content) {
  let fence = null;
  return String(content).split('\n').map(line => {
    const marker = line.match(/^\s{0,3}(`{3,}|~{3,})/);
    if (marker) {
      if (!fence) fence = { character: marker[1][0], length: marker[1].length };
      else if (marker[1][0] === fence.character && marker[1].length >= fence.length) fence = null;
      return '';
    }
    return fence || /^(?: {4}|\t)/.test(line) ? '' : line.replace(/(`+)[\s\S]*?\1/g, '');
  }).join('\n');
}

export function extractNoteTargets(content) {
  const text = withoutCode(content);
  const targets = [];
  const expression = /\[\[([^\]\n]+)\]\]|(?<!!)\[(?:\\.|[^\]\\\n])*\]\(<?([^\s)>]+)>?(?:\s+"[^"]*")?\)/g;
  for (const match of text.matchAll(expression)) {
    if (match[1]) targets.push(match[1]);
    else if (/\.md(?:#.*)?$/i.test(match[2])) targets.push(match[2]);
  }
  return targets;
}

export function withNoteLink(note, target, notes) {
  if (!target || target.deleted || target.id === note.id || !notes.some(item => item.id === target.id && !item.deleted)) throw new Error('Choose a different existing note.');
  if (extractNoteTargets(note.content).some(value => resolveNoteLink(value, notes, note)?.id === target.id)) return note.content;
  const path = [...target.folder.split('/').filter(Boolean), target.title].map(part => encodeURIComponent(part).replace(/[()]/g, character => `%${character.charCodeAt(0).toString(16).toUpperCase()}`)).join('/');
  const label = target.title.replace(/[\\[\]]/g, '\\$&');
  return `${note.content}${note.content ? '\n\n' : ''}[${label}](/${path}.md)\n`;
}

export function extractTags(content) {
  const text = withoutCode(content).replace(/!?\[(?:\\.|[^\]\\\n])*\]\([^\n)]*\)/g, '').replace(/https?:\/\/\S+/gi, '');
  return [...new Set([...text.matchAll(/(?:^|[\s(])#([\p{L}\p{N}_-]+(?:\/[\p{L}\p{N}_-]+)*)/gu)].map(match => match[1].toLocaleLowerCase()).filter(tag => !/^\d+$/.test(tag)))];
}

export function headingSlug(text, counts = new Map()) {
  const base = text.toLowerCase().replace(/<[^>]*>/g, '').replace(/[^\p{L}\p{N}\s-]/gu, '').trim().replace(/\s+/g, '-') || 'section';
  const count = (counts.get(base) || 0) + 1;
  counts.set(base, count);
  return count === 1 ? base : `${base}-${count}`;
}

export function extractOutline(content) {
  const counts = new Map();
  const outline = [];
  for (const line of withoutCode(content).split('\n')) {
    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (!heading) continue;
    const text = heading[2].replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[*_~`]/g, '');
    outline.push({ text, level: heading[1].length, id: headingSlug(text, counts) });
  }
  return outline;
}
