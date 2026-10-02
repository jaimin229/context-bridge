# DECISIONS.md

Record of meaningful technical decisions. Newest entries at the bottom.

## D1 — 2026-10-02: Monorepo with npm workspaces

Chosen per the fixed stack: `packages/core` (pure TypeScript domain) and
`apps/desktop` (Electron + React + Vite). npm workspaces keep a single
`package-lock.json`.

## D2 — 2026-10-02: Exact version pinning resolved from the registry

All dependency versions are exact (no `^`, no `~`) and were resolved with
`npm view <pkg> version` on 2026-10-02. Compatibility checks performed:

- `typescript-eslint@8.71.0` peer range is `typescript >=4.8.4 <6.1.0`, so
  TypeScript is pinned to **6.0.3** (latest 6.x) instead of 7.0.2.
- `@vitejs/plugin-react@6.1.1` requires Vite 8; `vitest@5.0.3` accepts Vite 6–8.
- `eslint@10.11.0` is accepted by `typescript-eslint@8.71.0` and
  `eslint-plugin-react-hooks@7.1.1`.

## D3 — 2026-10-02: better-sqlite3 needs no native rebuild

`better-sqlite3@13.0.3` ships N-API prebuilt binaries inside the npm tarball
(`prebuilds/win32-x64.node`, `gypfile: false`, no install script). N-API binaries
are ABI-stable, so the same binary works under Node (Vitest), Electron dev, and
the packaged app. No `node-gyp`, Python, or Visual C++ toolchain is required.
This was the highest-risk S0 item and was verified before scaffolding.

## D4 — 2026-10-02: Electron main and preload compile to CommonJS

The preload script must be CommonJS because `sandbox: true` sandboxes preload
execution (ESM preloads are unsupported). The desktop `package.json` therefore
does not set `"type": "module"`; `tsc` with `module: node16` emits CJS for
`electron/` sources. Renderer code is ESM handled by Vite. Vite/Vitest configs
use explicit `.mts` extensions so they load as ESM regardless.

## D5 — 2026-10-02: Shared CSP strings module

Content-Security-Policy strings live in `apps/desktop/electron/csp.ts` and are
used both by the `transformIndexHtml` Vite plugin (meta tag, works for
`file://` loads in the packaged app) and by the main process
`onHeadersReceived` hook (HTTP responses from the Vite dev server). Dev and
production policies differ (dev needs inline scripts for Vite HMR); both files
always use the same string for the same mode.

## D6 — 2026-10-02: IPC shape for S0

Only one channel exists: `contextbridge:ping`. The preload exposes a typed
`ping()` function (no generic `invoke(channel, payload)`). Zod validation and
`Result<T, AppError>` mapping happen in the main process (`electron/ipc.ts`),
which is a pure module that can be unit-tested without Electron.

## D7 — 2026-10-02: Proof via smoke flags instead of GUI automation for packaging

The packaged app accepts `--smoke-test --smoke-out=<path>`: it opens a real
SQLite database inside packaged `userData`, verifies FTS5, writes a JSON result,
and exits with a non-zero code on failure. This gives machine-checkable evidence
that SQLite + FTS5 work inside the packaged binary. Playwright `_electron` is
used for dev-mode and built-renderer launch proof.

## D8 — 2026-10-02: electron-builder settings

- `npmRebuild: false`: better-sqlite3 is N-API (D3), no rebuild needed; skipping
  the rebuild avoids requiring a native toolchain during packaging.
- `asarUnpack: "**/node_modules/better-sqlite3/**"`: the native `.node` binary
  must live outside the asar archive to be loadable.
- Target is `--dir` (unpacked Windows build) per the S0 gate; installer
  targets are out of MVP scope.
