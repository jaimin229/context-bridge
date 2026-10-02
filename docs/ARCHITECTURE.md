# ARCHITECTURE.md

Status: S0 scope. Sections marked "planned" are implemented in later slices.

## Repository layout

```text
contextbridge/
  package.json            npm workspaces root, shared scripts
  package-lock.json       single lockfile, exact pins
  eslint.config.mjs       flat ESLint config (strict TS + hooks rules)
  vitest.config.mts       unit/integration tests (real temp SQLite)
  playwright.config.ts    Electron E2E via Playwright _electron
  tsconfig.base.json      strict compiler defaults
  tsconfig.json           root tests typecheck
  scripts/dev.mjs         dev launcher (build main, start Vite, start Electron)
  scripts/smoke-packaged.mjs  launches the packaged exe with --smoke-test
  packages/core/          pure TypeScript domain (no Electron imports)
  apps/desktop/           Electron main, preload, React renderer
  docs/                   DECISIONS, VERSIONS, ARCHITECTURE, SECURITY
  evidence/S0/            raw command output per slice
```

## packages/core (planned in S1+)

Pure TypeScript: SQLite access layer, migrations, Zod domain schemas, handoff
generator, import/export, FTS search, secret scanner, Git capture, token
estimator. No Electron imports. Consumed by the Electron main process later.

## apps/desktop

### Process model

```text
┌──────────────────────────── Electron main ────────────────────────────┐
│ main.ts                                                               │
│  - secure BrowserWindow (contextIsolation, no nodeIntegration,        │
│    sandbox)                                                           │
│  - deny will-navigate, window.open, permission requests, webview      │
│  - CSP via onHeadersReceived                                          │
│  - ipc.ts: Zod validation + Result<T, AppError> for every channel     │
│  - smoke.ts: SQLite + FTS5 probe (used by ping and --smoke-test)      │
└──────────────▲────────────────────────────────────────────────────────┘
               │ contextbridge:ping (allowlisted channel only)
┌──────────────┴─── preload.ts (sandboxed, CommonJS) ───────────────────┐
│ contextBridge.exposeInMainWorld('contextBridgeApi', { ping })         │
│ No generic invoke(channel, payload) is exposed.                       │
└──────────────▲────────────────────────────────────────────────────────┘
               │ typed window.contextBridgeApi.ping()
┌──────────────┴─── renderer (React + Vite + Tailwind) ─────────────────┐
│ src/App.tsx  – S0 proof screen: IPC / SQLite / FTS5 checklist         │
│ No node access, no raw IPC, no dangerouslySetInnerHTML.               │
└───────────────────────────────────────────────────────────────────────┘
```

### Build pipeline

- `tsc -p apps/desktop/tsconfig.electron.json` → `dist-electron/` (CJS main + preload).
- `vite build` → `dist/` (renderer bundle + CSP-injected index.html).
- `electron-builder --dir` → `release/win-unpacked/` (unpacked Windows build).

### Data storage

Data lives under Electron `userData` (planned DB file in S1). S0 uses a
temporary probe database inside `userData` only for verification.

### Dev vs packaged content loading

- Dev: main loads `CONTEXTBRIDGE_DEV_SERVER` (Vite) when the env var is set.
- Packaged/production: main loads `file://` `dist/index.html` from the asar.
- Remote content is never loaded.
