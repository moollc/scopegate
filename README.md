# Scopegate

[![GitHub](https://img.shields.io/badge/github-moollc%2Fscopegate-blue)](https://github.com/moollc/scopegate)

**Pre-flight for multi-LM workspaces.** Grade process health, then emit a **cold-start pack** and a short **agent briefing** so models load the right slice — not the whole monorepo or comms archive.

- Is `AGENTS.md` thin enough?
- Pin-first vs comms dump (full vs pin-slice tokens)?
- Host stubs (`@AGENTS.md`) vs forked rulebooks?
- Kit / multi-agent cues when present?

No account. Folder access stays on your machine. Demos work without picking a folder.

## Using with an LM (agent-first)

Pointing a model at this repo alone is **not** enough. Scopegate needs a **scan target** (their workspace parent) and a **job**.

1. Clone or open this repo.
2. Run a scan on the **workspace parent** (folder with `AGENTS.md` and/or `scaffold` / `work` — not only the app git subfolder, unless that *is* the workspace).
3. Hand the model the **briefing** (or full pack) and tell it to obey that for the session.

```bash
cd scopegate   # this repo
npm run scan -- "/path/to/your-workspace" --brief
```

**Prompt you can paste to any LM:**

> Use Scopegate (https://github.com/moollc/scopegate): run `npm run scan -- <workspace-parent> --brief`, then follow that briefing for this session. Prefer tools (grep/read) over pasting whole logs or archives. Do not dump the monorepo into context.

| Thing | Role |
|-------|------|
| This repo | Scanner + CLI + docs |
| Their workspace parent | Scan target |
| `--brief` | Short paste for session start |
| `--pack` | Full cold-start markdown |

## Run (local UI)

Prerequisites (once per machine): Node 18+, [mkcert](https://github.com/FiloSottile/mkcert) for local HTTPS.

```bat
start.bat
```

```bash
npm start
npm test
```

Opens `https://localhost:<port>`.

## Headless scan (agents / CI)

```bash
# Use *your* paths — do not commit machine-specific absolute paths into this repo
npm run scan -- "/path/to/your-workspace"
npm run scan -- . --json
npm run scan -- . --brief
npm run scan -- . --pack > cold-start.md
npm run scan -- . --fail-under=B
```

Scanning `.` inside *this* repo grades the product folder, not a full multi-LM workspace parent. Point at the workspace you care about.

### Safe comms archive (do not freehand trim)

Scopegate will flag fat comms. **Do not** replace the live file until an archive is **byte- and hash-verified**.

```bash
npm run archive-comms -- "/path/to/your-workspace" --dry-run
npm run archive-comms -- "/path/to/your-workspace"
```

Order enforced by the tool: **write full archive → verify size + SHA-256 → only then rewrite live** (keep pin/head + pointer to archive). Never deletes the archive. That hole (agent “compressed” without a verified copy) is why this command exists.

## Live demo (GitHub Pages)

Deployed from **GitHub Actions** on push to `main`.

- Site: https://moollc.github.io/scopegate/
- Demos work without installing anything.
- Folder open uses File System Access when available, else browser folder upload. Files stay local.
- If folder pick fails: use demos or `npm run scan` locally.

Pages source (one-time): repo **Settings → Pages → Source: GitHub Actions**.

## Verify (workspace kit levels)

From this folder (repo root):

```bash
node scripts/verify-workspace.mjs --level=process
node scripts/verify-workspace.mjs --level=layout
node scripts/verify-workspace.mjs --level=app
```

## Local ignore

`.gitignore` already covers `build/certs/` and `pipeline/deploy/`. Do not commit certs or deploy trees.
