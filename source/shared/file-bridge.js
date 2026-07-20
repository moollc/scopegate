import { context } from './permissions.js';

/**
 * Workspace folder picker. Must run from a user gesture.
 * Returns a FileSystemDirectoryHandle or throws.
 */
export async function pickWorkspaceDirectory() {
  if (!context.hasFilePicker) {
    throw new Error('File System Access API not available — use Chrome/Edge over HTTPS.');
  }
  return window.showDirectoryPicker({ mode: 'read' });
}

export async function readTextFile(dirHandle, relativePath) {
  const parts = relativePath.split('/').filter(Boolean);
  let handle = dirHandle;
  for (let i = 0; i < parts.length - 1; i++) {
    handle = await handle.getDirectoryHandle(parts[i]);
  }
  const fileHandle = await handle.getFileHandle(parts[parts.length - 1]);
  const file = await fileHandle.getFile();
  return file.text();
}

export async function fileExists(dirHandle, relativePath) {
  try {
    await readTextFile(dirHandle, relativePath);
    return true;
  } catch {
    return false;
  }
}

export async function listNames(dirHandle) {
  const names = [];
  for await (const [name] of dirHandle.entries()) names.push(name);
  return names.sort();
}

/**
 * Walk shallow tree: depth 0 = root names; depth 1 = one level of children keys "parent/child".
 */
export async function collectTree(dirHandle, maxDepth = 2, prefix = '') {
  const out = [];
  for await (const [name, handle] of dirHandle.entries()) {
    const path = prefix ? `${prefix}/${name}` : name;
    out.push({ path, kind: handle.kind });
    if (handle.kind === 'directory' && maxDepth > 0) {
      const child = await dirHandle.getDirectoryHandle(name);
      const nested = await collectTree(child, maxDepth - 1, path);
      out.push(...nested);
    }
  }
  return out;
}
