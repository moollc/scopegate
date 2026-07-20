import { context } from './permissions.js';

/**
 * Prefer showDirectoryPicker (true local folder grant).
 * Fall back to &lt;input webkitdirectory&gt; — OS may say "Upload"; data stays in-page.
 * Always call from a user gesture (click).
 *
 * @returns {Promise<
 *   | { kind: 'handle', handle: FileSystemDirectoryHandle, access: 'directory-handle' }
 *   | { kind: 'files', rootName: string, files: File[], access: 'local-file-list' }
 * >}
 */
export async function pickWorkspace(options = {}) {
  const preferHandle = options.preferHandle !== false;

  if (preferHandle && context.hasFilePicker) {
    try {
      const handle = await window.showDirectoryPicker({
        mode: 'read',
        id: 'scopegate-workspace',
      });
      return { kind: 'handle', handle, access: 'directory-handle' };
    } catch (e) {
      if (e?.name === 'AbortError') throw e;
      // API present but blocked (permissions, iframe, policy) → fall through
      console.warn('showDirectoryPicker failed, trying local file-list pick', e);
    }
  }

  if (context.hasWebkitDirectory) {
    if (typeof options.beforeFileListPick === 'function') {
      const ok = options.beforeFileListPick();
      if (ok === false) {
        const err = new Error('Folder pick cancelled');
        err.name = 'AbortError';
        throw err;
      }
    }
    const files = await pickViaWebkitDirectory();
    if (!files.length) {
      const err = new Error('No folder selected');
      err.name = 'AbortError';
      throw err;
    }
    const rootName = rootNameFromWebkitFiles(files);
    return { kind: 'files', rootName, files, access: 'local-file-list' };
  }

  throw new Error(
    'Folder pick is not available in this browser. Use Demo buttons, or run: npm run scan -- /path/to/workspace',
  );
}

function pickViaWebkitDirectory() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
    // Hint for AT / some UAs — does not change OS "Upload" chrome on most browsers
    input.setAttribute('aria-label', 'Choose local workspace folder for Scopegate (stays on device)');
    input.multiple = true;
    input.style.display = 'none';
    document.body.appendChild(input);

    let settled = false;
    const done = (fn) => {
      if (settled) return;
      settled = true;
      input.remove();
      fn();
    };

    input.addEventListener('change', () => {
      const list = input.files ? Array.from(input.files) : [];
      done(() => resolve(list));
    });

    // Cancel is hard to detect; focus-back after a short delay with no change ≈ cancel
    window.addEventListener(
      'focus',
      () => {
        setTimeout(() => {
          if (!settled && (!input.files || input.files.length === 0)) {
            done(() => resolve([]));
          }
        }, 400);
      },
      { once: true },
    );

    try {
      input.click();
    } catch (e) {
      done(() => reject(e));
    }
  });
}

function rootNameFromWebkitFiles(files) {
  const first = files[0]?.webkitRelativePath || files[0]?.name || 'workspace';
  const root = first.split(/[/\\]/)[0];
  return root || 'workspace';
}

/**
 * Map of relative path → text for known paths (from webkit FileList).
 * Paths use forward slashes; strip the root folder prefix from webkitRelativePath.
 * Only `wantedPaths` contents are read — not the whole tree as text.
 */
export async function mapFromWebkitFiles(fileList, wantedPaths) {
  const byRel = new Map();
  for (const file of fileList) {
    const raw = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
    const parts = raw.split('/');
    // drop root folder name
    const rel = parts.length > 1 ? parts.slice(1).join('/') : parts[0];
    byRel.set(rel, file);
    // also index basename-only for shallow hits
    if (parts.length === 2) byRel.set(parts[1], file);
  }

  const out = {};
  for (const p of wantedPaths) {
    const norm = p.replace(/\\/g, '/');
    const file = byRel.get(norm);
    if (!file) {
      out[norm] = null;
      continue;
    }
    try {
      out[norm] = await file.text();
    } catch {
      out[norm] = null;
    }
  }
  return { map: out, byRel };
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

/** @deprecated use pickWorkspace */
export async function pickWorkspaceDirectory() {
  const r = await pickWorkspace();
  if (r.kind === 'handle') return r.handle;
  throw new Error('Directory handle not available; use pickWorkspace()');
}
