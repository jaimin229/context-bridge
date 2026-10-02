# ContextBridge

Local-first Windows-first desktop app that helps developers switch between AI
coding tools (Cursor, Claude Code, OpenCode, ChatGPT, Gemini, …) without
re-explaining their project from scratch. It captures safe Git metadata plus a
few explicit answers into a structured **Capsule** and copies a deterministic
Markdown handoff to the clipboard.

**Status: S0 (foundation) in progress.** See `PROGRESS.md` for the current
slice and verification commands.

## Honesty and privacy notice

> Capsules transfer explicit project context. They do not transfer unsaved
> files, terminal process state, environment secrets, login sessions, private
> model memory, or hidden context from other AI tools.

ContextBridge does not sync hidden AI context, does not integrate directly with
Cursor, Claude, or OpenCode, and never claims to know whether pasted context was
read by another AI. No accounts, no login, no telemetry, no cloud.

## Stack

- Electron + React + TypeScript + Vite + Tailwind CSS
- Local SQLite (`better-sqlite3`) with FTS5 full-text search
- npm workspaces monorepo: `packages/core` (domain) + `apps/desktop` (shell)
- Vitest (unit/integration, real temporary SQLite), Playwright Electron E2E
- Strict TypeScript, ESLint, Prettier, `electron-builder` for Windows packaging

## Getting started (PowerShell)

```powershell
npm install
npm run dev          # launch the Electron app in dev mode
npm run lint         # ESLint
npm run typecheck    # strict TypeScript checks
npm test             # unit/integration tests (real temp SQLite)
npm run test:e2e     # build + Playwright Electron tests
npm run package:dir  # production build + unpacked Windows package
npm run smoke:packaged  # prove SQLite + FTS5 in the packaged exe
```

## Documentation

- `AGENTS.md` — binding operating rules for contributors and agents
- `PROGRESS.md` — current slice, verification commands, blockers
- `docs/ARCHITECTURE.md` — process model and repository layout
- `docs/SECURITY.md` — Electron hardening, CSP, IPC validation
- `docs/DECISIONS.md` — technical decisions log
- `docs/VERSIONS.md` — exact pinned dependency versions
