export function localDirectoryPath(value) {
  if (typeof value !== 'string' || value.length > 4096
    || /[\u0000-\u001f\u007f-\u009f]/.test(value)
    || /^[\\/]{2}/.test(value)
    || !(/^[a-z]:[\\/]/i.test(value) || value.startsWith('/'))) {
    throw new Error('The selected directory must have an absolute local path.');
  }
  return value;
}

function directoryName(value) {
  if (typeof value !== 'string' || !value.trim() || value.length > 255
    || value === '.' || value === '..' || /^[a-z]:$/i.test(value)
    || /[\u0000-\u001f\u007f-\u009f/\\]/.test(value)) {
    throw new Error('The selected directory has an invalid name.');
  }
  return value;
}

export function selectedDirectoryName(files, entries = []) {
  let root = null;
  const accept = name => {
    name = directoryName(name);
    if (root !== null && root !== name) throw new Error('The selection contains more than one directory.');
    root = name;
  };
  for (const entry of entries) {
    if (!entry || entry.isDirectory !== true || entry.isFile !== false) {
      throw new Error('The selection is not a directory.');
    }
    accept(entry.name);
    if (entry.fullPath !== undefined && entry.fullPath !== `/${entry.name}`) {
      throw new Error('The selected directory metadata is inconsistent.');
    }
  }
  for (const file of files) {
    const path = file?.webkitRelativePath;
    if (typeof path !== 'string' || !path.includes('/')) {
      throw new Error('The selection does not identify a directory.');
    }
    const parts = path.split('/');
    for (const part of parts) directoryName(part);
    accept(parts[0]);
  }
  return root;
}

export async function chooseDirectory() {
  if (typeof window !== 'undefined' && window.nitrobisonDesktop?.isDesktop) {
    const selected = await window.nitrobisonDesktop.chooseDirectory();
    return selected === null ? null : localDirectoryPath(selected);
  }
  if (typeof window !== 'undefined' && typeof window.showDirectoryPicker === 'function') {
    try {
      const handle = await window.showDirectoryPicker({ mode: 'read', id: 'nitrobison-folder-location' });
      return directoryName(handle.name);
    } catch (error) {
      if (error?.name === 'AbortError') return null;
      throw error;
    }
  }
  if (typeof document === 'undefined' || !document.body) {
    throw new Error('Directory selection is not supported in this browser.');
  }
  const input = document.createElement('input');
  input.type = 'file';
  if (!('webkitdirectory' in input)) {
    throw new Error('Directory selection is not supported in this browser.');
  }
  input.webkitdirectory = true;
  input.multiple = true;
  input.hidden = true;
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      input.removeEventListener('change', change);
      input.removeEventListener('cancel', cancel);
      input.removeEventListener('error', error);
      input.value = '';
      input.remove();
    };
    const change = () => {
      try {
        const name = selectedDirectoryName(input.files, input.webkitEntries || []);
        cleanup();
        resolve(name);
      } catch (cause) {
        cleanup();
        reject(cause);
      }
    };
    const cancel = () => {
      cleanup();
      resolve(null);
    };
    const error = () => {
      cleanup();
      reject(new Error('The directory picker could not complete the selection.'));
    };
    input.addEventListener('change', change);
    // shortcut: cancellation needs the modern input cancel event; add a focus fallback for older browsers.
    input.addEventListener('cancel', cancel);
    input.addEventListener('error', error);
    try {
      document.body.append(input);
      input.click();
    } catch (cause) {
      cleanup();
      reject(cause);
    }
  });
}
