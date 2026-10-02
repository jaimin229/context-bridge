# SECURITY.md

Status: S0-S4 controls implemented. Items marked "planned" land in later work.

## Electron hardening (implemented in S0)

- `contextIsolation: true`
- `nodeIntegration: false`
- `sandbox: true`
- `webviewTag` disabled (default) and `will-attach-webview` denied.
- `will-navigate` denied for every webContents (no navigation away from app content).
- `setWindowOpenHandler` returns `{ action: 'deny' }` (no `window.open`).
- `setPermissionRequestHandler` and `setPermissionCheckHandler` deny everything.
- Remote website content is never loaded; only the local Vite dev server or the
  packaged `file://` bundle.

## Content Security Policy (implemented in S0)

CSP strings live in one module (`apps/desktop/electron/csp.ts`) and are applied:

1. as a `<meta http-equiv="Content-Security-Policy">` injected by a Vite
   `transformIndexHtml` plugin (covers packaged `file://` loads), and
2. as a response header from the main process `onHeadersReceived` hook (covers
   the dev server).

Production policy (no allowances):

```text
default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline';
img-src 'self' data:; font-src 'self' data:; connect-src 'self';
object-src 'none'; base-uri 'self'; form-action 'none'
```

Development policy additionally allows `'unsafe-inline'` in `script-src` and
`ws://localhost:5173` in `connect-src` because Vite HMR injects an inline module
script and opens a WebSocket. This relaxation exists only while
`CONTEXTBRIDGE_DEV_SERVER` is set.

## IPC (implemented in S0, full registry in S3)

- One explicit registry of 33 typed channels (`electron/ipc.ts`); every
  channel has its own Zod request schema.
- Preload exposes fixed named methods only - never a generic
  `ipcRenderer.invoke(channel, payload)` passthrough.
- Main validates each payload with Zod (`INVALID_PAYLOAD` on failure), checks
  the trusted sender frame, and contains handler exceptions (`INTERNAL`
  without leaking raw errors). Unknown channels map to `INVALID_CHANNEL`.
- Handlers return `AppResult<T, AppError>`; the renderer unwraps through
  `src/api.ts`.
- Renderer never supplies filesystem paths (repository paths are plain
  strings the user types; clipboard writes go through main).
- Contract tests: `tests/ipc.test.ts` (preload allowlist),
  `tests/ipc-contract.test.ts` (preload == registry, renderer mirrors ==
  core values), `tests/ipc-routing.test.ts` (20 routing scenarios).

## Forbidden code patterns (enforced by test)

`tests/repo-scan.test.ts` fails the build if any application source contains:

- `eval(`
- `new Function(`
- `dangerouslySetInnerHTML`
- `exec(` / `execSync(` (shell execution); `execFile(` with an argument
  array is the only allowed form and is used for git

## SQLite / data (implemented in S1)

- Database under Electron `userData` (`contextbridge.db`), or under
  `CONTEXTBRIDGE_DATA_DIR` when set (E2E isolation).
- Pragmas: `foreign_keys = ON`, `journal_mode = WAL`, `busy_timeout = 5000`.
- Migration runner takes a `VACUUM INTO` backup before applying pending
  migrations; each migration applies in a transaction with rollback.
- No telemetry, analytics, or crash reporters.

## Renderer content (implemented in S3)

- `MarkdownView` parses handoff markdown structurally (headings, lists, code
  fences, inline emphasis) - no raw HTML sinks, no `dangerouslySetInnerHTML`.
- FTS snippets use the U+0002/U+0003 control markers that are stripped or
  highlighted in JavaScript, never interpreted as markup.

## Secret handling (implemented in S2, surfaced in S3)

- Deterministic offline scanner (`scanSecrets`, 8 rules: private key blocks,
  AWS/GitHub/Slack tokens, JWTs, URL credentials, credential assignments).
- Findings are always redacted (D14) - matched text is never logged,
  displayed, exported, or written to evidence.
- Saving a capsule runs the scanner first; findings open a confirm dialog
  (masked values only) before anything is persisted.

## Git (implemented in S2)

- Read-only, `execFile` with argument arrays only, strict subcommand
  allowlist, repository path used only as `cwd`, 10s timeout, 8 MB buffer.
- Captures status/branch/HEAD metadata and changed file *names* only -
  never file contents, never diffs.
- Failures map to typed errors (`GIT_UNAVAILABLE`, `NOT_FOUND`, `VALIDATION`).

## Network (enforced by rule)

- The production app makes no outbound network requests (AGENTS.md rule 10).
- Dependency installation during development is allowed.

## Packaging (implemented in S4)

- App icon generated locally by `scripts/make-icon.mjs` (no external assets).
- NSIS installer (`ContextBridge Setup <v>.exe`) built by electron-builder
  from `electron-builder.yml`; `npmRebuild: false` and a pinned lockfile keep
  builds reproducible.
