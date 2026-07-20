export const context = {
  secure: typeof location !== 'undefined' && location.protocol === 'https:',
  installed:
    typeof window !== 'undefined' &&
    (window.matchMedia('(display-mode: standalone)').matches ||
      navigator.standalone === true),
  online: typeof navigator !== 'undefined' ? navigator.onLine : true,
  /** Chromium File System Access API */
  hasFilePicker: typeof window !== 'undefined' && 'showDirectoryPicker' in window,
  /** Legacy folder upload (Chrome/Edge/Firefox/Safari desktop) */
  hasWebkitDirectory:
    typeof document !== 'undefined' &&
    (() => {
      const i = document.createElement('input');
      return 'webkitdirectory' in i;
    })(),
  hasTauri: typeof window !== 'undefined' && '__TAURI__' in window,
};

export function folderPickHint() {
  if (context.hasFilePicker) {
    return 'Open a workspace folder, or run a demo without picking files.';
  }
  if (context.hasWebkitDirectory) {
    return 'Open a workspace folder (browser folder upload), or run a demo.';
  }
  return 'This browser cannot pick folders. Use demos here, or run npm run scan locally in Chrome/Edge.';
}
