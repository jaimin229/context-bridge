# PROGRESS.md

## Current slice

**S3 - Electron UI and workflows - GATE PASSED (2026-10-02)**

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
  cap 50, initial revision does not bump version - D10), settings.
- Handoff generator: exact heading order, `_Not provided._` placeholders,
  drift note, Master Context embed, compact mode with `[truncated]` markers and
  token budget (default 8000, ceil(len/4) estimator).
- I/O: deterministic JSON export, deterministic `***` Markdown front matter
  (extended with `git_snapshot` - D9), JSON + Markdown import (structured and
  plain-notes), ID-collision handling via `imported_original_id`, atomic
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
  markers (U+0002/U+0003 control characters) with title fallback, VALIDATION
  for empty/over-long queries. Hostile-query suite passes without data mutation.
- Secret scanner (`scanSecrets`): 8 offline rules (private key blocks, AWS,
  GitHub, Slack, JWT, URL credentials, credential assignments); findings are
  redacted (D14) with line/column positions.

## Completed work (S3)

- Core packaging (D15): `packages/core/tsconfig.build.json` builds CJS +
  declarations to `packages/core/dist`; core `main`/`types` point at dist;
  root `pretypecheck`/`prebuild` and `scripts/dev.mjs` build core first.
  `apps/desktop` declares `@contextbridge/core` as a dependency so the
  packaged asar contains it.
- Migrations bundling (D16): `scripts/copy-migrations.mjs` copies
  `packages/core/migrations/*.sql` into `dist-electron/migrations` during
  every electron build/dev run; main resolves via `__dirname`; startup opens
  the DB, runs migrations, and only then creates the window (failure =
  native error dialog + exit 1).
- Data dir isolation (D17): `CONTEXTBRIDGE_DATA_DIR` overrides the database
  directory; every e2e launch uses a fresh temp directory.
- Typed IPC registry (D18): 33 channels in `electron/ipc.ts`
  (projects, capsules incl. Active Handoff, tags, revisions, search,
  handoff draft/render, git capture/drift, secrets scan, settings, export,
  import, clipboard, ping) with per-channel Zod schemas, `AppResult` mapping,
  and exception containment in `routeIpc`. Main registers every channel with
  the trusted-sender check against one shared better-sqlite3 handle.
- Preload: fixed named methods per group (no generic invoke); contract tests
  assert preload literal channels == registry and renderer mirror constants
  == core values (snippet markers, capsule type/status lists).
- Renderer: `api.ts` Result unwrapper; `StartupChecks` (S0 markup preserved);
  onboarding (project create with checks); workspace shell (project header,
  capsule sidebar with status/archived filters, active-handoff badge, toasts
  with Undo); `CapsuleEditor` (Simple/Advanced fields, tags, save with secret
  scan confirm dialog, copy handoff, MD/JSON export dialogs, revision history
  with restore/view, git capture, drift banner, duplicate/archive/delete+undo,
  set active); `HandoffPreview` (debounced draft generation + token estimate);
  structural `MarkdownView` (no raw-HTML sinks) with FTS highlight markers;
  `SearchPanel` (query + type/status filters + highlighted snippets);
  `SettingsDialog` (token budget, compact, startup checks); `ImportDialog`
  (file picker or paste, JSON/Markdown detection).
- Tests: `tests/ipc-routing.test.ts` (20 scenarios against real SQLite +
  real git repos: CRUD, revisions, tags, search with markers, export/import
  round trip, settings, secrets redaction, git capture + drift, active
  handoff, duplicate/archive/delete/restore, error-code mapping,
  INVALID_PAYLOAD/INVALID_CHANNEL); `tests/ipc-contract.test.ts` (preload vs
  registry, renderer vs core parity). Updated preload allowlist test to assert
  the full literal-channel set.
- E2E: `tests/e2e/helpers.ts` (fresh data dir per launch), launch spec on
  fresh DBs, new `workspace.spec.ts` - full flow (onboarding -> project ->
  capsule -> live preview -> save -> search -> copy -> exports -> settings ->
  import -> delete/undo) plus git capture -> commit -> drift banner, with
  screenshots in `evidence/S3/`.

## Verification (raw output in `evidence/S3/`)

| Command | Result | Evidence |
| --- | --- | --- |
| `npm run lint` | PASS | `lint.txt` |
| `npm run typecheck` | PASS | `typecheck.txt` |
| `npm test` | PASS (169/169, 16 files) | `unit-tests.txt` |
| `npm run test:e2e` | PASS (5/5: 3 launch + 2 workflow) | `e2e.txt` |
| `npm run package:dir` | PASS (`win-unpacked/ContextBridge.exe`) | `package.txt` |
| `npm run smoke:packaged` | PASS (SQLite + FTS5 in package) | `smoke-packaged.txt` |

Screenshots: `editor-live-preview.png`, `export-dialog.png`,
`workspace-after-import.png`, `drift-banner.png`.

## Unverified work

- Nothing in the S3 gate is unverified.
- Known non-blocking warning (S0): Vite config loader warns that
  `electron/csp.ts` uses ESM syntax in a file without `"type": "module"`.
  Builds are unaffected.

## Blockers

- None.

## Next action

- **S4 - polish and release**: import/export UX polish, secret-scan dialog
  coverage, Active Handoff surfacing, drift banner on open, revisions UI
  verification, delete confirmation/undo pass, packaging (icon as allowed),
  README/docs refresh, full E2E + usability check (<=6 interactions to first
  handoff, <=60 seconds).

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
