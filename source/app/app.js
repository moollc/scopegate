import { pickWorkspace, readTextFile, mapFromWebkitFiles } from '../shared/file-bridge.js';
import { context, folderPickHint } from '../shared/permissions.js';
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
  $('rescan-btn').disabled = !state.canRescan;

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
    status.textContent = folderPickHint();
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

function baseWantedPaths(topLevel) {
  const paths = [
    ...RULE_CANDIDATES,
    ...COMMS_CANDIDATES,
    ...KIT_CUE_PATHS,
    'WORKSPACE_SETUP.md',
    'package.json',
    'START_HERE.md',
    'work/ORCHESTRATION.md',
    'DEVELOPER_WORKSPACE_RULES.md',
  ];
  for (const name of topLevel) {
    if (name === 'scaffold' || name === 'scaffolds' || name.startsWith('.')) continue;
    paths.push(`${name}/scripts/verify-workspace.mjs`);
    paths.push(`${name}/package.json`);
  }
  return [...new Set(paths)];
}

async function loadOptionalHandle(dir, path) {
  try {
    return await readTextFile(dir, path);
  } catch {
    return null;
  }
}

async function scanFromHandle(dirHandle) {
  const topLevel = [];
  for await (const [name] of dirHandle.entries()) topLevel.push(name);

  const wanted = baseWantedPaths(topLevel);
  const files = {};
  for (const p of wanted) files[p] = await loadOptionalHandle(dirHandle, p);
  if (topLevel.includes('.cursor')) files['.cursor/rules'] = '(directory present)';

  let cursorRulesBytes = 0;
  // optional: not walked deeply via handle for speed

  return analyzeWorkspace({
    rootName: dirHandle.name,
    files,
    topLevel,
    cursorRulesBytes,
  });
}

async function scanFromWebkitFiles(rootName, fileList) {
  const topSet = new Set();
  let cursorRulesBytes = 0;
  for (const file of fileList) {
    const raw = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
    const parts = raw.split('/');
    if (parts.length >= 2) topSet.add(parts[1]);
    // .cursor/rules/*
    const rel = parts.length > 1 ? parts.slice(1).join('/') : parts[0];
    if (rel.startsWith('.cursor/rules/') && !rel.endsWith('/')) {
      cursorRulesBytes += file.size || 0;
    }
  }
  const topLevel = [...topSet];
  const wanted = baseWantedPaths(topLevel);
  const { map } = await mapFromWebkitFiles(fileList, wanted);
  if (topLevel.includes('.cursor') || cursorRulesBytes > 0) {
    map['.cursor/rules'] = map['.cursor/rules'] || '(directory present)';
  }

  return analyzeWorkspace({
    rootName,
    files: map,
    topLevel,
    cursorRulesBytes,
  });
}

async function runScan(pick) {
  state.scanning = true;
  state.demoMode = false;
  state.error = null;
  render();
  try {
    let report;
    if (pick.kind === 'handle') {
      state.dirHandle = pick.handle;
      state.webkitFiles = null;
      state.canRescan = true;
      report = await scanFromHandle(pick.handle);
    } else {
      state.dirHandle = null;
      state.webkitFiles = pick.files;
      state.webkitRootName = pick.rootName;
      state.canRescan = true;
      report = await scanFromWebkitFiles(pick.rootName, pick.files);
    }
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
    const pick = await pickWorkspace();
    await runScan(pick);
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

async function onRescan() {
  if (state.dirHandle) {
    await runScan({ kind: 'handle', handle: state.dirHandle });
  } else if (state.webkitFiles?.length) {
    await runScan({
      kind: 'files',
      rootName: state.webkitRootName || 'workspace',
      files: state.webkitFiles,
    });
  }
}

function onDemo(kind) {
  const fixtures = demoFixtures();
  const fix = fixtures[kind];
  if (!fix) return;
  state.dirHandle = null;
  state.webkitFiles = null;
  state.canRescan = false;
  state.demoMode = true;
  state.error = null;
  setReport(analyzeWorkspace(fix));
  render();
}

export function boot() {
  state.canRescan = false;
  $('pick-btn').addEventListener('click', onPick);
  $('copy-btn').addEventListener('click', onCopy);
  $('download-btn').addEventListener('click', onDownload);
  $('rescan-btn').addEventListener('click', onRescan);
  $('demo-good').addEventListener('click', () => onDemo('healthy'));
  $('demo-bad').addEventListener('click', () => onDemo('sick'));
  // Show secure/context hint once in console for debugging Pages issues
  console.info('Scopegate context', {
    secure: context.secure,
    hasFilePicker: context.hasFilePicker,
    hasWebkitDirectory: context.hasWebkitDirectory,
    origin: location.origin,
  });
  render();
}

boot();
