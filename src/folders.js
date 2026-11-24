import { propertiesBody, withPropertiesBody } from './collections.js';

const MAX_BANNER_BYTES = 512 * 1024;

export function safeBanner(value) {
  if (typeof value !== 'string' || value.length > Math.ceil(MAX_BANNER_BYTES / 3) * 4 + 30) return false;
  const match = /^data:image\/(png|jpeg|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(value);
  if (!match) return false;
  try {
    const bytes = atob(match[2]);
    if (bytes.length > MAX_BANNER_BYTES) return false;
    if (match[1] === 'png') return bytes.startsWith('\x89PNG\r\n\x1a\n');
    if (match[1] === 'jpeg') return bytes.startsWith('\xff\xd8\xff');
    return bytes.startsWith('RIFF') && bytes.slice(8, 12) === 'WEBP';
  } catch { return false; }
}

function splitOverview(content) {
  let banner = null;
  const body = content.replace(/(?:^|\r?\n\r?\n)!\[Folder banner\]\((data:[^\s)]+)\)(?=\r?\n|$)/g, (line, value) => {
    if (!safeBanner(value)) return line;
    banner ??= value;
    return '';
  });
  return { body, banner };
}

export function folderOverview(notes, folder) {
  const note = notes.find(note => !note.deleted && note.folder === folder && note.title.toLowerCase() === 'readme');
  return { note, ...splitOverview(propertiesBody(note?.content || '')) };
}

export function withFolderBanner(content, banner) {
  if (banner !== null && !safeBanner(banner)) throw new Error('Use a PNG, JPEG or WebP folder banner no larger than 512 KiB.');
  const { body } = splitOverview(propertiesBody(content));
  return withPropertiesBody(content, banner ? `${body}${body ? '\n\n' : ''}![Folder banner](${banner})` : body);
}

export async function readFolderBanner(file) {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > 16 * 1024 * 1024) throw new Error('Choose a PNG, JPEG or WebP image up to 16 MiB.');
  let bitmap;
  try { bitmap = await createImageBitmap(file); }
  catch { throw new Error('This image could not be decoded. Choose a valid PNG, JPEG or WebP banner.'); }
  try {
    if (bitmap.width * bitmap.height > 32000000) throw new Error('Choose a banner smaller than 32 megapixels.');
    const scale = Math.min(1, 1280 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('This browser could not prepare the banner. Your existing overview is unchanged.');
    context.fillStyle = '#ffffff';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const banner = canvas.toDataURL('image/jpeg', 0.8);
    if (!safeBanner(banner)) throw new Error('The prepared banner exceeds 512 KiB. Choose a smaller or simpler image.');
    return banner;
  } finally { bitmap.close(); }
}
