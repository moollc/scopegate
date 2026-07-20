export const state = {
  dirHandle: null,
  webkitFiles: null,
  webkitRootName: null,
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
