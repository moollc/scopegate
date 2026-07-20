export const context = {
  secure: typeof location !== 'undefined' && location.protocol === 'https:',
  installed:
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      navigator.standalone === true),
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  /** Chromium File System Access API — true local folder grant, no full-tree copy */
  hasFilePicker: typeof window !== 'undefined' && 'showDirectoryPicker' in window,
  /**
   * Legacy &lt;input webkitdirectory&gt; — OS dialog often says "Upload" but files
   * stay in this page only. Browser may enumerate the whole tree into memory.
   */
  hasWebkitDirectory:
    typeof document !== 'undefined' &&
    (() => {
      const i = document.createElement('input');
      return 'webkitdirectory' in i;
    })(),
  hasTauri: typeof window !== 'undefined' && '__TAURI__' in window,
};

/** Idle status line under Status */
export function folderPickHint() {
  if (context.hasFilePicker) {
    return 'Open a workspace folder (read-only, local only). Only process files are scored — nothing is uploaded.';
  }
  if (context.hasWebkitDirectory) {
    return 'Open a workspace folder. The browser may say “Upload” — files never leave this device. Prefer Chrome/Edge for a real folder grant, or npm run scan.';
  }
  return 'This browser cannot pick folders. Use demos here, or run: npm run scan -- /path/to/workspace';
}

/** One-line privacy under the action buttons */
export function privacyFootnote() {
  if (context.hasFilePicker) {
    return 'Local folder · no account · no server upload · scores AGENTS/comms/kit paths only';
  }
  if (context.hasWebkitDirectory) {
    return 'Local only (no server). Dialog may say Upload — that means “hand files to this tab,” not the cloud. Huge monorepos: use CLI scan.';
  }
  return 'Demos only in this browser · CLI: npm run scan -- <workspace>';
}

/**
 * Confirm before webkitdirectory path — OS wording is scary and wrong for our product.
 * @returns {boolean}
 */
export function confirmLocalFileListPick() {
  return window.confirm(
    [
      'This browser will open a folder picker.',
      '',
      'It may say “Upload” or “Upload folder.” That is the browser’s label only.',
      'Nothing is sent to a server — files stay in this tab on your machine.',
      '',
      'Scopegate only reads process files (AGENTS.md, comms/pin, kit cues).',
      'It does not review or upload your whole codebase.',
      '',
      'For a true local folder permission (no full-tree handoff), use Chrome or Edge over HTTPS, or run:',
      '  npm run scan -- /path/to/workspace',
      '',
      'Continue with local folder pick?',
    ].join('\n'),
  );
}
