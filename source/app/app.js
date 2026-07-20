import { pickWorkspaceDirectory, readTextFile } from '../shared/file-bridge.js';
import { context } from '../shared/permissions.js';
import {
  analyzeWorkspace,
  RULE_CANDIDATES,
  COMMS_CANDIDATES,
  KIT_CUE_PATHS,
  demoFixtures,
} from './scan.js';
import { state, setReport, setError } from './state.js';

const $ = (id) => document.getElementById(id);

function render() {
  const status = $('status');
  const scoresEl = $('scores');
  const findingsEl = $('findings');
  const packEl = $('pack');
  const gradeEl = $('grade');
  const hasPack = Boolean(state.report?.coldStart);

  $('copy-btn').disabled = !hasPack;
  $('download-btn').disabled = !hasPack;
  $('rescan-btn').disabled = !state.dirHandle;

  if (state.scanning) {
    status.textContent = 'Scanning…';
    status.dataset.tone = 'muted';
    return;
  }
  if (state.error) {
    status.textContent = state.error;
    status.dataset.tone = 'bad';
    gradeEl.textContent = '—';
    delete gradeEl.dataset.grade;
    scoresEl.innerHTML = '';
    findingsEl.innerHTML = '';
    packEl.textContent = '';
    return;
  }
  if (!state.report) {
    status.textContent = context.hasFilePicker
      ? 'Open a workspace folder, or run a demo to see grades without picking files.'
      : 'Folder picker needs Chrome/Edge + HTTPS. Demos still work.';
    status.dataset.tone = 'muted';
    gradeEl.textContent = '—';
    delete gradeEl.dataset.grade;
    scoresEl.innerHTML = '';
    findingsEl.innerHTML = '';
    packEl.textContent = '';
    return;
  }

  const r = state.report;
  const mode = state.demoMode ? `demo · ${r.rootName}` : `Scanned: ${r.rootName}`;
  status.textContent = mode;
  status.dataset.tone = 'ok';
  gradeEl.textContent = r.grade;
  gradeEl.dataset.grade = r.grade;

  scoresEl.innerHTML = r.scores
    .map(
      (s) =>
        `<li class="${s.ok ? 'ok' : 'bad'}"><strong>${s.ok ? 'OK' : 'FIX'}</strong> ${escapeHtml(s.label)} <span class="detail">${escapeHtml(s.detail)}</span></li>`,
    )
    .join('');

  findingsEl.innerHTML = r.findings.length
    ? r.findings.map((f) => `<li>${escapeHtml(f)}</li>`).join('')
    : '<li class="ok">No critical fixes suggested.</li>';

  packEl.textContent = r.coldStart;
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

async function loadOptional(dir, path) {
  try {
    return await readTextFile(dir, path);
  } catch {
    return null;
  }
}

async function scanDirectory(dirHandle) {
  state.scanning = true;
  state.demoMode = false;
  render();
  try {
    const topLevel = [];
    for await (const [name] of dirHandle.entries()) topLevel.push(name);

    const paths = [
      ...RULE_CANDIDATES,
      ...COMMS_CANDIDATES,
      ...KIT_CUE_PATHS,
      'WORKSPACE_SETUP.md',
      'package.json',
    ];
    // Nested app verify paths (common kit layout)
    for (const name of topLevel) {
      if (name === 'scaffold' || name === 'scaffolds' || name.startsWith('.')) continue;
      paths.push(`${name}/scripts/verify-workspace.mjs`);
      paths.push(`${name}/package.json`);
    }

    const files = {};
    for (const p of [...new Set(paths)]) {
      files[p] = await loadOptional(dirHandle, p);
    }

    if (topLevel.includes('.cursor')) {
      files['.cursor/rules'] = '(directory present)';
    }

    const report = analyzeWorkspace({
      rootName: dirHandle.name,
      files,
      topLevel,
    });
    setReport(report);
  } catch (e) {
    setError(e);
  } finally {
    state.scanning = false;
    render();
  }
}

async function onPick() {
  try {
    const dir = await pickWorkspaceDirectory();
    state.dirHandle = dir;
    state.demoMode = false;
    await scanDirectory(dir);
  } catch (e) {
    if (e?.name === 'AbortError') return;
    setError(e);
    render();
  }
}

function onCopy() {
  if (!state.report?.coldStart) return;
  navigator.clipboard.writeText(state.report.coldStart).then(() => {
    const btn = $('copy-btn');
    btn.textContent = 'Copied';
    setTimeout(() => {
      btn.textContent = 'Copy pack';
    }, 1500);
  });
}

function onDownload() {
  if (!state.report?.coldStart) return;
  const name = (state.report.rootName || 'workspace').replace(/[^\w.-]+/g, '_');
  const blob = new Blob([state.report.coldStart], { type: 'text/markdown;charset=utf-8' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `cold-start-${name}.md`;
  a.click();
  URL.revokeObjectURL(a.href);
}

function onRescan() {
  if (state.dirHandle) scanDirectory(state.dirHandle);
}

function onDemo(kind) {
  const fixtures = demoFixtures();
  const fix = fixtures[kind];
  if (!fix) return;
  state.dirHandle = null;
  state.demoMode = true;
  state.error = null;
  setReport(analyzeWorkspace(fix));
  render();
}

export function boot() {
  $('pick-btn').addEventListener('click', onPick);
  $('copy-btn').addEventListener('click', onCopy);
  $('download-btn').addEventListener('click', onDownload);
  $('rescan-btn').addEventListener('click', onRescan);
  $('demo-good').addEventListener('click', () => onDemo('healthy'));
  $('demo-bad').addEventListener('click', () => onDemo('sick'));
  render();
}

boot();
