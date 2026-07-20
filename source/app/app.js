import { pickWorkspace, readTextFile, mapFromWebkitFiles } from '../shared/file-bridge.js';
import { context, folderPickHint, privacyFootnote, fileListPickNote } from '../shared/permissions.js';
import {
  analyzeWorkspace,
  RULE_CANDIDATES,
  COMMS_CANDIDATES,
  KIT_CUE_PATHS,
  demoFixtures,
} from './scan.js';
import { state, setReport, setError } from './state.js';

const $ = (id) => document.getElementById(id);

function accessBlurb() {
  if (state.demoMode) return 'demo fixtures (no folder)';
  if (state.accessMode === 'directory-handle') {
    return 'local folder grant · read-only · process paths only · nothing uploaded';
  }
  if (state.accessMode === 'local-file-list') {
    const n = state.listedFileCount;
    const bulk =
      n > 2000
        ? ` · browser listed ${n} files (prefer Chrome folder grant or CLI for huge trees)`
        : n > 0
          ? ` · browser listed ${n} paths; only process files scored`
          : '';
    return `local only (no server)${bulk} · dialog may say “Upload” — that is not a cloud upload`;
  }
  return '';
}

function render() {
  const status = $('status');
  const scoresEl = $('scores');
  const findingsEl = $('findings');
  const packEl = $('pack');
  const gradeEl = $('grade');
  const hasPack = Boolean(state.report?.coldStart);
  const privacy = $('privacy-note');
  if (privacy) privacy.textContent = privacyFootnote();

  const briefBtn = $('brief-btn');
  $('copy-btn').disabled = !hasPack;
  if (briefBtn) briefBtn.disabled = !hasPack;
  $('download-btn').disabled = !hasPack;
  $('rescan-btn').disabled = !state.canRescan;

  const budget = $('budget');
  const briefEl = $('brief');

  if (state.scanning) {
    status.textContent =
      state.accessMode === 'local-file-list'
        ? 'Reading process files only (local)…'
        : 'Scanning local process files…';
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
    if (briefEl) briefEl.textContent = '';
    if (budget) budget.hidden = true;
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
    if (briefEl) briefEl.textContent = '';
    if (budget) budget.hidden = true;
    return;
  }

  const r = state.report;
  const mode = state.demoMode
    ? `Demo · ${r.rootName}`
    : `Scanned: ${r.rootName} · ${accessBlurb()}`;
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
  if (briefEl) briefEl.textContent = r.briefing || '';

  const m = r.metrics || {};
  if (budget && m.fullTok > 0) {
    budget.hidden = false;
    const pct = Math.min(100, Math.round((m.coldTok / m.fullTok) * 100)) || 1;
    const fill = $('budget-cold');
    if (fill) fill.style.width = `${pct}%`;
    const bt = $('budget-text');
    if (bt) {
      bt.textContent =
        m.savingsPct > 0
          ? `~${m.coldTok} cold / ~${m.fullTok} dump (≈${m.savingsPct}% less if pin-only)`
          : `~${m.coldTok} tok cold-start`;
    }
  } else if (budget) {
    budget.hidden = true;
  }
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
  state.accessMode = pick.access || (pick.kind === 'handle' ? 'directory-handle' : 'local-file-list');
  state.listedFileCount = pick.kind === 'files' ? pick.files?.length || 0 : 0;
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
      const n = pick.files?.length || 0;
      if (n > 2000) {
        report.findings = [
          ...(report.findings || []),
          `Browser handed ${n} file entries for this folder pick. Scopegate only scored process paths — for large monorepos prefer Chrome/Edge directory picker or: npm run scan -- <workspace-parent>`,
        ];
      }
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
  const status = $('status');
  if (status) {
    status.textContent = 'Choose a local workspace folder…';
    status.dataset.tone = 'muted';
  }
  try {
    const pick = await pickWorkspace({
      beforeFileListPick: () => {
        if (status) {
          status.textContent = fileListPickNote();
          status.dataset.tone = 'muted';
        }
      },
    });
    await runScan(pick);
  } catch (e) {
    if (e?.name === 'AbortError') {
      // Was silent — looked like "open folder, nothing happens" when cancel raced the pick
      state.error = null;
      state.report = null;
      state.scanning = false;
      if (status) {
        status.textContent =
          'Folder pick cancelled or no files received. Try again, use Demo buttons, or: npm run scan -- <workspace>';
        status.dataset.tone = 'muted';
      }
      return;
    }
    console.error('Scopegate pick/scan failed', e);
    setError(e);
    render();
  }
}

function flashBtn(id, label, temp) {
  const btn = $(id);
  if (!btn) return;
  const prev = btn.textContent;
  btn.textContent = temp;
  setTimeout(() => {
    btn.textContent = label || prev;
  }, 1500);
}

function onCopy() {
  if (!state.report?.coldStart) return;
  navigator.clipboard.writeText(state.report.coldStart).then(() => {
    flashBtn('copy-btn', 'Copy pack', 'Copied');
  });
}

function onCopyBrief() {
  if (!state.report?.briefing) return;
  navigator.clipboard.writeText(state.report.briefing).then(() => {
    flashBtn('brief-btn', 'Copy briefing', 'Copied');
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
    await runScan({ kind: 'handle', handle: state.dirHandle, access: 'directory-handle' });
  } else if (state.webkitFiles?.length) {
    await runScan({
      kind: 'files',
      rootName: state.webkitRootName || 'workspace',
      files: state.webkitFiles,
      access: 'local-file-list',
    });
  }
}

function onDemo(kind) {
  const fixtures = demoFixtures();
  const fix = fixtures[kind];
  if (!fix) return;
  state.dirHandle = null;
  state.webkitFiles = null;
  state.accessMode = null;
  state.listedFileCount = 0;
  state.canRescan = false;
  state.demoMode = true;
  state.error = null;
  setReport(analyzeWorkspace(fix));
  render();
}

export function boot() {
  state.canRescan = false;
  const pickBtn = $('pick-btn');
  if (pickBtn) {
    pickBtn.title =
      'Choose a local workspace folder. Read-only. Nothing is uploaded to a server. Only process files are scored.';
  }
  pickBtn.addEventListener('click', onPick);
  $('copy-btn').addEventListener('click', onCopy);
  const briefBtn = $('brief-btn');
  if (briefBtn) briefBtn.addEventListener('click', onCopyBrief);
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
