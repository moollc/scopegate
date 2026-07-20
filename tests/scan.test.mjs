import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyzeWorkspace,
  looksLikeAgentsStub,
  pinSlice,
  demoFixtures,
} from '../source/app/scan.js';

describe('looksLikeAgentsStub', () => {
  it('detects @AGENTS.md import', () => {
    assert.equal(looksLikeAgentsStub('@AGENTS.md\n\nextra note\n'), true);
  });
  it('flags large duplicate rulebook', () => {
    assert.equal(looksLikeAgentsStub('x'.repeat(5000)), false);
  });
});

describe('analyzeWorkspace', () => {
  it('grades healthy demo as A/B', () => {
    const r = analyzeWorkspace(demoFixtures().healthy);
    assert.ok(['A', 'B'].includes(r.grade), r.grade);
    assert.ok(r.coldStart.includes('Cold Start Pack'));
    assert.ok(r.scores.some((s) => s.id === 'pin' && s.ok));
  });

  it('grades sick demo poorly', () => {
    const r = analyzeWorkspace(demoFixtures().sick);
    assert.ok(['C', 'D'].includes(r.grade), r.grade);
    assert.ok(r.findings.length >= 2);
  });

  it('pin slice is smaller than full dump', () => {
    const full = '## Resume pin\nfocus\n\n' + 'old\n'.repeat(5000);
    assert.ok(pinSlice(full).length < full.length);
  });
});
