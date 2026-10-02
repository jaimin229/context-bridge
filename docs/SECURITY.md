# SECURITY.md

Status: S0 scope. Items marked "planned" land in later slices.

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

## IPC (implemented in S0)

- Explicit allowlist of typed channels; only `contextbridge:ping` in S0.
- Preload exposes fixed functions only — never a generic
  `ipcRenderer.invoke(channel, payload)` passthrough.
- Every IPC payload is validated with Zod in the main process.
- Handlers return typed `Result<T, AppError>`-shaped responses; raw errors are
  not leaked to the renderer.
- Renderer never supplies filesystem paths (folder dialogs come from main
  process dialogs after explicit user action — planned S3).

## Forbidden code patterns (enforced by test)

`tests/repo-scan.test.ts` fails the build if any application source contains:

- `eval(`
- `new Function(`
- `dangerouslySetInnerHTML`

## SQLite / data (planned S1)

- Database under Electron `userData`, WAL mode, foreign keys ON.
- Backup before migrations.
- No telemetry, analytics, or crash reporters.

## Secret handling (planned S2)

- Deterministic local secret scanner before save/copy/export/import.
- Findings contain field name, pattern id, and count only — matched text is
  never logged, displayed, or exported.

## Network

- The production app makes no outbound network requests (AGENTS.md rule 10).
- Dependency installation during development is allowed.

## Git (planned S2)

- Read-only, `execFile` with argument arrays only, strict command allowlist,
  10s timeout, 1 MB output cap, credentials stripped from remote URLs,
  no diff or file content reads in V1.
