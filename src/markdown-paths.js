export function portablePath(path) {
  if (typeof path !== 'string' || !path || path.length > 750 || path.split('/').some(part => !part || part === '.' || part === '..' || part.length > 240 || /[\\<>:"|?*\x00-\x1f\x7f]/.test(part) || /[. ]$/.test(part) || /^(con|prn|aux|nul|conin\$|conout\$|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part))) throw new Error(`Unsafe file path or filename: ${String(path).slice(0, 200)}`);
  return path;
}

export function pathRegistry() {
  const paths = new Map();
  return (path, kind) => {
    portablePath(path);
    const parts = path.split('/');
    for (let i = 1; i <= parts.length; i++) {
      const current = parts.slice(0, i).join('/');
      const type = i === parts.length ? kind : 'folder';
      const key = current.normalize('NFC').toLowerCase();
      const existing = paths.get(key);
      if (existing && (existing.path !== current || existing.kind !== type || type === 'file')) throw new Error(`Duplicate path or file/folder collision: ${current}`);
      paths.set(key, { path: current, kind: type });
    }
  };
}
