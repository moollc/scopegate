/**
 * Pure scan logic — process health for AI workspaces.
 * Browser (or tests) supply text; this module scores.
 */

const TOK = (chars) => Math.ceil(chars / 4);

const RULE_CANDIDATES = [
  'AGENTS.md',
  'CLAUDE.md',
  'GEMINI.md',
  '.cursorrules',
  '.github/copilot-instructions.md',
];

const COMMS_CANDIDATES = [
  'scaffold/comms.md',
  'scaffolds/comms.md',
  'work/comms.md',
  'scaffold/communication.md',
];

const KIT_CUE_PATHS = [
  'scaffold/MULTI-CLI.md',
  'scaffolds/MULTI-CLI.md',
  'scripts/verify-workspace.mjs',
  'scopegate/scripts/verify-workspace.mjs',
];

/** Host file points at AGENTS instead of forking a novel */
export function looksLikeAgentsStub(text) {
  if (text == null || text === '(directory present)') return false;
  if (text.length < 40) return true;
  const t = text.slice(0, 4000);
  if (/@AGENTS\.md\b/i.test(t)) return true;
  if (/\bsee\s+`?AGENTS\.md`?\b/i.test(t)) return true;
  if (/\bpoints?\s+at\s+`?AGENTS\.md`?\b/i.test(t)) return true;
  if (/\bread\s+`?AGENTS\.md`?\b/i.test(t) && estimateTokens(text) < 600) return true;
  if (estimateTokens(text) < 350 && /\bAGENTS\.md\b/i.test(t)) return true;
  return false;
}

/** First ~80 lines or through first major section after pin — rough pin slice */
export function pinSlice(text, maxLines = 80) {
  if (!text) return '';
  const lines = text.split(/\r?\n/);
  const head = lines.slice(0, maxLines).join('\n');
  return head;
}

export function estimateTokens(text) {
  return TOK((text || '').length);
}

export function lineCount(text) {
  if (!text) return 0;
  return text.split(/\r?\n/).length;
}

/**
 * @param {object} input
 * @param {string} input.rootName
 * @param {Record<string, string|null>} input.files path -> content or null if missing
 * @param {string[]} input.topLevel names at root
 */
export function analyzeWorkspace(input) {
  const { rootName, files, topLevel } = input;
  const findings = [];
  const scores = [];

  const agents = files['AGENTS.md'];

  let agentsTok = 0;
  let agentsLines = 0;
  if (agents != null) {
    agentsLines = lineCount(agents);
    agentsTok = estimateTokens(agents);
    if (agentsLines <= 200) {
      scores.push({
        id: 'thin-agents',
        ok: true,
        label: 'AGENTS.md thin enough',
        detail: `${agentsLines} lines ≈${agentsTok} tok`,
      });
    } else {
      scores.push({
        id: 'thin-agents',
        ok: false,
        label: 'AGENTS.md is heavy',
        detail: `${agentsLines} lines ≈${agentsTok} tok — prefer under ~200 lines`,
      });
      findings.push('Split procedures out of AGENTS.md into scaffold topic files.');
    }
  } else {
    scores.push({
      id: 'thin-agents',
      ok: false,
      label: 'No AGENTS.md',
      detail: 'Multi-LM workspaces need one binding rulebook',
    });
    findings.push('Add workspace-root AGENTS.md (rules + pointers only).');
  }

  const hostPaths = RULE_CANDIDATES.filter((p) => p !== 'AGENTS.md' && files[p] != null);
  const cursorRules = topLevel.includes('.cursor');
  if (cursorRules) hostPaths.push('.cursor/rules');

  if (agents != null && (hostPaths.length || cursorRules)) {
    const realForks = [];
    const stubs = [];
    for (const p of hostPaths) {
      if (p === '.cursor/rules') {
        stubs.push(p + ' (dir — treat as path-scoped; keep thin)');
        continue;
      }
      const body = files[p];
      if (looksLikeAgentsStub(body)) stubs.push(p);
      else if (estimateTokens(body) > 400) realForks.push(p);
      else stubs.push(p + ' (short)');
    }
    if (realForks.length) {
      scores.push({
        id: 'rulebook-fork',
        ok: false,
        label: 'Rulebook forks detected',
        detail: realForks.join(', ') + ' — should point at AGENTS.md',
      });
      findings.push(
        'Make CLAUDE.md / GEMINI.md / Cursor rules import or point at AGENTS.md; do not maintain parallel novels.',
      );
    } else {
      scores.push({
        id: 'rulebook-fork',
        ok: true,
        label: 'Host stubs OK',
        detail: stubs.length ? stubs.join(', ') : 'no heavy host files',
      });
    }
  } else if (agents != null) {
    scores.push({ id: 'rulebook-fork', ok: true, label: 'Single primary rule surface', detail: 'AGENTS.md' });
  }

  let commsPath = null;
  let commsText = null;
  for (const p of COMMS_CANDIDATES) {
    if (files[p] != null) {
      commsPath = p;
      commsText = files[p];
      break;
    }
  }

  if (commsText != null) {
    const cTok = estimateTokens(commsText);
    const cLines = lineCount(commsText);
    const pinTok = estimateTokens(pinSlice(commsText));
    const hasPin = /resume\s*pin|##\s*resume/i.test(commsText);
    if (hasPin) {
      scores.push({
        id: 'pin',
        ok: true,
        label: 'Comms has a pin',
        detail: `${commsPath} · pin slice ≈${pinTok} tok vs full ≈${cTok} tok`,
      });
    } else {
      scores.push({ id: 'pin', ok: false, label: 'Comms lacks Resume pin', detail: commsPath });
      findings.push(`Add a **Resume pin** section at the top of ${commsPath}.`);
    }
    if (cTok > 8000) {
      scores.push({
        id: 'comms-size',
        ok: false,
        label: 'Comms is a dump risk',
        detail: `${cLines} lines ≈${cTok} tok — agents should load pin slice only (~${pinTok} tok)`,
      });
      findings.push('Do not tell agents to read comms completely. Compress/archive old entries.');
    } else {
      scores.push({ id: 'comms-size', ok: true, label: 'Comms size OK', detail: `≈${cTok} tok` });
    }
  } else {
    scores.push({
      id: 'pin',
      ok: false,
      label: 'No comms / handoff file',
      detail: 'scaffold/comms.md recommended',
    });
    findings.push('Add scaffold/comms.md with a Resume pin for cross-session handoff.');
  }

  const hasGitAtRoot = topLevel.includes('.git');
  const hasPackage = topLevel.includes('package.json') || files['package.json'] != null;
  const hasScaffold =
    topLevel.includes('scaffold') || topLevel.includes('scaffolds') || topLevel.includes('work');

  if (hasGitAtRoot && hasScaffold && hasPackage) {
    scores.push({
      id: 'boundary',
      ok: false,
      label: 'Possible mixed workspace+repo',
      detail: 'git + package.json + scaffold at same root — confirm only app folder ships',
    });
    findings.push('Prefer workspace parent (AGENTS, scaffold) outside the git repo folder.');
  } else if (hasScaffold || agents != null) {
    scores.push({
      id: 'boundary',
      ok: true,
      label: 'Workspace markers found',
      detail: hasScaffold ? 'scaffold/work present' : 'AGENTS present',
    });
  } else {
    scores.push({
      id: 'boundary',
      ok: true,
      label: 'Layout inconclusive',
      detail: 'Opened folder may be repo-only',
    });
  }

  const setup = files['WORKSPACE_SETUP.md'];
  if (setup != null) {
    const sTok = estimateTokens(setup);
    scores.push({
      id: 'setup-tax',
      ok: true,
      label: sTok < 5000 ? 'Setup doc modest' : 'Mother setup present (genesis library)',
      detail: `WORKSPACE_SETUP.md ≈${sTok} tok — not daily always-on`,
    });
    if (sTok >= 5000) findings.push('Daily agents: load AGENTS + pin, not full WORKSPACE_SETUP.md.');
  }

  // Kit level cues (optional — ok either way, info score)
  const hasMulti =
    files['scaffold/MULTI-CLI.md'] != null || files['scaffolds/MULTI-CLI.md'] != null;
  const hasVerify =
    files['scripts/verify-workspace.mjs'] != null ||
    files['scopegate/scripts/verify-workspace.mjs'] != null ||
    topLevel.some((n) => n.endsWith('-workspace') === false && false);
  // also: child repo with verify
  const childVerify = Object.keys(files).some((k) => k.endsWith('scripts/verify-workspace.mjs'));
  if (hasMulti || hasVerify || childVerify) {
    scores.push({
      id: 'kit-cues',
      ok: true,
      label: 'Kit cues found',
      detail: [hasMulti && 'MULTI-CLI', (hasVerify || childVerify) && 'verify-workspace'].filter(Boolean).join(', '),
    });
  } else if (agents != null) {
    scores.push({
      id: 'kit-cues',
      ok: true,
      label: 'No multi-CLI / verify at scan depth',
      detail: 'Fine for simple tools; add when orchestrating multiple LMs',
    });
  }

  const okCount = scores.filter((s) => s.ok).length;
  const grade =
    okCount === scores.length ? 'A' : okCount >= scores.length - 1 ? 'B' : okCount >= scores.length / 2 ? 'C' : 'D';

  const coldStart = buildColdStartPack({
    rootName,
    agentsPath: agents != null ? 'AGENTS.md' : null,
    agentsLines,
    agentsTok,
    commsPath,
    pinTok: commsText ? estimateTokens(pinSlice(commsText)) : 0,
    findings,
    scores,
  });

  return {
    rootName,
    grade,
    scores,
    findings,
    coldStart,
    metrics: {
      agentsLines,
      agentsTok,
      commsTok: commsText ? estimateTokens(commsText) : 0,
      pinTok: commsText ? estimateTokens(pinSlice(commsText)) : 0,
    },
  };
}

function buildColdStartPack({
  rootName,
  agentsPath,
  agentsLines,
  agentsTok,
  commsPath,
  pinTok,
  findings,
  scores,
}) {
  const lines = [];
  lines.push(`# Cold Start Pack — ${rootName}`);
  lines.push('');
  lines.push(
    'Any LM: open **only** these paths for a normal session. Do not dump the monorepo or full history.',
  );
  lines.push('');
  lines.push('## Open first');
  lines.push('');
  if (agentsPath) lines.push(`1. \`${agentsPath}\` (≈${agentsLines} lines / ~${agentsTok} tokens) — binding rules`);
  else lines.push('1. _(missing)_ `AGENTS.md` — create before multi-LM work');
  if (commsPath) {
    lines.push(
      `2. \`${commsPath}\` — **Resume pin + latest handoff only**` +
        (pinTok ? ` (pin slice ~${pinTok} tok if you truncate)` : ''),
    );
  } else lines.push('2. _(missing)_ handoff file — add `scaffold/comms.md` pin');
  lines.push('3. Task-specific files only after that (ticket, path the user named)');
  lines.push('');
  lines.push('## Do not open by default');
  lines.push('');
  lines.push('- Full `WORKSPACE_SETUP.md` (genesis/repair only)');
  lines.push('- Entire comms archive / multi-month logs');
  lines.push('- Host auto-memory dumps as a substitute for shared rules');
  lines.push('');
  lines.push('## Health snapshot');
  lines.push('');
  for (const s of scores) {
    lines.push(`- ${s.ok ? 'OK' : 'FIX'}: ${s.label} — ${s.detail}`);
  }
  if (findings.length) {
    lines.push('');
    lines.push('## Suggested fixes');
    lines.push('');
    findings.forEach((f, i) => lines.push(`${i + 1}. ${f}`));
  }
  lines.push('');
  lines.push('_Generated by Scopegate — verify against disk, not vibes._');
  return lines.join('\n');
}

/** Built-in demos for first-run (no folder picker) */
export function demoFixtures() {
  return {
    healthy: {
      rootName: 'demo-healthy-workspace',
      topLevel: ['AGENTS.md', 'scaffold', 'myapp'],
      files: {
        'AGENTS.md':
          '# Demo — agent rules\n\n## Deduce before implement\n\nAdopt / reject / defer.\n\n## Context load\n\n- Pin first\n- Tools over paste\n',
        'CLAUDE.md': '@AGENTS.md\n\nClaude-only: use plan mode for billing/.\n',
        'scaffold/comms.md':
          '## Resume pin\n\nCurrent focus: ship feature X\nNext: verify smoke\nEvidence: tests green\n\n## Log\n\n### day 1\n- init\n',
        'scaffold/MULTI-CLI.md': '# multi-cli\nComposer Fast: grok-composer-2.5-fast\n',
      },
    },
    sick: {
      rootName: 'demo-sick-workspace',
      topLevel: ['.git', 'package.json', 'scaffold', 'AGENTS.md'],
      files: {
        'AGENTS.md': ('# bloated rules\n' + 'rule line\n'.repeat(250)).repeat(1),
        'CLAUDE.md': 'Full duplicate rulebook.\n' + 'x'.repeat(5000),
        'work/comms.md': 'no pin section\n' + 'old entry\n'.repeat(3000),
        'WORKSPACE_SETUP.md': 'w'.repeat(100000),
        'package.json': '{}',
      },
    },
  };
}

export { RULE_CANDIDATES, COMMS_CANDIDATES, KIT_CUE_PATHS };
