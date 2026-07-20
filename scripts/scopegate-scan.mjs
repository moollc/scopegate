#!/usr/bin/env node
/**
 * Headless Scopegate — multi-CLI agents and CI.
 *
 *   node scripts/scopegate-scan.mjs <workspace-parent>
 *   node scripts/scopegate-scan.mjs . --json
 *   node scripts/scopegate-scan.mjs . --pack > cold-start.md
 *   node scripts/scopegate-scan.mjs . --fail-under=B
 *   node scripts/scopegate-scan.mjs . --out=pack.md
 */
import { readFileSync, existsSync, readdirSync, statSync, writeFileSync } from 'fs';
import { join, resolve, basename } from 'path';
import {
  analyzeWorkspace,
  RULE_CANDIDATES,
  COMMS_CANDIDATES,
  KIT_CUE_PATHS,
} from '../source/app/scan.js';

const args = process.argv.slice(2);
const json = args.includes('--json');
const packOnly = args.includes('--pack');
const failUnder = args.find((a) => a.startsWith('--fail-under='))?.split('=')[1];
const outFile = args.find((a) => a.startsWith('--out='))?.split('=')[1];
const pathArg = args.find((a) => !a.startsWith('--'));
const root = resolve(pathArg || process.cwd());

const GRADE_RANK = { A: 4, B: 3, C: 2, D: 1, F: 0 };

function tryRead(rel) {
  const p = join(root, rel);
  if (!existsSync(p)) return null;
  try {
    if (!statSync(p).isFile()) return null;
    return readFileSync(p, 'utf8');
  } catch {
    return null;
  }
}

function sumCursorRules() {
  const dir = join(root, '.cursor', 'rules');
  if (!existsSync(dir)) return 0;
  let n = 0;
  try {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isFile()) n += statSync(p).size;
    }
  } catch {
    /* ignore */
  }
  return n;
}

if (!existsSync(root) || !statSync(root).isDirectory()) {
  console.error(`Not a directory: ${root}`);
  process.exit(1);
}

const topLevel = readdirSync(root);
const paths = new Set([
  ...RULE_CANDIDATES,
  ...COMMS_CANDIDATES,
  ...KIT_CUE_PATHS,
  'WORKSPACE_SETUP.md',
  'package.json',
]);

for (const name of topLevel) {
  if (name.startsWith('.') || name === 'scaffold' || name === 'scaffolds' || name === 'node_modules') {
    continue;
  }
  paths.add(`${name}/scripts/verify-workspace.mjs`);
  paths.add(`${name}/package.json`);
}

const files = {};
for (const p of paths) files[p] = tryRead(p);
if (topLevel.includes('.cursor')) files['.cursor/rules'] = '(directory present)';

const report = analyzeWorkspace({
  rootName: basename(root),
  files,
  topLevel,
  cursorRulesBytes: sumCursorRules(),
});

if (outFile) writeFileSync(outFile, report.coldStart, 'utf8');

if (packOnly) {
  process.stdout.write(report.coldStart.endsWith('\n') ? report.coldStart : report.coldStart + '\n');
} else if (json) {
  console.log(JSON.stringify(report, null, 2));
} else {
  console.log(`Scopegate  ${report.rootName}  grade=${report.grade}`);
  console.log(`path       ${root}`);
  console.log('');
  for (const s of report.scores) {
    console.log(`${s.ok ? 'OK ' : 'FIX'}  ${s.label}`);
    console.log(`     ${s.detail}`);
  }
  if (report.findings.length) {
    console.log('\nFixes:');
    report.findings.forEach((f, i) => console.log(`  ${i + 1}. ${f}`));
  }
  const m = report.metrics;
  if (m.fullTok > m.coldTok && m.commsTok > 0) {
    const pct = Math.round((1 - m.coldTok / m.fullTok) * 100);
    console.log(
      `\nLoad budget  cold-start ~${m.coldTok} tok  vs full AGENTS+comms ~${m.fullTok} tok  (≈${pct}% less if pin-only)`,
    );
  }
  console.log('\n--- Cold start pack ---\n');
  console.log(report.coldStart);
  if (outFile) console.error(`Wrote pack: ${outFile}`);
}

if (failUnder) {
  const need = GRADE_RANK[failUnder.toUpperCase()] ?? 3;
  const got = GRADE_RANK[report.grade] ?? 0;
  if (got < need) {
    console.error(`\nFAIL: grade ${report.grade} is below --fail-under=${failUnder}`);
    process.exit(1);
  }
}

process.exit(0);
