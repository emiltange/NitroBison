import { validatePath } from './core.js';
import { safeBanner } from './folders.js';
import { localDirectoryPath } from './directory.js';

export function updateFolderPreferences(current, folder, patch) {
  validatePath(folder);
  if (!patch || typeof patch !== 'object' || Array.isArray(patch) || ![Object.prototype, null].includes(Object.getPrototypeOf(patch)) || Reflect.ownKeys(patch).some(key => !['directory', 'directorySync', 'directoryService', 'banner', 'hidden'].includes(key))) {
    throw new Error('Unsupported private folder preference.');
  }
  const entry = { ...(Object.hasOwn(current, folder) ? current[folder] : {}) };
  if (Object.hasOwn(patch, 'directory')) {
    const directory = patch.directory;
    if (directory !== entry.directory) { delete entry.directorySync; delete entry.directoryService; }
    if (directory === null) delete entry.directory;
    else {
      if (typeof directory !== 'string' || !directory.trim() || /[\x00-\x1f\x7f-\x9f]/.test(directory)) throw new Error('Use a directory label or absolute local path without control characters.');
      if (/[\/\\]/.test(directory)) localDirectoryPath(directory);
      else if (directory.length > 255) throw new Error('Use a directory label of at most 255 characters.');
      entry.directory = directory;
    }
  }
  if (Object.hasOwn(patch, 'directorySync')) {
    if (typeof patch.directorySync !== 'boolean') throw new Error('Markdown folder saving must be a boolean.');
    if (patch.directorySync) { localDirectoryPath(entry.directory); entry.directorySync = true; }
    else delete entry.directorySync;
  }
  if (Object.hasOwn(patch, 'directoryService')) {
    if (patch.directoryService === null) delete entry.directoryService;
    else {
      if (!entry.directory || !['google', 'google-ea', 'onedrive', 'onedrive-ea'].includes(patch.directoryService)) throw new Error('Choose a supported folder service.');
      entry.directoryService = patch.directoryService;
    }
  }
  if (Object.hasOwn(patch, 'banner')) {
    if (patch.banner !== null && !safeBanner(patch.banner)) throw new Error('Use a PNG, JPEG or WebP folder banner no larger than 512 KiB.');
    entry.banner = patch.banner;
  }
  if (Object.hasOwn(patch, 'hidden')) {
    if (typeof patch.hidden !== 'boolean') throw new Error('The hidden folder preference must be a boolean.');
    if (patch.hidden) entry.hidden = true;
    else delete entry.hidden;
  }
  const next = { ...current };
  if (Object.keys(entry).length) Object.defineProperty(next, folder, { value: entry, enumerable: true, configurable: true, writable: true });
  else delete next[folder];
  return next;
}

export function isFolderHidden(folder, preferences) {
  validatePath(folder);
  let path = folder;
  while (true) {
    if (Object.hasOwn(preferences, path) && Object.hasOwn(preferences[path], 'hidden') && preferences[path].hidden === true) return true;
    const separator = path.lastIndexOf('/');
    if (separator < 0) return false;
    path = path.slice(0, separator);
  }
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
