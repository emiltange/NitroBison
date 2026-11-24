import { validatePath } from './core.js';
import { safeBanner } from './folders.js';

export function updateFolderPreferences(current, folder, patch) {
  validatePath(folder);
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || ![Object.prototype, null].includes(Object.getPrototypeOf(patch)) || Reflect.ownKeys(patch).some(key => key !== 'directory' && key !== 'banner')) {
    throw new Error('Folder preferences may contain only a directory label and banner override.');
  }
  const entry = { ...(Object.hasOwn(current, folder) ? current[folder] : {}) };
  if (Object.hasOwn(patch, 'directory')) {
    const directory = patch.directory;
    if (directory === null) delete entry.directory;
    else {
      if (typeof directory !== 'string' || !directory.trim() || directory.length > 255 || /[\/\\\x00-\x1f\x7f-\x9f]/.test(directory)) {
        throw new Error('Use a directory label of 1–255 characters without path separators or control characters.');
      }
      entry.directory = directory;
    }
  }
  if (Object.hasOwn(patch, 'banner')) {
    if (patch.banner !== null && !safeBanner(patch.banner)) throw new Error('Use a PNG, JPEG or WebP folder banner no larger than 512 KiB.');
    entry.banner = patch.banner;
  }
  const next = { ...current };
  if (Object.keys(entry).length) Object.defineProperty(next, folder, { value: entry, enumerable: true, configurable: true, writable: true });
  else delete next[folder];
  return next;
}

export function renameFolderPreferences(current, oldPath, newPath) {
  validatePath(oldPath, false);
  validatePath(newPath, false);
  if (newPath.startsWith(`${oldPath}/`)) throw new Error('A folder cannot be moved inside itself.');
  const paths = new Set();
  const entries = Object.entries(current).map(([path, entry]) => {
    const moved = path === oldPath || path.startsWith(`${oldPath}/`) ? newPath + path.slice(oldPath.length) : path;
    if (paths.has(moved)) throw new Error('A folder preference already exists at that destination.');
    paths.add(moved);
    return [moved, entry];
  });
  return Object.fromEntries(entries);
}
