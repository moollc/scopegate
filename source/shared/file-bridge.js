import { context } from './permissions.js';

/**
 * Prefer showDirectoryPicker (true local folder grant).
 * Fall back to <input webkitdirectory> — OS may say "Upload"; data stays in-page.
 * Always call from a user gesture (click). Do not put confirm() before this — it
 * burns the gesture and some browsers then block the picker entirely.
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
      console.warn('showDirectoryPicker failed, trying local file-list pick', e);
    }
  }

  if (context.hasWebkitDirectory) {
    // Optional note only — must NOT be window.confirm (breaks user activation)
    if (typeof options.beforeFileListPick === 'function') {
      options.beforeFileListPick();
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

/**
 * webkitdirectory pick. Cancel detection must NOT race the OS dialog:
 * focus returns before FileList is populated on large folders / slow disks.
 */
function pickViaWebkitDirectory() {
  return new Promise((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.setAttribute('webkitdirectory', '');
    input.setAttribute('directory', '');
    input.setAttribute(
      'aria-label',
      'Choose local workspace folder for Scopegate (stays on device)',
    );
    input.multiple = true;
    // Keep in DOM but off-screen — some engines drop change events if removed early
    input.style.cssText = 'position:fixed;left:-9999px;top:0;opacity:0;width:1px;height:1px';
    document.body.appendChild(input);

    let settled = false;
    let cancelTimer = null;

    const cleanup = () => {
      if (cancelTimer) {
        clearTimeout(cancelTimer);
        cancelTimer = null;
      }
      try {
        input.remove();
      } catch {
        /* already gone */
      }
    };

    const done = (fn) => {
      if (settled) return;
      settled = true;
      cleanup();
      fn();
    };

    input.addEventListener('change', () => {
      const list = input.files ? Array.from(input.files) : [];
      done(() => resolve(list));
    });

    // Only treat as cancel after focus returns AND a long quiet period with no files.
    // 400ms was cancelling real picks mid-dialog.
    const armCancelWatch = () => {
      if (settled) return;
      if (cancelTimer) clearTimeout(cancelTimer);
      cancelTimer = setTimeout(() => {
        if (settled) return;
        if (input.files && input.files.length > 0) {
          const list = Array.from(input.files);
          done(() => resolve(list));
          return;
        }
        done(() => resolve([]));
      }, 2500);
    };

    window.addEventListener(
      'focus',
      () => {
        // Debounce: OS may focus/blur several times while dialog is open
        armCancelWatch();
      },
      true,
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
 * Only `wantedPaths` contents are read as text.
 */
export async function mapFromWebkitFiles(fileList, wantedPaths) {
  const byRel = new Map();
  for (const file of fileList) {
    const raw = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
    const parts = raw.split('/');
    const rel = parts.length > 1 ? parts.slice(1).join('/') : parts[0];
    byRel.set(rel, file);
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
