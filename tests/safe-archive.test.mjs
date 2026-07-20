import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { chooseKeepLineCount } from '../source/app/safe-archive.js';

describe('chooseKeepLineCount', () => {
  it('honors explicit keep-lines', () => {
    assert.equal(chooseKeepLineCount('a\n'.repeat(100), 50), 50);
  });

  it('cuts at ## Log after pin region', () => {
    const lines = [];
    for (let i = 0; i < 50; i++) lines.push(`pin line ${i}`);
    lines.push('## Log');
    lines.push('old entry');
    assert.equal(chooseKeepLineCount(lines.join('\n'), null), 50);
  });

  it('falls through when Log only appears early', () => {
    const lines = ['## Log', 'x'];
    while (lines.length < 30) lines.push('y');
    const n = chooseKeepLineCount(lines.join('\n'), null);
    assert.ok(n >= 30);
  });
});
