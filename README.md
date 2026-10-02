# ContextBridge

Local-first Windows-first desktop app that helps developers switch between AI
coding tools (Cursor, Claude Code, OpenCode, ChatGPT, Gemini, …) without
re-explaining their project from scratch. It captures safe Git metadata plus a
few explicit answers into a structured **Capsule** and copies a deterministic
Markdown handoff to the clipboard.

**Status: S0–S4 complete.** Every slice gate passed with raw evidence in
`evidence/S0/` … `evidence/S4/`. See `PROGRESS.md` for the gate report and
exact verification commands.

## Honesty and privacy notice

> Capsules transfer explicit project context. They do not transfer unsaved
> files, terminal process state, environment secrets, login sessions, private
> model memory, or hidden context from other AI tools.

ContextBridge does not sync hidden AI context, does not integrate directly with
Cursor, Claude, or OpenCode, and never claims to know whether pasted context was
read by another AI. No accounts, no login, no telemetry, no cloud. The
production app makes no outbound network requests.

## What it does

- **Projects and Capsules** — create projects, write handoff capsules
  (Simple/Advanced fields, 10 types, 4 statuses, tags), live token-estimated
  handoff preview as you type.
- **Copy handoff** — deterministic Markdown (exact heading order) to the
  clipboard; export as Markdown or JSON; import JSON/Markdown files or pasted
  notes.
- **Search** — FTS5 full-text search across capsules with type/status filters
  and highlighted snippets (every query term quoted, so operators are literal).
- **Git intelligence** — capture repository state (branch, HEAD, changed file
  names only, never contents); drift banner on open and on demand tells you
  when the repo moved since capture.
- **Revisions** — every save/copy/export action versions the capsule; view,
  diff-view, and restore from history (last 50 kept).
- **Secret safety** — offline scanner runs before saving; findings are always
  redacted and require an explicit "Save anyway" confirmation.
- **Active Handoff** — mark one capsule per project as active; it is
  surfaced in the header/sidebar and auto-selected when you open the project.
- **Undo** — deletions are soft and immediately undoable from the toast.

## Stack

- Electron 44 + React 19 + TypeScript (strict) + Vite 8 + Tailwind CSS 4
- Local SQLite (`better-sqlite3`) with WAL + FTS5 full-text search
- npm workspaces monorepo: `packages/core` (domain) + `apps/desktop` (shell)
- One Zod-validated IPC registry (33 channels), sandboxed preload with named
  methods only — no generic invoke
- Vitest (unit/integration on real temp SQLite), Playwright Electron E2E
- ESLint (flat) + Prettier, `electron-builder` (unpacked dir + NSIS installer)

## Getting started (PowerShell)

```powershell
npm install
npm run dev             # launch the Electron app in dev mode
npm run lint            # ESLint (0 warnings)
npm run typecheck       # strict TypeScript checks
npm run format:check    # Prettier
npm test                # unit/integration tests (real temp SQLite)
npm run test:e2e        # build + Playwright Electron tests (6 specs)
npm run package:dir     # production build + unpacked Windows package
npm run package:installer  # production build + NSIS installer
npm run smoke:packaged  # prove SQLite + FTS5 work inside the packaged exe
node scripts/make-icon.mjs  # regenerate apps/desktop/build/icon.{png,ico}
```

Packaged artifacts land in `apps/desktop/release/`
(`win-unpacked/ContextBridge.exe`, `ContextBridge Setup 0.1.0.exe`).

## Documentation

- `AGENTS.md` — binding operating rules for contributors and agents
- `PROGRESS.md` — current slice, gate report, blockers, verification commands
- `docs/ARCHITECTURE.md` — process model, IPC, build pipeline, storage
- `docs/SECURITY.md` — Electron hardening, CSP, IPC validation, secret/Git rules
- `docs/DECISIONS.md` — technical decisions log (D1–D22)
- `docs/VERSIONS.md` — exact pinned dependency versions
