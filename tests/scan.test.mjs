import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeWorkspace,
  looksLikeAgentsStub,
  classifyHostFile,
  pinSlice,
  hasResumePin,
  agentsLooksInverted,
  hasLocalAbsolutePaths,
  demoFixtures,
} from '../source/app/scan.js';

describe('classifyHostFile', () => {
  it('detects @AGENTS stub', () => {
    assert.equal(classifyHostFile('@AGENTS.md\n\nextra\n'), 'stub');
    assert.equal(looksLikeAgentsStub('@AGENTS.md\n'), true);
  });
  it('detects START HERE index like onboardin CLAUDE', () => {
    const t =
      '# X\n\n## START HERE (read in order)\n\n0. **`AGENTS.md`** binding.\n1. work/comms.md\n\n' +
      'more\n'.repeat(100);
    assert.equal(classifyHostFile(t), 'index');
  });
  it('flags pure fork', () => {
    assert.equal(classifyHostFile('rules only no agents\n' + 'x'.repeat(5000)), 'fork');
  });
});

describe('pins', () => {
  it('detects PINNED cold start', () => {
    assert.equal(hasResumePin('## 📌 PINNED: Cold start — agent briefing\n'), true);
  });
  it('detects PINNED Resume pin', () => {
    assert.equal(hasResumePin('## PINNED: Resume pin\n'), true);
  });
});

describe('inverted AGENTS', () => {
  it('flags thin AGENTS that defers to CLAUDE', () => {
    const a =
      '# app\n\nFull process lives in `CLAUDE.md` + `GEMINI.md`.\n\n## Cold start\n1. CLAUDE\n';
    assert.equal(agentsLooksInverted(a), true);
  });
});

describe('portable paths', () => {
  it('flags drive-letter paths', () => {
    assert.equal(hasLocalAbsolutePaths('root is X:\\Projects\\app'), true);
    assert.equal(hasLocalAbsolutePaths('see `AGENTS.md` and scaffold/'), false);
  });
  it('flags file:// machine URLs', () => {
    assert.equal(hasLocalAbsolutePaths('file:///c:/Users/someone/Desktop/x'), true);
  });
});

describe('analyzeWorkspace', () => {
  it('grades healthy demo A/B', () => {
    const r = analyzeWorkspace(demoFixtures().healthy);
    assert.ok(['A', 'B'].includes(r.grade), r.grade);
    assert.ok(r.coldStart.includes('Cold Start Pack'));
  });

  it('grades sick demo poorly', () => {
    const r = analyzeWorkspace(demoFixtures().sick);
    assert.ok(['C', 'D'].includes(r.grade), r.grade);
    assert.ok(r.findings.length >= 2);
  });

  it('layered onboardin-like: index not hard fork', () => {
    const r = analyzeWorkspace(demoFixtures().layered);
    const fork = r.scores.find((s) => s.id === 'rulebook-fork');
    assert.ok(fork?.ok, 'index should be ok: ' + fork?.detail);
    assert.ok(r.scores.find((s) => s.id === 'comms-size' && !s.ok));
    assert.ok(r.metrics.fullTok > r.metrics.coldTok);
  });

  it('pin slice smaller than dump', () => {
    const full = '## Resume pin\nfocus\n\n' + 'old\n'.repeat(5000);
    assert.ok(pinSlice(full).length < full.length);
  });

  it('includes paste briefing and savings metrics', () => {
    const r = analyzeWorkspace(demoFixtures().layered);
    assert.ok(r.briefing.includes('Agent briefing'));
    assert.ok(r.briefing.includes('Open only') || r.briefing.includes('Open first'));
    assert.ok(r.metrics.savingsPct > 0);
  });

  it('briefing is paste-safe (no blank lines)', () => {
    const r = analyzeWorkspace(demoFixtures().layered);
    assert.ok(!/\n\n/.test(r.briefing), 'blank lines break terminal/chat paste');
  });
});

