import { serializeListDatabaseBlock } from './list-database.js';

export const SLASH_COMMANDS = [
  { id: 'text', label: 'Text', aliases: ['text'], description: 'Plain paragraph', category: 'Write', icon: 'T' },
  { id: 'h1', label: 'Header', aliases: ['header', 'h1'], description: 'Heading 1', category: 'Write', icon: 'H1' },
  { id: 'h2', label: 'Sub-header', aliases: ['subheader', 'sub-header', 'h2'], description: 'Heading 2', category: 'Write', icon: 'H2' },
  { id: 'h3', label: 'Small header', aliases: ['h3'], description: 'Heading 3', category: 'Write', icon: 'H3' },
  { id: 'todo', label: 'To-do checklist', aliases: ['todo', 'check'], description: 'Track a task with a checkbox', category: 'Write', icon: '☑' },
  { id: 'bullet', label: 'Bulleted list', aliases: ['bullet', 'ul'], description: 'An unordered list item', category: 'Write', icon: '•' },
  { id: 'numbered', label: 'Numbered list', aliases: ['number', 'ol'], description: 'An ordered list item', category: 'Write', icon: '1.' },
  { id: 'table', label: 'Table', aliases: ['table'], description: 'An editable Markdown table', category: 'Build', icon: '⊞' },
  { id: 'sheet', label: 'Sheet', aliases: ['sheet', 'grid'], description: 'A spreadsheet grid with numeric column sums', category: 'Build', icon: '▦' },
  { id: 'graph', label: 'Graph / Diagram', aliases: ['graph', 'diagram', 'mermaid'], description: 'Flowchart, sequence, mindmap or pie chart', category: 'Build', icon: '◇' },
  { id: 'list', label: 'Task sheet / List database', aliases: ['list', 'tasks', 'database'], description: 'A live task list database of workspace pages', category: 'Build', icon: '☷' },
  { id: 'callout', label: 'Callout / Quote', aliases: ['callout', 'quote'], description: 'Highlight a note or quotation', category: 'Write', icon: '❝' },
  { id: 'code', label: 'Code block', aliases: ['code'], description: 'Fenced source code with a language', category: 'Build', icon: '</>' },
  { id: 'divider', label: 'Divider', aliases: ['divider', 'hr'], description: 'A horizontal rule', category: 'Organize', icon: '—' },
  { id: 'link', label: 'Link page', aliases: ['link', 'page'], description: 'Link an existing workspace note', category: 'Organize', icon: '↗' },
];

export function filterSlashCommands(query = '') {
  const term = String(query).trim().replace(/^\//, '').trim().toLowerCase();
  return SLASH_COMMANDS.filter(command => [command.id, command.label, command.description, ...command.aliases].some(value => value.toLowerCase().includes(term)));
}

function pipeCells(line) {
  const cells = [];
  let value = '';
  const source = line.trim();
  for (let i = 0; i < source.length; i++) {
    const character = source[i];
    if (character === '\\' && ['|', '\\'].includes(source[i + 1])) value += source[++i];
    else if (character === '|') { cells.push(value.trim()); value = ''; }
    else value += character;
  }
  cells.push(value.trim());
  if (source.startsWith('|')) cells.shift();
  if (source.endsWith('|') && !/(?:^|[^\\])(?:\\\\)*\\\|$/.test(source)) cells.pop();
  return cells;
}

const tableDelimiter = line => {
  const cells = pipeCells(line);
  return cells.length > 0 && cells.every(cell => /^:?-{3,}:?$/.test(cell));
};

export function parsePipeTable(markdown) {
  const lines = String(markdown).trim().split(/\r\n|\n|\r/);
  if (!lines[0]) return [];
  const rows = lines.filter((line, index) => index !== 1 || !tableDelimiter(line)).map(pipeCells);
  const width = Math.max(...rows.map(row => row.length));
  return rows.map(row => Array.from({ length: width }, (_, index) => row[index] ?? ''));
}

export function serializePipeTable(rows) {
  if (!rows.length) return '';
  const width = Math.max(1, ...rows.map(row => row.length));
  const line = row => `| ${Array.from({ length: width }, (_, index) => String(row[index] ?? '').replace(/\\/g, '\\\\').replace(/\|/g, '\\|').replace(/\r?\n|\r/g, '<br>')).join(' | ')} |`;
  return [line(rows[0]), line(Array(width).fill('---')), ...rows.slice(1).map(line)].join('\n');
}

export function computeSheetTotals(rows) {
  const width = Math.max(0, ...rows.map(row => row.length));
  return Array.from({ length: width }, (_, column) => {
    let total = 0;
    let count = 0;
    for (const row of rows.slice(1)) {
      const value = String(row[column] ?? '').trim();
      if (/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value) && Number.isFinite(Number(value))) { total += Number(value); count++; }
    }
    return count ? total : null;
  });
}

const blockSignature = block => JSON.stringify([block.type, block.text, block.checked, block.language, block.rows, block.marker]);
const fenceOpening = line => /^ {0,3}(`{3,}|~{3,})([^\r\n]*)$/.exec(line);
const itemOpening = line => /^( {0,3})([-+*]|\d+[.)])\s+(?:\[([ xX])\](?:[ \t]+|$))?(.*)$/.exec(line);

function simpleBlock(line) {
  const heading = /^(#{1,3})[ \t]+(.*)$/.exec(line);
  if (heading) return { type: `h${heading[1].length}`, text: heading[2] };
  if (/^ {0,3}---[ \t]*$/.test(line)) return { type: 'divider', text: '' };
  const item = itemOpening(line);
  if (item) return { type: item[3] !== undefined ? 'todo' : /^\d/.test(item[2]) ? 'numbered' : 'bullet', text: item[4], checked: item[3]?.toLowerCase() === 'x', marker: `${item[1]}${item[2]}` };
  if (/^> ?/.test(line)) return { type: 'callout', text: line.replace(/^> ?/, '') };
  if (/^\[\[[^\]\n]+\]\]$/.test(line)) return { type: 'link', text: line.slice(2, -2) };
  return null;
}

export function parseMarkdownBlocks(markdown = '') {
  const source = String(markdown);
  const lines = [];
  const expression = /([^\r\n]*)(\r\n|\n|\r|$)/g;
  let match;
  while ((match = expression.exec(source)) && match[0]) lines.push({ text: match[1], start: match.index, end: match.index + match[1].length, eol: match[2] });
  const blocks = [];
  let previousEnd = 0;
  for (let i = 0; i < lines.length;) {
    if (!lines[i].text.trim()) { i++; continue; }
    const start = i;
    const opening = fenceOpening(lines[i].text);
    let block;
    if (opening) {
      const language = opening[2].trim();
      const closing = new RegExp(`^ {0,3}${opening[1][0]}{${opening[1].length},}[ \\t]*$`);
      i++;
      const contentStart = i;
      while (i < lines.length && !closing.test(lines[i].text)) i++;
      const contentEnd = i;
      if (i < lines.length) i++;
      block = { type: language.toLowerCase() === 'mermaid' ? 'graph' : ['nitrobison-list', 'list-database'].includes(language.toLowerCase()) ? 'list' : 'code', language, text: lines.slice(contentStart, contentEnd).map(line => line.text).join('\n') };
    } else if (i + 1 < lines.length && lines[i].text.includes('|') && tableDelimiter(lines[i + 1].text)) {
      i += 2;
      while (i < lines.length && lines[i].text.trim() && lines[i].text.includes('|')) i++;
      const rows = parsePipeTable(lines.slice(start, i).map(line => line.text).join('\n'));
      block = { type: rows[0]?.join('|') === 'Item|Value|Formula / Notes' ? 'sheet' : 'table', rows };
    } else {
      block = simpleBlock(lines[i].text) || { type: 'text', text: lines[i].text };
      i++;
      if (block.type === 'callout') {
        while (i < lines.length && /^> ?/.test(lines[i].text)) block.text += `\n${lines[i++].text.replace(/^> ?/, '')}`;
      } else if (['todo', 'bullet', 'numbered'].includes(block.type)) {
        while (i < lines.length && /^(?: {2,}|\t)\S/.test(lines[i].text)) block.text += `\n${lines[i++].text}`;
      } else if (block.type === 'text') {
        while (i < lines.length && lines[i].text.trim() && !simpleBlock(lines[i].text) && !fenceOpening(lines[i].text) && !(i + 1 < lines.length && lines[i].text.includes('|') && tableDelimiter(lines[i + 1].text))) block.text += `\n${lines[i++].text}`;
      }
    }
    const end = lines[i - 1].end;
    block.before = source.slice(previousEnd, lines[start].start);
    block.raw = source.slice(lines[start].start, end);
    block.eol = lines[start].eol || '\n';
    block.original = blockSignature(block);
    blocks.push(block);
    previousEnd = end;
  }
  if (!blocks.length) {
    const block = { type: 'text', text: '', before: source, raw: '' };
    block.original = blockSignature(block);
    blocks.push(block);
  } else blocks.at(-1).after = source.slice(previousEnd);
  return blocks;
}

function blockMarkdown(block) {
  if (block.raw !== undefined && block.original === blockSignature(block)) return block.raw;
  const text = block.text ?? '';
  let markdown;
  if (/^h[123]$/.test(block.type)) markdown = `${'#'.repeat(Number(block.type[1]))} ${text}`;
  else if (block.type === 'todo') markdown = `${block.marker || '-'} [${block.checked ? 'x' : ' '}] ${text}`;
  else if (block.type === 'bullet') markdown = `${block.marker || '-'} ${text}`;
  else if (block.type === 'numbered') markdown = `${block.marker || '1.'} ${text}`;
  else if (block.type === 'callout') markdown = text.split('\n').map(line => `> ${line}`).join('\n');
  else if (['table', 'sheet'].includes(block.type)) markdown = serializePipeTable(block.rows || [['', ''], ['', '']]);
  else if (['graph', 'list', 'code'].includes(block.type)) {
    const language = block.type === 'graph' ? 'mermaid' : block.type === 'list' ? 'nitrobison-list' : String(block.language || '').replace(/[\r\n`]/g, '');
    const runs = text.match(/`{3,}/g) || [];
    const fence = '`'.repeat(Math.max(3, ...runs.map(run => run.length + 1)));
    markdown = `${fence}${language}\n${text}\n${fence}`;
  } else if (block.type === 'divider') markdown = '---';
  else if (block.type === 'link') markdown = `[[${text}]]`;
  else markdown = text;
  return block.eol && block.eol !== '\n' ? markdown.replace(/\n/g, block.eol) : markdown;
}

export function serializeMarkdownBlocks(blocks) {
  return blocks.map((block, index) => `${block.before ?? (index ? '\n\n' : '')}${blockMarkdown(block)}`).join('') + (blocks.at(-1)?.after || '');
}

const GRAPH_TEMPLATES = {
  Flowchart: 'flowchart TD\n  A[Start] --> B{Decision}\n  B -->|Yes| C[Done]\n  B -->|No| A',
  Sequence: 'sequenceDiagram\n  participant A as You\n  participant B as Team\n  A->>B: Share an idea\n  B-->>A: Make it happen',
  Mindmap: 'mindmap\n  root((Idea))\n    Plan\n      Research\n      Design\n    Build\n    Share',
  'Pie chart': 'pie title Time well spent\n  "Creating" : 60\n  "Learning" : 25\n  "Planning" : 15',
};
let rendererPromise;
let instanceSequence = 0;

export function mountModernWrite(container, options = {}) {
  const document = container.ownerDocument;
  const window = document.defaultView;
  const instance = ++instanceSequence;
  let settings = { body: '', readOnly: false, notes: [], fromNote: {}, markdownOptions: {}, ...options };
  let currentBody = String(settings.body ?? '');
  let blocks = parseMarkdownBlocks(currentBody);
  let destroyed = false;
  let menuState = null;
  const views = new Map();
  const previewTimers = new Set();
  const pane = element('div', 'modern-write-pane');
  pane.setAttribute('aria-label', 'Modern write editor');
  const canvas = element('div', 'modern-write-canvas');
  const menu = element('div', 'modern-write-menu');
  menu.id = `modern-write-menu-${instance}`;
  menu.setAttribute('role', 'listbox');
  menu.setAttribute('aria-label', 'Insert a block');
  menu.hidden = true;
  pane.append(canvas, menu);
  container.replaceChildren(pane);

  function element(tag, className = '', text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function button(label, action, className = 'modern-write-action') {
    const node = element('button', className, label);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }

  function emit() {
    currentBody = serializeMarkdownBlocks(blocks);
    settings.onChange?.(currentBody);
  }

  function autosize(input) {
    input.style.height = 'auto';
    input.style.height = `${Math.max(input.scrollHeight, 24)}px`;
  }

  function focusBlock(block, end = false) {
    const input = views.get(block)?.content.querySelector('textarea, input:not([type="checkbox"]), select, button');
    input?.focus();
    if (input?.setSelectionRange && ['textarea', 'input'].includes(input.localName)) {
      const position = end ? input.value.length : 0;
      input.setSelectionRange(position, position);
    }
  }

  function closeMenu() {
    menuState?.anchor?.removeAttribute('aria-activedescendant');
    menuState?.anchor?.setAttribute('aria-expanded', 'false');
    menuState = null;
    menu.hidden = true;
    menu.replaceChildren();
  }

  function placeMenu() {
    if (!menuState) return;
    const rect = menuState.anchor.getBoundingClientRect();
    const width = Math.min(350, (window?.innerWidth || 800) - 24);
    menu.style.width = `${width}px`;
    menu.style.left = `${Math.max(12, Math.min(rect.left, (window?.innerWidth || 800) - width - 12))}px`;
    const below = (window?.innerHeight || 800) - rect.bottom - 12;
    const above = rect.top - 12;
    const height = Math.min(390, Math.max(below, above));
    menu.style.maxHeight = `${Math.max(100, height)}px`;
    menu.style.top = below >= Math.min(300, above) ? `${rect.bottom + 5}px` : 'auto';
    menu.style.bottom = below >= Math.min(300, above) ? 'auto' : `${(window?.innerHeight || 800) - rect.top + 5}px`;
  }

  function paintMenu() {
    menu.replaceChildren();
    const { commands, selected, anchor } = menuState;
    let category;
    commands.forEach((command, index) => {
      if (category !== command.category) { menu.append(element('div', 'modern-write-menu-category', command.category)); category = command.category; }
      const item = button('', () => applyCommand(menuState.block, command.id), 'modern-write-menu-item');
      item.id = `${menu.id}-${index}`;
      item.setAttribute('role', 'option');
      item.setAttribute('aria-selected', String(index === selected));
      item.tabIndex = -1;
      const symbol = element('span', 'modern-write-command-icon', command.icon);
      symbol.setAttribute('aria-hidden', 'true');
      const label = element('span', 'modern-write-command-label');
      label.append(element('strong', '', command.label), element('small', '', command.description));
      item.append(symbol, label, element('span', 'modern-write-command-hint', `/${command.aliases[0]}`));
      item.addEventListener('pointerdown', event => event.preventDefault());
      menu.append(item);
    });
    if (!commands.length) menu.append(element('p', 'modern-write-menu-empty', 'No matching blocks'));
    if (commands.length) anchor.setAttribute('aria-activedescendant', `${menu.id}-${selected}`);
    else anchor.removeAttribute('aria-activedescendant');
    menu.hidden = false;
    placeMenu();
    menu.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' });
  }

  function openMenu(block, anchor, query = '', range = null) {
    if (settings.readOnly) return;
    closeMenu();
    menuState = { block, anchor, range, commands: filterSlashCommands(query), selected: 0 };
    anchor.setAttribute('aria-controls', menu.id);
    anchor.setAttribute('aria-expanded', 'true');
    paintMenu();
  }

  function newBlockAfter(block, next = { type: 'text', text: '' }) {
    const index = blocks.indexOf(block);
    if (index === blocks.length - 1) { next.after = block.after; delete block.after; }
    next.before = '\n\n';
    blocks.splice(index + 1, 0, next);
    render();
    emit();
    focusBlock(next);
    return next;
  }

  function removeBlock(block) {
    const index = blocks.indexOf(block);
    const previous = blocks[index - 1];
    if (blocks.length === 1) blocks = [{ type: 'text', text: '' }];
    else {
      if (index === blocks.length - 1 && previous) previous.after = block.after;
      blocks.splice(index, 1);
      if (index === 0) blocks[0].before = block.before || '';
    }
    closeMenu();
    render();
    emit();
    focusBlock(previous || blocks[0], true);
  }

  function applyCommand(block, type) {
    const range = menuState?.block === block ? menuState.range : null;
    closeMenu();
    if (settings.readOnly) return;
    if (range) {
      const before = block.text.slice(0, range.start).replace(/\n$/, '');
      const after = block.text.slice(range.end).replace(/^\n/, '');
      if (before) {
        const next = { type: 'text', text: '', before: '\n\n', after: block.after };
        block.text = before;
        delete block.after;
        blocks.splice(blocks.indexOf(block) + 1, 0, next);
        block = next;
      } else block.text = '';
      if (after) {
        blocks.splice(blocks.indexOf(block) + 1, 0, { type: 'text', text: after, before: '\n\n', after: block.after });
        delete block.after;
      }
    }
    if (block.type !== 'text' || (block.text && !/^\/[^\n]*$/.test(block.text))) block = newBlockAfter(block);
    const replacement = { type, text: '', before: block.before, after: block.after, eol: block.eol };
    if (type === 'table') replacement.rows = [['Column 1', 'Column 2'], ['', '']];
    if (type === 'sheet') replacement.rows = [['Item', 'Value', 'Formula / Notes'], ['', '', ''], ['', '', ''], ['', '', '']];
    if (type === 'graph') replacement.text = GRAPH_TEMPLATES.Flowchart;
    if (type === 'list') Object.assign(replacement, { text: parseMarkdownBlocks(serializeListDatabaseBlock())[0].text, language: 'nitrobison-list' });
    if (type === 'callout') replacement.text = '**Note:** ';
    if (type === 'code') replacement.language = 'js';
    if (type === 'todo') replacement.checked = false;
    blocks.splice(blocks.indexOf(block), 1, replacement);
    render();
    emit();
    focusBlock(replacement, type === 'callout');
    if (type === 'divider') newBlockAfter(replacement);
  }

  function blockKeydown(event, block, input) {
    if (settings.readOnly || event.isComposing) return;
    if (menuState?.block === block) {
      if (['ArrowDown', 'ArrowUp'].includes(event.key)) {
        event.preventDefault();
        const count = menuState.commands.length;
        if (count) menuState.selected = (menuState.selected + (event.key === 'ArrowDown' ? 1 : count - 1)) % count;
        paintMenu();
        return;
      }
      if (event.key === 'Escape') { event.preventDefault(); closeMenu(); return; }
      if (event.key === 'Enter' && menuState.commands.length) { event.preventDefault(); applyCommand(block, menuState.commands[menuState.selected].id); return; }
    }
    if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      if (['todo', 'bullet', 'numbered'].includes(block.type) && !input.value) {
        block.type = 'text'; delete block.marker; renderBlock(block); emit(); focusBlock(block); return;
      }
      const start = input.selectionStart;
      const end = input.selectionEnd;
      const trailing = input.value.slice(end);
      block.text = input.value.slice(0, start);
      const type = ['todo', 'bullet', 'numbered'].includes(block.type) ? block.type : 'text';
      const next = { type, text: trailing };
      if (type === 'numbered') next.marker = `${Number((block.marker || '1.').match(/\d+/)?.[0] || 1) + 1}.`;
      newBlockAfter(block, next);
      return;
    }
    if (event.key === 'Backspace' && !input.value) {
      event.preventDefault();
      if (block.type !== 'text') { block.type = 'text'; delete block.marker; renderBlock(block); emit(); focusBlock(block); }
      else removeBlock(block);
    }
    if (['ArrowUp', 'ArrowDown'].includes(event.key) && input.selectionStart === input.selectionEnd) {
      const before = input.value.slice(0, input.selectionStart);
      const after = input.value.slice(input.selectionEnd);
      if ((event.key === 'ArrowUp' && !before.includes('\n')) || (event.key === 'ArrowDown' && !after.includes('\n'))) {
        const next = blocks[blocks.indexOf(block) + (event.key === 'ArrowUp' ? -1 : 1)];
        if (next) { event.preventDefault(); focusBlock(next, event.key === 'ArrowUp'); }
      }
    }
  }

  function textEditor(block, content) {
    if (block.type === 'todo') {
      const checkbox = element('input', 'modern-write-checkbox');
      checkbox.type = 'checkbox'; checkbox.checked = !!block.checked; checkbox.disabled = !!settings.readOnly;
      checkbox.setAttribute('aria-label', 'Complete task');
      checkbox.addEventListener('change', () => { block.checked = checkbox.checked; emit(); });
      content.append(checkbox);
    } else if (['bullet', 'numbered'].includes(block.type)) {
      content.append(element('span', 'modern-write-list-marker', block.type === 'bullet' ? '•' : block.marker || '1.'));
    }
    const input = element('textarea', 'modern-write-text');
    input.value = block.text || '';
    input.rows = 1;
    input.readOnly = !!settings.readOnly;
    input.placeholder = block.type === 'text' ? "Write something, or type '/' for blocks…" : block.type === 'link' ? 'Page title' : SLASH_COMMANDS.find(command => command.id === block.type)?.label || 'Text';
    input.setAttribute('aria-label', SLASH_COMMANDS.find(command => command.id === block.type)?.label || 'Text');
    input.addEventListener('input', event => {
      block.text = input.value;
      autosize(input);
      if (!event.isComposing && block.type === 'bullet' && /^\[([ xX])\] $/.test(input.value)) {
        block.type = 'todo'; block.checked = /^\[[xX]\]/.test(input.value); block.text = '';
        closeMenu(); renderBlock(block); emit(); focusBlock(block); return;
      }
      if (!event.isComposing && block.type === 'text') {
        const shortcut = /^(#{1,3}|- \[ \]|- \[[xX]\]|[-*+]|\d+\.|>) $/.exec(input.value);
        if (shortcut) {
          const token = shortcut[1];
          block.type = token.startsWith('#') ? `h${token.length}` : token.includes('[') ? 'todo' : token === '>' ? 'callout' : /^\d/.test(token) ? 'numbered' : 'bullet';
          block.checked = /\[[xX]\]/.test(token);
          if (block.type === 'numbered') block.marker = token;
          block.text = '';
          closeMenu(); renderBlock(block); emit(); focusBlock(block); return;
        }
        const start = input.value.lastIndexOf('\n', input.selectionStart - 1) + 1;
        const newline = input.value.indexOf('\n', input.selectionStart);
        const end = newline < 0 ? input.value.length : newline;
        const line = input.value.slice(start, end);
        if (/^\/[^\n]*$/.test(line)) openMenu(block, input, line, { start, end });
        else if (menuState?.block === block) closeMenu();
      }
      emit();
    });
    input.addEventListener('keydown', event => blockKeydown(event, block, input));
    content.append(input);
    if (block.type === 'link') {
      const picker = element('select', 'modern-write-page-picker');
      picker.setAttribute('aria-label', 'Choose a workspace page');
      picker.disabled = !!settings.readOnly;
      fillPagePicker(picker);
      picker.addEventListener('blur', () => { if (picker.dataset.refreshPending) fillPagePicker(picker); });
      picker.addEventListener('change', () => {
        const note = settings.notes.find(note => note.id === picker.value);
        if (!note) return;
        const path = `${note.folder ? `${note.folder}/` : '/'}${note.title}`;
        const target = path.split('/').map(part => encodeURIComponent(part)).join('/');
        block.text = target === path ? target : `${target}|${note.title.replace(/[\r\n\]]/g, '')}`;
        input.value = block.text; autosize(input); emit(); input.focus();
      });
      content.append(picker);
    }
    autosize(input);
  }

  function fillPagePicker(picker) {
    const selected = picker.value;
    picker.replaceChildren();
    const placeholder = element('option', '', 'Choose a workspace page…'); placeholder.value = ''; picker.append(placeholder);
    for (const note of settings.notes.filter(note => !note.deleted)) {
      const option = element('option', '', `${note.folder ? `${note.folder}/` : ''}${note.title}`);
      option.value = note.id; picker.append(option);
    }
    picker.value = selected;
    delete picker.dataset.refreshPending;
  }

  function tableEditor(block, content) {
    const rows = block.rows;
    const wrapper = element('div', 'modern-write-table-scroll');
    const table = element('table', 'modern-write-table');
    table.setAttribute('aria-label', block.type === 'sheet' ? 'Sheet' : 'Table');
    const head = element('thead');
    const body = element('tbody');
    const foot = element('tfoot');
    const controls = element('tr', 'modern-write-column-actions');
    rows[0].forEach((_, column) => {
      const cell = element('th');
      if (!settings.readOnly) {
        const remove = button('×', () => {
          if (rows[0].length <= 1) return;
          rows.forEach(row => row.splice(column, 1)); renderBlock(block); emit(); focusCell(0, Math.max(0, column - 1));
        });
        remove.setAttribute('aria-label', `Delete column ${column + 1}`);
        remove.disabled = rows[0].length <= 1;
        cell.append(remove);
      }
      controls.append(cell);
    });
    controls.append(element('th')); head.append(controls);
    rows.forEach((row, rowIndex) => {
      const tr = element('tr');
      row.forEach((value, column) => {
        const cell = element(rowIndex === 0 ? 'th' : 'td');
        const input = element('input', 'modern-write-cell');
        input.type = 'text'; input.value = value; input.readOnly = !!settings.readOnly;
        input.dataset.row = String(rowIndex); input.dataset.column = String(column);
        input.setAttribute('aria-label', `${rowIndex ? `Row ${rowIndex}` : 'Header'}, column ${column + 1}`);
        input.addEventListener('input', () => { rows[rowIndex][column] = input.value; updateTotals(); emit(); });
        input.addEventListener('keydown', event => {
          if (settings.readOnly || event.isComposing) return;
          if (event.key === 'Enter') { event.preventDefault(); if (rowIndex === rows.length - 1) { rows.push(Array(rows[0].length).fill('')); renderBlock(block); emit(); } focusCell(rowIndex + 1, column); }
          if (event.key === 'Tab' && !event.shiftKey && rowIndex === rows.length - 1 && column === row.length - 1) { event.preventDefault(); rows.push(Array(rows[0].length).fill('')); renderBlock(block); emit(); focusCell(rowIndex + 1, 0); }
        });
        cell.append(input); tr.append(cell);
      });
      const action = element(rowIndex ? 'td' : 'th', 'modern-write-row-action');
      if (rowIndex && !settings.readOnly) {
        const remove = button('×', () => { rows.splice(rowIndex, 1); renderBlock(block); emit(); focusCell(Math.min(rowIndex, rows.length - 1), 0); });
        remove.setAttribute('aria-label', `Delete row ${rowIndex}`); action.append(remove);
      }
      tr.append(action); (rowIndex ? body : head).append(tr);
    });
    table.append(head, body, foot); wrapper.append(table); content.append(wrapper);
    function updateTotals() {
      const totals = computeSheetTotals(rows);
      foot.replaceChildren();
      if (!totals.some(value => value !== null)) return;
      const tr = element('tr');
      totals.forEach(total => tr.append(element('td', '', total === null ? '' : `Sum ${Number(total.toPrecision(12))}`)));
      tr.append(element('td')); foot.append(tr);
    }
    function focusCell(row, column) { views.get(block)?.content.querySelector(`[data-row="${row}"][data-column="${column}"]`)?.focus(); }
    updateTotals();
    if (!settings.readOnly) {
      const actions = element('div', 'modern-write-table-actions');
      actions.append(button('+ Row', () => { rows.push(Array(rows[0].length).fill('')); renderBlock(block); emit(); focusCell(rows.length - 1, 0); }), button('+ Column', () => { rows.forEach((row, index) => row.push(index ? '' : `Column ${row.length + 1}`)); renderBlock(block); emit(); focusCell(0, rows[0].length - 1); }));
      actions.append(button('Remove block', () => removeBlock(block), 'modern-write-action modern-write-remove'));
      content.append(actions);
    }
  }

  function previewBlock(block, preview) {
    const view = views.get(block);
    if (!view) return;
    const revision = (view.previewRevision || 0) + 1;
    view.previewRevision = revision;
    const markdown = blockMarkdown(block);
    rendererPromise ||= import('./markdown.js');
    rendererPromise.then(({ renderMarkdown }) => {
      if (destroyed || !preview.isConnected || view.previewRevision !== revision) return;
      renderMarkdown(preview, markdown, settings.notes, settings.fromNote, true, {
        ...settings.markdownOptions,
        readOnly: !!settings.readOnly,
        onUpdateBlock: async (_index, config) => {
          if (settings.readOnly || !blocks.includes(block)) return;
          block.text = parseMarkdownBlocks(serializeListDatabaseBlock(config))[0].text;
          const source = view.content.querySelector('.modern-write-source');
          if (source) source.value = block.text;
          emit();
        },
      });
    }).catch(error => {
      if (!destroyed && preview.isConnected && view.previewRevision === revision) preview.textContent = `Preview unavailable: ${error.message}`;
    });
  }

  function sourceEditor(block, content) {
    const toolbar = element('div', 'modern-write-block-toolbar');
    if (block.type === 'graph') {
      const label = element('label', 'modern-write-template', 'Diagram ');
      const select = element('select');
      select.setAttribute('aria-label', 'Diagram template'); select.disabled = !!settings.readOnly;
      const custom = element('option', '', 'Choose a template…'); custom.value = ''; select.append(custom);
      for (const name of Object.keys(GRAPH_TEMPLATES)) { const option = element('option', '', name); option.value = name; select.append(option); }
      select.value = Object.keys(GRAPH_TEMPLATES).find(name => GRAPH_TEMPLATES[name].split('\n')[0] === block.text.split('\n')[0]) || '';
      select.addEventListener('change', () => { if (!select.value) return; block.text = GRAPH_TEMPLATES[select.value]; input.value = block.text; autosize(input); emit(); previewBlock(block, preview); });
      label.append(select); toolbar.append(label);
    } else if (block.type === 'code') {
      const language = element('input', 'modern-write-language');
      language.value = block.language || ''; language.placeholder = 'Language'; language.readOnly = !!settings.readOnly;
      language.setAttribute('aria-label', 'Code language');
      language.addEventListener('input', () => { block.language = language.value; emit(); }); toolbar.append(language);
    } else toolbar.append(element('strong', '', 'Task list database'));
    if (!settings.readOnly) toolbar.append(button('Remove block', () => removeBlock(block), 'modern-write-action modern-write-remove'));
    content.append(toolbar);
    const layout = element('div', block.type === 'graph' ? 'modern-write-diagram-layout' : 'modern-write-source-layout');
    const details = element('details', 'modern-write-source-details');
    details.open = block.type !== 'list';
    details.append(element('summary', '', block.type === 'graph' ? 'Edit diagram source' : block.type === 'list' ? 'Edit list settings source' : 'Edit code'));
    const input = element('textarea', 'modern-write-source');
    input.value = block.text || ''; input.readOnly = !!settings.readOnly; input.spellcheck = false;
    input.setAttribute('aria-label', block.type === 'graph' ? 'Mermaid diagram definition' : block.type === 'list' ? 'List database configuration' : 'Code');
    let timer;
    input.addEventListener('input', () => {
      block.text = input.value; autosize(input); emit();
      if (block.type !== 'code') {
        clearTimeout(timer); previewTimers.delete(timer);
        timer = setTimeout(() => { previewTimers.delete(timer); previewBlock(block, preview); }, 180);
        previewTimers.add(timer);
      }
    });
    input.addEventListener('keydown', event => {
      if (event.key === 'Tab' && !event.shiftKey && !settings.readOnly) {
        event.preventDefault();
        const start = input.selectionStart;
        input.setRangeText('  ', start, input.selectionEnd, 'end');
        block.text = input.value; autosize(input); emit();
        if (block.type !== 'code') previewBlock(block, preview);
      }
    });
    details.append(input); layout.append(details);
    const preview = element('div', 'modern-write-preview markdown-body');
    preview.setAttribute('aria-label', block.type === 'graph' ? 'Diagram preview' : 'Task list database');
    if (block.type !== 'code') { layout.append(preview); previewBlock(block, preview); }
    content.append(layout);
    autosize(input);
    details.addEventListener('toggle', () => { if (details.open) autosize(input); });
  }

  function renderBlock(block) {
    const view = views.get(block);
    if (!view) return;
    view.node.dataset.type = block.type;
    view.content.replaceChildren();
    if (['table', 'sheet'].includes(block.type)) tableEditor(block, view.content);
    else if (['graph', 'code', 'list'].includes(block.type)) sourceEditor(block, view.content);
    else if (block.type === 'divider') {
      view.content.append(element('hr'));
      if (!settings.readOnly) view.content.append(button('Continue writing', () => newBlockAfter(block)));
    } else textEditor(block, view.content);
  }

  function render() {
    closeMenu();
    views.clear();
    canvas.replaceChildren();
    pane.classList.toggle('is-read-only', !!settings.readOnly);
    for (const block of blocks) {
      const node = element('section', 'modern-write-block');
      const gutter = button('+', () => {
        const input = views.get(block).content.querySelector('textarea, input:not([type="checkbox"])');
        if (block.type === 'text' && !block.text) { input.focus(); openMenu(block, input); }
        else { const next = newBlockAfter(block); const anchor = views.get(next).content.querySelector('textarea'); openMenu(next, anchor); }
      }, 'modern-write-gutter');
      gutter.setAttribute('aria-label', 'Insert a block'); gutter.title = 'Insert a block'; gutter.disabled = !!settings.readOnly;
      gutter.addEventListener('keydown', event => { if (event.key === 'Escape') closeMenu(); });
      const content = element('div', 'modern-write-block-content');
      node.append(gutter, content); canvas.append(node); views.set(block, { node, content });
      renderBlock(block);
    }
    if (!settings.readOnly) canvas.append(button('+ Add a block', () => { const block = newBlockAfter(blocks.at(-1)); openMenu(block, views.get(block).content.querySelector('textarea')); }, 'modern-write-add'));
    for (const input of canvas.querySelectorAll('textarea')) autosize(input);
  }

  function outsidePointer(event) { if (!menu.hidden && !menu.contains(event.target) && event.target !== menuState?.anchor) closeMenu(); }
  function viewportChange() { if (menuState) placeMenu(); }
  document.addEventListener('pointerdown', outsidePointer);
  window?.addEventListener('resize', viewportChange);
  window?.addEventListener('scroll', viewportChange, true);
  pane.addEventListener('focusout', event => {
    if (menuState && !pane.contains(event.relatedTarget)) closeMenu();
    for (const [block, view] of views) {
      if (view.refreshPending && !view.content.contains(event.relatedTarget)) {
        view.refreshPending = false;
        const preview = view.content.querySelector('.modern-write-preview');
        if (preview) previewBlock(block, preview);
      }
    }
  });
  render();

  return {
    update(next = {}) {
      if (destroyed) return;
      const body = next.body === undefined ? currentBody : String(next.body ?? '');
      const noteChanged = next.fromNote !== undefined && next.fromNote?.id !== settings.fromNote?.id;
      const readOnlyChanged = next.readOnly !== undefined && !!next.readOnly !== !!settings.readOnly;
      const contextChanged = (next.notes !== undefined && next.notes !== settings.notes) || (next.fromNote !== undefined && next.fromNote !== settings.fromNote);
      settings = { ...settings, ...next };
      if (body !== currentBody || noteChanged || readOnlyChanged) {
        currentBody = body;
        blocks = parseMarkdownBlocks(body);
        render();
      } else if (contextChanged) {
        for (const [block, view] of views) {
          const picker = view.content.querySelector('.modern-write-page-picker');
          if (picker) {
            if (document.activeElement === picker) picker.dataset.refreshPending = 'true';
            else fillPagePicker(picker);
          }
          const preview = view.content.querySelector('.modern-write-preview');
          if (preview) {
            if (view.content.contains(document.activeElement)) view.refreshPending = true;
            else previewBlock(block, preview);
          }
        }
      }
    },
    focus() { if (!destroyed) focusBlock(blocks[0]); },
    destroy() {
      destroyed = true;
      closeMenu();
      for (const timer of previewTimers) clearTimeout(timer);
      previewTimers.clear();
      document.removeEventListener('pointerdown', outsidePointer);
      window?.removeEventListener('resize', viewportChange);
      window?.removeEventListener('scroll', viewportChange, true);
      pane.remove();
      views.clear();
    },
  };
}
