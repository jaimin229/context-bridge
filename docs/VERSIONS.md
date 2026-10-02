# VERSIONS.md

Exact dependency versions for ContextBridge. All versions resolved from the npm
registry with `npm view <package> version` on **2026-10-02**. All pins are exact
(no `^`, no `~`). `package-lock.json` is committed. Dependencies must not be
upgraded automatically after S0 (AGENTS.md rule 5).

## Toolchain (host)

| Tool | Version  |
| ---- | -------- |
| Node | 26.1.0   |
| npm  | 11.13.0  |

## Root devDependencies

| Package                 | Version  |
| ----------------------- | -------- |
| @eslint/js              | 10.0.1   |
| eslint                  | 10.11.0  |
| eslint-config-prettier  | 10.1.8   |
| eslint-plugin-react-hooks | 7.1.1  |
| globals                 | 17.13.0  |
| prettier                | 3.9.9    |
| typescript              | 6.0.3    |
| typescript-eslint       | 8.71.0   |
| vitest                  | 5.0.3    |

## packages/core

| Package              | Version |
| -------------------- | ------- |
| better-sqlite3       | 13.0.3  |
| zod                  | 4.6.5   |
| @types/better-sqlite3 (dev) | 9.6.0 |
| @types/node (dev)    | 26.6.4  |

## apps/desktop

| Package              | Version | Kind |
| -------------------- | ------- | ---- |
| react                | 19.3.0  | runtime |
| react-dom            | 19.3.0  | runtime |
| lucide-react         | 1.49.0  | runtime |
| better-sqlite3       | 13.0.3  | runtime |
| zod                  | 4.6.5   | runtime |
| electron             | 44.5.1  | dev |
| electron-builder     | 26.15.3 | dev |
| vite                 | 8.3.2   | dev |
| @vitejs/plugin-react | 6.1.1   | dev |
| tailwindcss          | 4.3.3   | dev |
| @tailwindcss/vite    | 4.3.3   | dev |
| typescript           | 6.0.3   | dev |
| @types/react         | 19.3.0  | dev |
| @types/react-dom     | 19.3.0  | dev |
| @types/node          | 26.6.4  | dev |
| @types/better-sqlite3 | 9.6.0  | dev |
| @playwright/test     | 1.63.0  | dev |
| playwright           | 1.63.0  | dev |

Install date: 2026-10-02.
