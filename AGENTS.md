# AGENTS.md — ContextBridge Operating Rules

These rules are binding for every contributor and agent working in this repository.

## 1. Gate discipline

- Complete one slice at a time (S0 → S1 → S2 → S3 → S4).
- After each slice: run all required checks, store raw output in `evidence/<slice>/`,
  update `PROGRESS.md`, commit the changes, print the Gate Report, then stop.
- Never start the next slice until the user explicitly replies `continue`.

## 2. Evidence over narration

- Never say "done", "complete", "working", or "production-ready" without command
  output or tested evidence.
- Raw command output must be saved under `evidence/<slice>/` before claiming a gate passed.

## 3. Repository safety

- Do not delete or rewrite existing user files without reading them first.
- Do not run destructive Git commands (`git reset --hard`, `git clean -fd`,
  `push --force`, history rewrites).

## 4. Small changes

- Use small, focused commits. Each commit belongs to exactly one slice.

## 5. No silent substitutions

- If a requirement cannot be met, stop and report the blocker.
- Do not silently replace a fixed technology (for example, swapping SQLite for another store).

## 6. No secrets

- Never put real secrets in code, tests, logs, evidence, documentation, or screenshots.
- Use only obviously fake, constructed strings in tests.

## 7. Real tests

- Use a real temporary SQLite database in tests. Do not mock the database.

## 8. Fresh-session recovery

- `PROGRESS.md` must always state: current slice, completed work, unverified work,
  blockers, next action, and exact verification commands.

## 9. Windows first

- Commands and paths must work in PowerShell.
- Use Node path utilities; never hardcode Unix or Windows path separators in code.

## 10. No outbound product network calls

- The production app must not make outbound network requests.
- Development dependency installation is allowed.

## 11. No invented results

- If a command cannot be run, say why and mark the result unverified.

## 12. User data stays local

- Do not upload project paths, Git information, Capsule text, or user content anywhere.
