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

## D9 — 2026-10-02: Markdown front matter carries the Git snapshot

The Markdown export front matter (`contextbridge`, `id`, `title`, `type`,
`status`, `tags`, `project`, `created`, `updated`, `git_head`, `git_branch`)
also carries `git_snapshot` as a single-line JSON string. Without it a
Markdown round trip loses the working-tree state and capture timestamp, so the
regenerated `content_markdown` differs from the original. With it, JSON and
Markdown imports both restore identical structured fields and identical derived
handoff content. A corrupt `git_snapshot` value is imported as `null` rather
than failing the whole file.

## D10 — 2026-10-02: Initial revision does not bump capsule version

The first revision (reason `create` or `import`) is recorded at the capsule's
current version (1) without changing `version` or `updated_at`. Only later
revisions bump `version` and stamp `updated_at`. This keeps `version = 1` and
`updated_at = createdAt` for freshly created and freshly imported capsules,
which is required for lossless export round trips. Identical snapshots are
still skipped at every stage.

## D11 — 2026-10-02: Malformed migration file names throw

Every `.sql` file in the migrations directory must start with a number.
Unnumbered names (e.g. `init.sql`) raise an error instead of being filtered
out silently — a silently skipped migration is a data-integrity hazard. Files
with other extensions are ignored (backups, notes).

## D12 — 2026-10-02: Git access is allowlisted and content-blind

Git capture runs a fixed set of literal `git` subcommands (`rev-parse`,
`branch --show-current`, `status --porcelain=v1 -z`) via `execFile` without a
shell. The repository path is only ever the `cwd`; no caller-supplied string
can become an argument. Only file *names* and refs are read — never file
contents — so capture cannot leak source code or secrets into capsules. Git
failures map to a new `GIT_UNAVAILABLE` error code.

## D13 — 2026-10-02: FTS5 queries are quoted, operators are literal

Search never passes raw user text into FTS5 `MATCH`. Terms are parsed into
words/phrases, each wrapped in double quotes (so `*`, `-`, `NEAR`, `OR`, `:`,
`(` are plain text), joined with `AND`, with a prefix `*` on the final term
for as-you-type search. Structured FTS syntax is therefore unreachable by
user input; hostile queries degrade to literal searches instead of errors.
Snippets use control-character markers (`\u0002`/`\u0003`) rather than HTML,
so the renderer never needs `dangerouslySetInnerHTML`.

## D14 — 2026-10-02: Secret findings are always redacted

`scanSecrets` never returns the matched credential — only the rule id,
position, and a masked prefix (`abcd…`). Rules are a fixed offline set of
high-confidence formats; the scanner makes no network calls and never logs or
stores raw matches. Tests use constructed, obviously fake strings.
