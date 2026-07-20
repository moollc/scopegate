/**
 * Pure helpers for safe comms archive (no I/O).
 * CLI: scripts/safe-archive-comms.mjs
 */

/**
 * Prefer cut at first bulk session-log marker after a pin; else keep-lines; else ~20k chars.
 */
export function chooseKeepLineCount(text, explicitKeep) {
  if (explicitKeep && explicitKeep > 0) return explicitKeep;
  const lines = text.split(/\r?\n/);
  const markers = [
    /^##\s+Log\s*$/i,
    /^##\s+Session log\s*$/i,
    /^##\s+\d{4}-\d{2}-\d{2}\b/,
  ];
  for (let i = 40; i < lines.length; i++) {
    for (const re of markers) {
      if (re.test(lines[i])) return i;
    }
  }
  let chars = 0;
  for (let i = 0; i < lines.length; i++) {
    chars += lines[i].length + 1;
    if (chars > 20000) return Math.max(40, i);
  }
  return lines.length;
}

export const COMMS_CANDIDATES = [
  'work/comms.md',
  'scaffold/comms.md',
  'scaffolds/comms.md',
  'scaffold/communication.md',
];
