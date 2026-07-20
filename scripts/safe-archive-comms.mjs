#!/usr/bin/env node
/**
 * Safe comms archive — closes the "flag dump → freehand replace live file" hole.
 *
 * HARD RULES:
 * 1. Write full archive FIRST.
 * 2. Verify archive size === source size AND SHA-256 match.
 * 3. Only then rewrite the live file.
 * 4. Never delete the archive.
 *
 *   node scripts/safe-archive-comms.mjs <workspace-parent>
 *   node scripts/safe-archive-comms.mjs <workspace-parent> --dry-run
 *   node scripts/safe-archive-comms.mjs <workspace-parent> --keep-lines=200
 */
import { readFileSync, writeFileSync, existsSync, mkdirSync, statSync } from 'fs';
import { join, resolve } from 'path';
import { createHash } from 'crypto';
import { chooseKeepLineCount, COMMS_CANDIDATES } from '../source/app/safe-archive.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const forceNew = args.includes('--force-new-name');
const keepLinesArg = args.find((a) => a.startsWith('--keep-lines='));
const keepLines = keepLinesArg ? parseInt(keepLinesArg.split('=')[1], 10) : null;
const rootArg = args.find((a) => !a.startsWith('--'));
const root = resolve(rootArg || process.cwd());

function die(msg) {
  console.error(`safe-archive-comms: ${msg}`);
  process.exit(1);
}

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

function findComms(workspaceRoot) {
  for (const rel of COMMS_CANDIDATES) {
    const abs = join(workspaceRoot, rel);
    if (existsSync(abs) && statSync(abs).isFile()) return { rel, abs };
  }
  return null;
}

function archiveDirFor(rel, workspaceRoot) {
  if (rel.startsWith('work/')) return join(workspaceRoot, 'work', 'archive');
  if (rel.startsWith('scaffold/')) return join(workspaceRoot, 'scaffold', 'archive');
  if (rel.startsWith('scaffolds/')) return join(workspaceRoot, 'scaffolds', 'archive');
  return join(workspaceRoot, 'archive');
}

if (!existsSync(root) || !statSync(root).isDirectory()) {
  die(`not a directory: ${root}`);
}

const found = findComms(root);
if (!found) {
  die(`no comms file found (tried ${COMMS_CANDIDATES.join(', ')})`);
}

const raw = readFileSync(found.abs);
const text = raw.toString('utf8');
const sourceSize = raw.length;
const sourceHash = sha256(raw);
const lines = text.split(/\r?\n/);
const keepN = chooseKeepLineCount(text, keepLines);

if (keepN >= lines.length) {
  console.log(
    `safe-archive-comms: nothing to archive (${found.rel} already ≤ keep boundary, ${lines.length} lines)`,
  );
  process.exit(0);
}

const stamp = new Date().toISOString().slice(0, 10);
const archDir = archiveDirFor(found.rel, root);
let archPath = join(archDir, `comms_full_${stamp}_${sourceHash.slice(0, 8)}.md`);
if (existsSync(archPath) && !forceNew) {
  die(`archive already exists: ${archPath} (use --force-new-name)`);
}
if (existsSync(archPath) && forceNew) {
  archPath = join(archDir, `comms_full_${stamp}_${sourceHash.slice(0, 12)}.md`);
}

const head = lines.slice(0, keepN).join('\n');
const relArch = archPath
  .slice(root.length)
  .replace(/^[\\/]/, '')
  .replace(/\\/g, '/');

const liveBody =
  head.replace(/\s+$/, '') +
  `

---

## Session log

**Full prior file archived (byte- and hash-verified) before this trim.**

- Archive: \`${relArch}\`
- Source SHA-256: \`${sourceHash}\`
- Source bytes: ${sourceSize}
- Kept live lines: 1–${keepN} of ${lines.length}

**Agents:** open pin / Start-here / latest note only. Do **not** load the archive into context unless auditing history.

### ${stamp} — safe-archive-comms

- Live file compacted via Scopegate \`npm run archive-comms\` (archive-first, hash-verified).
`;

console.log(`safe-archive-comms: source  ${found.rel}  (${sourceSize} bytes, ${lines.length} lines)`);
console.log(`safe-archive-comms: keep    lines 1–${keepN}`);
console.log(`safe-archive-comms: archive ${relArch}`);

if (dryRun) {
  console.log('safe-archive-comms: DRY RUN — no files written');
  process.exit(0);
}

mkdirSync(archDir, { recursive: true });

writeFileSync(archPath, raw);
const archRaw = readFileSync(archPath);
const archSize = archRaw.length;
const archHash = sha256(archRaw);
if (archSize !== sourceSize || archHash !== sourceHash) {
  die(
    `ARCHIVE VERIFY FAILED (size ${archSize} vs ${sourceSize}, hash mismatch). Live file NOT modified.`,
  );
}
console.log(`safe-archive-comms: verified archive SHA-256 ${archHash}`);

writeFileSync(found.abs, liveBody, 'utf8');
console.log(`safe-archive-comms: live rewritten (${statSync(found.abs).size} bytes). Archive retained.`);
console.log('safe-archive-comms: OK');
