# Scopegate

[![GitHub](https://img.shields.io/badge/github-moollc%2Fscopegate-blue)](https://github.com/moollc/scopegate)

**Pre-flight for multi-LM workspaces.** Local hybrid PWA: open a workspace folder, get a process grade, copy or download a **cold-start pack** any model should load first.

- Is `AGENTS.md` thin enough?
- Pin-first vs comms dump (full vs pin-slice tokens)?
- Host stubs (`@AGENTS.md`) vs forked rulebooks?
- Kit cues (verify / MULTI-CLI) when present?

No account. Folder access stays on your machine. Demos work without picking a folder.

## Run

Prerequisites (once per machine): Node 18+, [mkcert](https://github.com/FiloSottile/mkcert).

```bat
start.bat
```

```bash
npm start
npm test
```

Opens `https://localhost:<port>` (Chrome/Edge for folder picker).

## Headless scan (agents / CI)

From a **workspace parent** (folder with `AGENTS.md` / scaffold):

```bash
npm run scan -- "G:/My Drive/Antigravity/onboardin-workspace"
npm run scan -- . --json
npm run scan -- . --pack > cold-start.md
npm run scan -- . --fail-under=B
```

## Verify (workspace kit levels)

From this folder (repo root):

```bash
node scripts/verify-workspace.mjs --level=process
node scripts/verify-workspace.mjs --level=layout
node scripts/verify-workspace.mjs --level=app
```

## Local ignore

Use `.git/info/exclude` (do not commit `.gitignore`):

```
build/certs/
node_modules/
.env
target/
pipeline/deploy/
```

