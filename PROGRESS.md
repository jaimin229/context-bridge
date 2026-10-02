# PROGRESS.md

## Current slice

**S4 - Polish and release - GATE PASSED (2026-10-02)**

All slices (S0, S1, S2, S3, S4) are complete. Gate report for S4 is in the
verification table below; raw command output is under `evidence/S4/`.

## Completed work (S0, commit `f617eba`)

- npm workspaces monorepo (`packages/core`, `apps/desktop`), exact-pinned deps,
  `package-lock.json` committed.
- Strict TypeScript, ESLint flat config, Prettier, Vitest, Playwright configs;
  operating docs (`AGENTS.md`, `docs/*`).
- Secure Electron `BrowserWindow` (contextIsolation, no nodeIntegration,
  sandbox, denied navigation/window-open/permissions/webview, shared CSP).
- `better-sqlite3` + FTS5 proof, packaged `--smoke-test`, dev launcher,
  security repo scan test, S0 proof UI.
- Evidence: `evidence/S0/`.

## Completed work (S1, commit `9c914f2`)

- Migration runner (`schema_migrations`, `VACUUM INTO` backup, transactional
  apply, malformed file names throw) + `001_initial.sql` (all tables, indices,
  external-content `capsules_fts` with triggers).
- Zod schemas, types with `AppResult`/`ok`/`err`, repositories (projects,
  capsules incl. soft delete/archive/duplicate/Active Handoff, tags,
  revisions with 50-cap, settings), handoff generator (exact heading order,
  compact mode, 8000-token default budget), deterministic JSON/Markdown
  export + import with ID-collision handling.
- 95 unit/integration tests on real temporary SQLite.

## Completed work (S2, commit `ac0068e`)

- Git capture (`execFile` + allowlist, 10s/8MB, unborn HEAD, porcelain `-z`
  parser) and drift detection (head/branch/working-tree/unavailable),
  `GIT_UNAVAILABLE` error code (D12).
- FTS5 search with quoted operators (D13), pagination, snippet markers,
  hostile-query suite; 8-rule secret scanner with always-redacted findings
  (D14).

## Completed work (S3, commit `8057cc2`)

- Core ships as built CJS dist (D15); migrations copied next to compiled main
  (D16); `CONTEXTBRIDGE_DATA_DIR` isolation (D17); 33-channel Zod registry,
  no generic invoke, contract tests (D18).
- Full renderer: onboarding, workspace shell, CapsuleEditor (Simple/Advanced,
  secret-scan confirm, exports, revisions, git capture, drift banner,
  duplicate/archive/delete+undo, set active), HandoffPreview, SearchPanel,
  SettingsDialog, ImportDialog, structural MarkdownView.
- 169 unit tests (16 files), 5 e2e specs; packaged smoke.

## Completed work (S4)

- **Active Handoff surfaced**: header chip (`active-handoff-chip`) jumps to
  the active capsule; the active capsule is auto-selected when a project
  opens and after it is set; badge refresh on delete (D20 related).
- **Drift on open**: capsules with a git snapshot run the drift check
  automatically when opened and show the banner without a click (D20).
- **Delete confirmation**: in-app dialog (`confirm-delete`/`cancel-delete`)
  replaces `window.confirm`; Undo toast unchanged (D20).
- **Draft clobber fix**: draft loads once per capsule; save/copy/set-active
  no longer discard unsaved edits; restore reloads explicitly (D21).
- **Usability gate**: `tests/e2e/usability.spec.ts` proves first handoff in
  6 interactions under 60 seconds (measured in-test) plus active-handoff
  surfacing; screenshot `evidence/S4/active-chip.png`.
- **Icon + installer**: `scripts/make-icon.mjs` (dependency-free PNG/ICO,
  D19) → `win.icon`; NSIS installer target added
  (`npm run package:installer` → `release/ContextBridge Setup 0.1.0.exe`);
  packaged exe icon verified (`evidence/S4/exe-icon.png`).
- **Formatting gate**: `.prettierrc.json` pinned to repo style
  (singleQuote, printWidth 100, endOfLine auto) so `format:check` passes
  under Windows `core.autocrlf=true` (D22).
- **Docs refreshed**: `README.md` (status, features, commands),
  `docs/ARCHITECTURE.md` (S0-S3 reality: IPC registry, build pipeline,
  storage), `docs/SECURITY.md` (all controls now "implemented"),
  `docs/DECISIONS.md` D19-D22.

## Verification (raw output in `evidence/S4/`)

| Command | Result | Evidence |
| --- | --- | --- |
| `npm run lint` | PASS (0 warnings) | `lint.txt` |
| `npm run typecheck` | PASS | `typecheck.txt` |
| `npx prettier --check .` | PASS | `format-check.txt` |
| `npm test` | PASS (169/169, 16 files) | `unit-tests.txt` |
| `npm run test:e2e` | PASS (6/6: 3 launch + 2 workflow + usability) | `e2e.txt` |
| `npm run package:dir` | PASS (`win-unpacked/ContextBridge.exe`) | `package.txt` |
| `npm run package:installer` | PASS (`ContextBridge Setup 0.1.0.exe`, 123 MB) | `package-installer.txt` |
| `npm run smoke:packaged` | PASS (SQLite + FTS5 in package) | `smoke-packaged.txt` |

Screenshots: `active-chip.png`, `exe-icon.png`, plus S3 workspace/editor/
export/drift shots.

## Unverified work

- Nothing in the S4 gate is unverified.
- Known non-blocking warning: Vite config loader notes that `electron/csp.ts`
  uses ESM syntax in a file without `"type": "module"`. Builds unaffected.
- The NSIS installer builds and is signed by electron-builder's default
  signtool flow, but is not code-signed with a trusted certificate (no
  certificate available locally); Windows SmartScreen may warn on first run.

## Blockers

- None.

## Next action

- S0-S4 of the master build prompt are complete. Future work (not required
  by the prompt): real code-signing certificate, app auto-update (would need
  an explicit network decision), localization, capsule templates.

## Exact verification commands

```powershell
npm install
npm run lint
npm run typecheck
npx prettier --check .
npm test
npm run test:e2e
npm run build
npm run package:dir
npm run package:installer
npm run smoke:packaged
```
