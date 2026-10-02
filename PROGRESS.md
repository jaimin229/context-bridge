# PROGRESS.md

## Current slice

**S0 — Foundation and risky technical proof — GATE PASSED (2026-10-02)**

## Repository state at start

- New repository: only `.git/` existed, zero commits, no files, no detected technology.

## Completed work (S0)

- npm workspaces monorepo (`packages/core`, `apps/desktop`), exact-pinned deps,
  `package-lock.json` committed.
- Strict TypeScript configs; ESLint flat config; Prettier; Vitest; Playwright
  (`_electron`) configs.
- Operating docs: `AGENTS.md`, `PROGRESS.md`, `docs/DECISIONS.md`,
  `docs/VERSIONS.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `README.md`.
- Secure Electron `BrowserWindow` (contextIsolation, no nodeIntegration, sandbox,
  denied navigation/window-open/permissions/webview, header + meta CSP from one
  shared module).
- Typed preload bridge exposing only `ping()`; Zod validation in main process
  (`electron/ipc.ts`) returning `Result<T>`.
- `better-sqlite3` + FTS5 probe in main process; packaged `--smoke-test` mode.
- Dev launcher (`scripts/dev.mjs`), packaged smoke script, security repo scan test.
- S0 proof UI (App.tsx) rendering startup checks via `aria-live`.

## Verification (raw output in `evidence/S0/`)

| Command | Result | Evidence |
| --- | --- | --- |
| `npm install` | PASS (0 vulnerabilities) | `npm-install.txt` |
| `npm run lint` | PASS | `lint.txt` |
| `npm run typecheck` | PASS | `typecheck.txt` |
| `npm test` | PASS (15/15) | `unit-tests.txt` |
| `npm run test:e2e` | PASS (3/3) | `e2e.txt` |
| `npm run build` | PASS | `build.txt` |
| `npm run package:dir` | PASS (`release/win-unpacked/ContextBridge.exe`) | `package-dir.txt` |
| `npm run smoke:packaged` | PASS (SQLite 3.53.4 + FTS5 in packaged app) | `packaged-smoke.json`, `packaged-smoke-run.txt` |
| `npm run dev` | PASS (Vite ready + Electron launched) | `dev-run.txt` |
| Screenshots | dev / prod / packaged windows | `dev-launch.png`, `prod-launch.png`, `packaged-launch.png` |

## Unverified work

- Nothing in the S0 gate is unverified.
- Known non-blocking warning: Vite config loader warns that `electron/csp.ts`
  uses ESM syntax in a file without `"type": "module"` (future Vite default).
  Current loader bundles the config successfully; builds are unaffected.

## Blockers

- None.

## Next action

- **S1 — Core database and domain**: migrations, DB access layer, Project/
  Capsule/Tag CRUD, Active Handoff rule, soft delete/archive, revisions,
  handoff generator, token estimator, JSON/Markdown export+import, all tested
  against a real temporary SQLite database.

## Exact verification commands

```powershell
npm install
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run package:dir
npm run smoke:packaged
```
