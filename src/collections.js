import { extractTags } from './markdown-model.js';

export const NOTE_STATUSES = ['Not started', 'Doing', 'In review', 'Done'];
export const STATUS_LABELS = { 'Not started': 'To-do', Doing: 'In progress', 'In review': 'In review', Done: 'Complete' };
export function statusLabel(status) { return STATUS_LABELS[status] || status; }
export function statusTone(status) { return status === 'Done' ? 'done' : status === 'In review' ? 'review' : status === 'Doing' ? 'doing' : NOTE_STATUSES.includes(status) ? 'todo' : 'custom'; }
const keys = new Set(['status', 'start', 'end']);
const opening = /^```nitrobison-properties(?=\s|$)/;

function dateValue(value, name) {
  if (value === '') return '';
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${name} must be a date in YYYY-MM-DD format.`);
  const [year, month, day] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 1 || month < 1 || month > 12 || day < 1 || day > days[month - 1]) throw new Error(`${name} is not a real calendar date.`);
  return value;
}

function validate(properties) {
  if (!properties || typeof properties !== 'object' || Array.isArray(properties)) throw new Error('Note properties metadata must be a JSON object.');
  for (const key of Object.keys(properties)) if (!keys.has(key)) throw new Error(`Unsupported note property: ${key}.`);
  const status = properties.status === undefined ? 'Not started' : properties.status;
  if (typeof status !== 'string' || !status.trim() || status.length > 80 || /[\x00-\x1f\x7f]/.test(status)) throw new Error('Status must be 1–80 characters without control characters.');
  const start = dateValue(properties.start === undefined ? '' : properties.start, 'Start date');
  const end = dateValue(properties.end === undefined ? '' : properties.end, 'End date');
  if (end && !start) throw new Error('An end date requires a start date.');
  if (end && end < start) throw new Error('The end date must be on or after the start date (inclusive range).');
  return { status, start, end };
}

function splitProperties(content) {
  if (typeof content !== 'string') throw new Error('Note properties require Markdown text.');
  if (!opening.test(content)) return { prefix: '', body: content, json: null };
  const match = /^```nitrobison-properties\r?\n([\s\S]*?)\r?\n```(?:\r?\n\r?\n|$)/.exec(content);
  if (!match) throw new Error('Malformed note properties metadata. Repair the leading JSON fence in Write (Markdown) mode; your source is unchanged.');
  if (match[1].length > 4096) throw new Error('Note properties metadata exceeds 4096 characters.');
  return { prefix: match[0], body: content.slice(match[0].length), json: match[1] };
}

export function readProperties(content) {
  const { prefix, body, json } = splitProperties(content);
  let properties = {};
  if (json !== null) {
    try { properties = JSON.parse(json); }
    catch { throw new Error('Invalid JSON in note properties metadata. Repair it in Write (Markdown) mode; your source is unchanged.'); }
  }
  return { ...validate(properties), body, prefix };
}

export function withProperties(content, patch) {
  if (!patch || typeof patch !== 'object' || Array.isArray(patch)) throw new Error('A note properties patch must be an object.');
  for (const key of Object.keys(patch)) if (!keys.has(key)) throw new Error(`Unsupported note property: ${key}.`);
  for (const [key, value] of Object.entries(patch)) if (value === undefined) throw new Error(`The ${key} property cannot be undefined.`);
  const existing = readProperties(content);
  const properties = validate({ status: existing.status, start: existing.start, end: existing.end, ...patch });
  return `\`\`\`nitrobison-properties\n${JSON.stringify(properties)}\n\`\`\`\n\n${existing.body}`;
}

// Presentation strips only our anchored block; imported Markdown and later examples stay intact.
export function propertiesBody(content) {
  try { return readProperties(content).body; }
  catch {
    if (!opening.test(content)) return content;
    const close = /^```nitrobison-properties\r?\n[\s\S]*?\r?\n```(?:\r?\n\r?\n|\r?\n|$)/.exec(content);
    return close ? content.slice(close[0].length) : '';
  }
}

export function withPropertiesBody(content, body) {
  const properties = readProperties(content);
  return properties.prefix + body;
}

export function collectionRecords(notes, { tag = '', folder = null } = {}) {
  const topic = String(tag).replace(/^#/, '').toLowerCase();
  return notes.filter(note => !note.deleted && (folder === null || (folder === '' ? note.folder === '' : note.folder === folder || note.folder.startsWith(`${folder}/`))))
    .map(note => {
      const tags = extractTags(note.content);
      let properties;
      let error = null;
      try { properties = readProperties(note.content); }
      catch (failure) { error = failure.message; properties = { status: 'Not started', start: '', end: '', body: propertiesBody(note.content) }; }
      return { note, properties, tags, error };
    }).filter(record => !topic || record.tags.includes(topic));
}

export function addDays(value, count) {
  dateValue(value, 'Date');
  if (!value || !Number.isSafeInteger(count)) throw new Error('Date navigation requires a date and an integer day count.');
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + count);
  if (!Number.isFinite(date.getTime())) throw new Error('Date navigation exceeds the supported range.');
  const result = date.toISOString().slice(0, 10);
  dateValue(result, 'Date');
  return result;
}
