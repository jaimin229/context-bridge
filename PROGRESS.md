# PROGRESS.md

## Current slice

**S2 — Repository intelligence and search — GATE PASSED (2026-10-02)**

## Completed work (S0, committed `f617eba`)

- npm workspaces monorepo (`packages/core`, `apps/desktop`), exact-pinned deps,
  `package-lock.json` committed.
- Strict TypeScript configs; ESLint flat config; Prettier; Vitest; Playwright
  (`_electron`) configs.
- Operating docs: `AGENTS.md`, `PROGRESS.md`, `docs/DECISIONS.md`,
  `docs/VERSIONS.md`, `docs/ARCHITECTURE.md`, `docs/SECURITY.md`, `README.md`.
- Secure Electron `BrowserWindow` (contextIsolation, no nodeIntegration, sandbox,
  denied navigation/window-open/permissions/webview, header + meta CSP from one
  shared module). Typed preload bridge with one Zod-validated IPC channel.
- `better-sqlite3` + FTS5 in main; packaged `--smoke-test` mode; dev launcher;
  security repo scan test; S0 proof UI.
- Evidence: `evidence/S0/` (lint, typecheck, 15/15 tests, 3/3 e2e, build,
  package, packaged smoke, dev run, screenshots).

## Completed work (S1)

- Migration runner (`runMigrations`): `schema_migrations`, `VACUUM INTO` backup
  before pending migrations, transactional apply with rollback, malformed
  `.sql` file names throw (never silently skipped).
- Migration `001_initial.sql`: projects, capsules (CHECK enums), tags,
  capsule_tags, capsule_revisions, app_settings, indices, `capsules_fts`
  external-content FTS5 + `capsules_fts_ai/ad/au` triggers.
- Zod schemas (`schemas.ts`) and types (`types.ts`) with `AppResult`/`ok`/`err`.
- Repositories: projects, capsules (create/update/list/filters/soft
  delete/restore/archive/duplicate/set+get Active Handoff), tags (normalized,
  unsafe-character rejection, link replacement), revisions (snapshot-based skip,
  cap 50, initial revision does not bump version — D10), settings.
- Handoff generator: exact heading order, `_Not provided._` placeholders,
  drift note, Master Context embed, compact mode with `[truncated]` markers and
  token budget (default 8000, ceil(len/4) estimator).
- I/O: deterministic JSON export, deterministic `***` Markdown front matter
  (extended with `git_snapshot` — D9), JSON + Markdown import (structured and
  plain-notes), ID-collision handling via `importedOriginal_id`, atomic
  `importNormalized`.
- 95 unit/integration tests against real temporary SQLite databases (11 files).

## Completed work (S2)

- Git capture (`captureGitSnapshot`): allowlisted `git` subcommands only
  (no shell, no caller-supplied arguments, repository path is `cwd` only),
  async `execFile` with 10s timeout and 8MB buffer. Captures repository root,
  HEAD, branch/detached state, and staged/unstaged/untracked file names from
  `git status --porcelain=v1 -z` (never file contents). Handles unborn HEAD,
  nested subdirectories, and maps failures to VALIDATION/NOT_FOUND/
  GIT_UNAVAILABLE (new error code, D12).
- Porcelain `-z` parser (`parsePorcelainStatus`) with rename/copy handling.
- Drift detection (`detectDrift`): head-changed, branch-changed,
  working-tree-changed, repository-unavailable; order-insensitive file set
  comparison; no baseline means no drift claim.
- FTS5 search (`searchCapsules`): every user term quoted so operators are
  literal (D13), phrase queries, prefix on final term, filters (project, type,
  status, tags, archived, deleted), pagination with stable total, snippet
  markers `\u0002`/`\u0003` with title fallback, VALIDATION for empty/over-long
  queries. Hostile-query suite passes without data mutation.
- Secret scanner (`scanSecrets`): 8 offline rules (private key blocks, AWS,
  GitHub, Slack, JWT, URL credentials, credential assignments); findings are
  redacted (D14) with line/column positions.

## Verification (raw output in `evidence/S2/`)

| Command | Result | Evidence |
| --- | --- | --- |
| `npm run lint` | PASS | `lint.txt` |
| `npm run typecheck` | PASS | `typecheck.txt` |
| `npm test` | PASS (144/144, 14 files) | `unit-tests.txt` |
| `npm run test:e2e` | PASS (3/3 regression) | `e2e.txt` |

## Unverified work

- Nothing in the S2 gate is unverified.
- Known non-blocking warning (S0): Vite config loader warns that
  `electron/csp.ts` uses ESM syntax in a file without `"type": "module"`.
  Builds are unaffected.

## Blockers

- None.

## Next action

- **S3 — Electron UI and workflows**: typed IPC for every repository/search/
  git operation, onboarding flow, project workspace, Simple/Advanced capsule
  editors with live handoff preview, copy buttons, search UI with snippet
  highlighting, settings, and keyboard-accessible navigation.

## Exact verification commands

```powershell
npm install
npm run lint
npm run typecheck
npm test
npm run test:e2e
npm run build
npm run package:dir
npm run smoke:packaged
```
