export const state = {
  dirHandle: null,
  webkitFiles: null,
  webkitRootName: null,
  /** 'directory-handle' | 'local-file-list' | null */
  accessMode: null,
  /** Browser may have listed many files; only process paths are scored */
  listedFileCount: 0,
  canRescan: false,
  report: null,
  error: null,
  scanning: false,
  demoMode: false,
};

export function setReport(report) {
  state.report = report;
  state.error = null;
}

export function setError(err) {
  state.error = err?.message || String(err);
  state.report = null;
}
