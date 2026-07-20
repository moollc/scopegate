/**
 * Pure scan logic — process health for AI workspaces.
 * Browser (or CLI/tests) supply text; this module scores.
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

export function estimateTokens(text) {
  return TOK((text || '').length);
}

export function lineCount(text) {
  if (!text) return 0;
  return text.split(/\r?\n/).length;
}

/** First N lines — rough "what cold start should open" */
export function pinSlice(text, maxLines = 80) {
  if (!text) return '';
  return text.split(/\r?\n/).slice(0, maxLines).join('\n');
}

/**
 * Host file roles relative to AGENTS.md
 * - stub: thin pointer
 * - index: cold-start / START HERE that routes to AGENTS first (may still be long)
 * - fork: independent rule novel
 * - invert_hint: used when scoring AGENTS that points at CLAUDE
 */
export function classifyHostFile(text) {
  if (text == null || text === '(directory present)') return 'unknown';
  if (text.length < 40) return 'stub';
  const head = text.slice(0, 2500);
  const tok = estimateTokens(text);

  const hasAgentsRef = /\bAGENTS\.md\b/i.test(head) || /@AGENTS\.md\b/i.test(head);
  const startHere =
    /\bSTART HERE\b/i.test(head) ||
    /\bread\s+(in order|first)\b/i.test(head) ||
    /0\.\s*\*\*`?AGENTS\.md/i.test(head);

  // Index / cold-start manuals (onboardin CLAUDE style) before thin-stub shortcuts
  if (hasAgentsRef && startHere) return 'index';
  if (/@AGENTS\.md\b/i.test(head) && tok < 800) return 'stub';
  if (
    hasAgentsRef &&
    (/\bsee\s+`?AGENTS\.md/i.test(head) ||
      /\bpoints?\s+at\s+`?AGENTS\.md/i.test(head) ||
      /\bbinding\b/i.test(head)) &&
    tok < 2500
  ) {
    return tok < 400 ? 'stub' : 'index';
  }
  if (tok < 350 && hasAgentsRef) return 'stub';
  if (tok > 400) return 'fork';
  return 'stub';
}

/** @deprecated use classifyHostFile — kept for tests */
export function looksLikeAgentsStub(text) {
  const c = classifyHostFile(text);
  return c === 'stub' || c === 'index';
}

export function hasResumePin(text) {
  if (!text) return false;
  return (
    /resume\s*pin/i.test(text) ||
    /##\s*resume\b/i.test(text) ||
    /PINNED:\s*Resume/i.test(text) ||
    /PINNED:\s*Cold start/i.test(text) ||
    /##\s*📌\s*PINNED/i.test(text) ||
    /PINNED:.*[Cc]old start/i.test(text)
  );
}

/** AGENTS that defers truth to CLAUDE/GEMINI (inverted always-on) */
export function agentsLooksInverted(agentsText) {
  if (!agentsText) return false;
  const head = agentsText.slice(0, 2000);
  const thin = estimateTokens(agentsText) < 500;
  const defers =
    /full process lives in\s*`?CLAUDE\.md/i.test(head) ||
    /see\s*`?CLAUDE\.md/i.test(head) ||
    /read\s*`?CLAUDE\.md`?\s*\+?\s*`?GEMINI\.md/i.test(head) ||
    /CLAUDE\.md`?\s*\+\s*`?GEMINI\.md/i.test(head);
  return thin && defers;
}

/**
 * @param {object} input
 * @param {string} input.rootName
 * @param {Record<string, string|null>} input.files
 * @param {string[]} input.topLevel
 * @param {number} [input.cursorRulesBytes] optional sum of .cursor/rules/*
 */
export function analyzeWorkspace(input) {
  const { rootName, files, topLevel, cursorRulesBytes = 0 } = input;
  const findings = [];
  const scores = [];

  const agents = files['AGENTS.md'];
  let agentsTok = 0;
  let agentsLines = 0;

  if (agents != null) {
    agentsLines = lineCount(agents);
    agentsTok = estimateTokens(agents);
    if (agentsLooksInverted(agents)) {
      scores.push({
        id: 'thin-agents',
        ok: false,
        label: 'AGENTS.md is inverted (stub → CLAUDE/GEMINI)',
        detail: `${agentsLines} lines ≈${agentsTok} tok — always-on truth may live in host files`,
      });
      findings.push(
        'Prefer binding rules in AGENTS.md; keep CLAUDE.md / GEMINI.md as thin pointers or host-only extras.',
      );
    } else if (agentsLines <= 200) {
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

  if (agents != null && hostPaths.length) {
    const forks = [];
    const indexes = [];
    const stubs = [];
    for (const p of hostPaths) {
      if (p === '.cursor/rules') {
        const kb = cursorRulesBytes > 0 ? ` ≈${Math.ceil(cursorRulesBytes / 4)} tok` : '';
        if (cursorRulesBytes > 12000) {
          forks.push(`.cursor/rules (${kb.trim()} — heavy path rules)`);
        } else {
          stubs.push(`.cursor/rules${kb ? ' ' + kb.trim() : ' (dir)'}`);
        }
        continue;
      }
      const role = classifyHostFile(files[p]);
      if (role === 'fork') forks.push(p);
      else if (role === 'index') indexes.push(`${p} (index→AGENTS)`);
      else stubs.push(p);
    }

    if (forks.length) {
      scores.push({
        id: 'rulebook-fork',
        ok: false,
        label: 'Rulebook forks detected',
        detail: forks.join(', '),
      });
      findings.push(
        'Host files should point at AGENTS.md (or stay tiny). Avoid parallel full rulebooks.',
      );
    } else if (indexes.length) {
      scores.push({
        id: 'rulebook-fork',
        ok: true,
        label: 'Host files are cold-start indexes',
        detail: indexes.concat(stubs).join(', ') || indexes.join(', '),
      });
      // Optional soft finding if index is huge
      for (const p of hostPaths) {
        if (p === '.cursor/rules') continue;
        if (classifyHostFile(files[p]) === 'index' && estimateTokens(files[p]) > 2000) {
          findings.push(
            `${p} routes to AGENTS but is still large (~${estimateTokens(files[p])} tok) — consider thinning to a short START HERE list.`,
          );
          break;
        }
      }
    } else {
      scores.push({
        id: 'rulebook-fork',
        ok: true,
        label: 'Host stubs OK',
        detail: stubs.join(', ') || 'none heavy',
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
    const pinned = hasResumePin(commsText);
    // Onboardin-style: Start here table without formal "Resume pin" still counts as routing surface
    const hasStartHere = /##\s*Start here\b/i.test(commsText) || /\bStart here\b/i.test(commsText.slice(0, 1500));

    if (pinned) {
      scores.push({
        id: 'pin',
        ok: true,
        label: 'Comms has a pin',
        detail: `${commsPath} · pin slice ≈${pinTok} tok vs full ≈${cTok} tok`,
      });
    } else if (hasStartHere) {
      scores.push({
        id: 'pin',
        ok: true,
        label: 'Comms has Start-here routing',
        detail: `${commsPath} · head ≈${pinTok} tok vs full ≈${cTok} tok — add explicit Resume pin when you can`,
      });
      findings.push(`Add a labeled **Resume pin** near the top of ${commsPath} (Start-here table helps but pin is clearer).`);
    } else {
      scores.push({ id: 'pin', ok: false, label: 'Comms lacks Resume pin', detail: commsPath });
      findings.push(`Add a **Resume pin** (or PINNED cold start) at the top of ${commsPath}.`);
    }

    if (cTok > 6000) {
      scores.push({
        id: 'comms-size',
        ok: false,
        label: 'Comms is a dump risk',
        detail: `${cLines} lines ≈${cTok} tok — load pin/head only (~${pinTok} tok)`,
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
  // Whitelist monorepo: git at parent but app subfolder ships (onboardin documents this)
  const documentsInnerShip =
    /only this (folder|directory) ships|ONLY this folder ships|git tracks `\w+\/`/i.test(
      files['CLAUDE.md'] || files['AGENTS.md'] || '',
    );

  if (hasGitAtRoot && hasScaffold && hasPackage && !documentsInnerShip) {
    scores.push({
      id: 'boundary',
      ok: false,
      label: 'Possible mixed workspace+repo',
      detail: 'git + package.json + scaffold at same root — confirm only app folder ships',
    });
    findings.push('Prefer workspace parent (AGENTS, scaffold) outside the git repo folder.');
  } else if (hasGitAtRoot && hasScaffold && documentsInnerShip) {
    scores.push({
      id: 'boundary',
      ok: true,
      label: 'Parent git with documented app ship path',
      detail: 'Whitelist-style layout (app subfolder ships)',
    });
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

  const hasMulti =
    files['scaffold/MULTI-CLI.md'] != null || files['scaffolds/MULTI-CLI.md'] != null;
  const childVerify = Object.keys(files).some(
    (k) => k.endsWith('scripts/verify-workspace.mjs') && files[k] != null,
  );
  if (hasMulti || childVerify) {
    scores.push({
      id: 'kit-cues',
      ok: true,
      label: 'Kit cues found',
      detail: [hasMulti && 'MULTI-CLI', childVerify && 'verify-workspace'].filter(Boolean).join(', '),
    });
  } else if (agents != null) {
    scores.push({
      id: 'kit-cues',
      ok: true,
      label: 'No multi-CLI / verify at scan depth',
      detail: 'Fine for simple tools',
    });
  }

  const okCount = scores.filter((s) => s.ok).length;
  const grade =
    okCount === scores.length ? 'A' : okCount >= scores.length - 1 ? 'B' : okCount >= scores.length / 2 ? 'C' : 'D';

  const pinTok = commsText ? estimateTokens(pinSlice(commsText)) : 0;
  const commsTok = commsText ? estimateTokens(commsText) : 0;
  const coldTok = agentsTok + pinTok;
  const fullTok = agentsTok + commsTok;

  const coldStart = buildColdStartPack({
    rootName,
    agentsPath: agents != null ? 'AGENTS.md' : null,
    agentsLines,
    agentsTok,
    commsPath,
    pinTok,
    coldTok,
    fullTok,
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
      commsTok,
      pinTok,
      coldTok,
      fullTok,
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
  coldTok,
  fullTok,
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
  if (fullTok > coldTok && fullTok > 0) {
    const pct = Math.round((1 - coldTok / fullTok) * 100);
    lines.push(
      `**Load budget:** cold-start ~${coldTok} tok vs AGENTS+full comms ~${fullTok} tok (≈${pct}% less if pin/head only).`,
    );
    lines.push('');
  }
  lines.push('## Open first');
  lines.push('');
  if (agentsPath) lines.push(`1. \`${agentsPath}\` (≈${agentsLines} lines / ~${agentsTok} tokens) — binding rules`);
  else lines.push('1. _(missing)_ `AGENTS.md` — create before multi-LM work');
  if (commsPath) {
    lines.push(
      `2. \`${commsPath}\` — **pin / Start-here / latest handoff only**` +
        (pinTok ? ` (~${pinTok} tok head)` : ''),
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
        'AGENTS.md': '# bloated rules\n' + 'rule line\n'.repeat(250),
        'CLAUDE.md': 'Full duplicate rulebook with no agents pointer.\n' + 'x'.repeat(5000),
        'work/comms.md': 'no pin section\n' + 'old entry\n'.repeat(3000),
        'WORKSPACE_SETUP.md': 'w'.repeat(100000),
        'package.json': '{}',
      },
    },
    /** Mirrors onboardin-ish: START HERE CLAUDE + fat comms + pin */
    layered: {
      rootName: 'demo-layered-workspace',
      topLevel: ['AGENTS.md', 'work', 'onboardin'],
      files: {
        'AGENTS.md': '# Rules\n\n## Efficiency\n\n- Lead with outcome\n'.repeat(5),
        'CLAUDE.md':
          '# Project\n\n## START HERE (read in order)\n\n0. **`AGENTS.md`** binding.\n1. **`work/comms.md`** pin.\n\n## Extra context\n' +
          'stack notes\n'.repeat(80),
        'work/comms.md':
          '## Start here\n\n| Need | Go |\n|---|---|\n| Cold | pin |\n\n## 📌 PINNED: Cold start — agent briefing\n\n### Resume pin\n\nfocus: ship\n\n## Log\n' +
          'old handoff entry with enough bulk to trip dump detection\n'.repeat(500),
      },
    },
  };
}

export { RULE_CANDIDATES, COMMS_CANDIDATES, KIT_CUE_PATHS };
