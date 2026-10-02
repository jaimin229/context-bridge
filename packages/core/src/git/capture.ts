import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { statSync } from 'node:fs';
import { err, ok, type AppResult, type GitSnapshotInfo } from '../types';
import { nowIso } from '../util';

const execFileAsync = promisify(execFile);

const GIT_TIMEOUT_MS = 10_000;
const MAX_BUFFER_BYTES = 8 * 1024 * 1024;

/**
 * Every argument array in this module is a literal allowlisted command.
 * No caller-supplied value ever becomes an argument; the repository path is
 * only ever used as the working directory. No shell is involved.
 */
type GitRunOutcome =
  | { kind: 'ok'; stdout: string }
  | { kind: 'not-a-repository' }
  | { kind: 'git-missing'; message: string }
  | { kind: 'failed'; message: string };

async function runGit(repositoryPath: string, args: readonly string[]): Promise<GitRunOutcome> {
  try {
    const { stdout } = await execFileAsync('git', [...args], {
      cwd: repositoryPath,
      timeout: GIT_TIMEOUT_MS,
      maxBuffer: MAX_BUFFER_BYTES,
      windowsHide: true,
      encoding: 'utf8',
    });
    return { kind: 'ok', stdout };
  } catch (error) {
    const e = error as NodeJS.ErrnoException & { stderr?: string; killed?: boolean };
    if (e.code === 'ENOENT') {
      return { kind: 'git-missing', message: 'Git is not installed or not on PATH.' };
    }
    const text = `${e.stderr ?? ''}${e.message ?? ''}`;
    if (/not a git repository/i.test(text)) {
      return { kind: 'not-a-repository' };
    }
    if (e.killed || /ETIMEDOUT|timed out/i.test(text)) {
      return { kind: 'failed', message: `git ${args[0]} timed out.` };
    }
    return { kind: 'failed', message: text.trim().slice(0, 500) };
  }
}

interface StatusEntry {
  path: string;
  oldPath: string | null;
  staged: boolean;
  unstaged: boolean;
  untracked: boolean;
}

export function parsePorcelainStatus(zeroOutput: string): StatusEntry[] {
  const tokens = zeroOutput.split('\0');
  const entries: StatusEntry[] = [];
  let i = 0;
  while (i < tokens.length) {
    const entry = tokens[i];
    if (entry === undefined || entry.length === 0) {
      i += 1;
      continue;
    }
    const x = entry.charAt(0);
    const y = entry.charAt(1);
    const path = entry.slice(3);
    let oldPath: string | null = null;
    if (x === 'R' || x === 'C') {
      oldPath = tokens[i + 1] ?? null;
      i += 2;
    } else {
      i += 1;
    }
    if (path.length === 0 || x === '!' || y === '!') {
      continue;
    }
    const untracked = x === '?' && y === '?';
    entries.push({
      path,
      oldPath,
      staged: !untracked && x !== ' ' && x !== '?',
      unstaged: !untracked && y !== ' ' && y !== '?',
      untracked,
    });
  }
  return entries;
}

/**
 * Captures the current Git state of `repositoryPath` using only allowlisted
 * `git` commands. Never reads file contents, never runs arbitrary arguments,
 * never touches the network (local repository inspection only).
 *
 * Errors: VALIDATION for an empty path, NOT_FOUND for a missing path or a
 * directory that is not a Git repository, GIT_UNAVAILABLE when Git cannot run.
 */
export async function captureGitSnapshot(
  repositoryPath: string,
): Promise<AppResult<GitSnapshotInfo>> {
  const trimmed = repositoryPath.trim();
  if (trimmed.length === 0) {
    return err('VALIDATION', 'Repository path is required.');
  }
  let stats;
  try {
    stats = statSync(trimmed);
  } catch {
    return err('NOT_FOUND', `Repository path does not exist: ${trimmed}`);
  }
  if (!stats.isDirectory()) {
    return err('VALIDATION', `Repository path is not a directory: ${trimmed}`);
  }

  const toplevel = await runGit(trimmed, ['rev-parse', '--show-toplevel']);
  if (toplevel.kind === 'git-missing') {
    return err('GIT_UNAVAILABLE', toplevel.message);
  }
  if (toplevel.kind === 'not-a-repository') {
    return err('NOT_FOUND', `The path is not a git repository: ${trimmed}`);
  }
  if (toplevel.kind === 'failed') {
    return err('GIT_UNAVAILABLE', toplevel.message);
  }
  const root = toplevel.stdout.trim();

  let head = '';
  const headRun = await runGit(root, ['rev-parse', 'HEAD']);
  if (headRun.kind === 'ok') {
    head = headRun.stdout.trim();
  }

  let branch = '';
  let detached = false;
  const branchRun = await runGit(root, ['rev-parse', '--abbrev-ref', 'HEAD']);
  if (branchRun.kind === 'ok') {
    const name = branchRun.stdout.trim();
    if (name === 'HEAD') {
      detached = true;
    } else {
      branch = name;
    }
  } else {
    const current = await runGit(root, ['branch', '--show-current']);
    if (current.kind === 'ok') {
      branch = current.stdout.trim();
    }
  }

  const status = await runGit(root, ['status', '--porcelain=v1', '-z', '--untracked-files=all']);
  if (status.kind === 'git-missing') {
    return err('GIT_UNAVAILABLE', status.message);
  }
  if (status.kind === 'failed') {
    return err('GIT_UNAVAILABLE', status.message);
  }
  if (status.kind === 'not-a-repository') {
    return err('NOT_FOUND', `The path is not a git repository: ${trimmed}`);
  }

  const entries = parsePorcelainStatus(status.stdout);
  const changedFiles = Array.from(
    new Set(entries.flatMap((e) => (e.oldPath ? [e.path, e.oldPath] : [e.path]))),
  ).sort();

  return ok({
    repositoryRoot: root,
    head,
    branch,
    detached,
    workingTreeClean: entries.length === 0,
    changedFiles,
    capturedAt: nowIso(),
  });
}
