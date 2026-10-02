import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { captureGitSnapshot, detectDrift, parsePorcelainStatus } from '../src/index';

const cleanups: Array<() => void> = [];
afterEach(() => {
  while (cleanups.length > 0) {
    cleanups.pop()?.();
  }
});

function tempDir(label: string): string {
  const dir = mkdtempSync(join(tmpdir(), `contextbridge-git-${label}-`));
  cleanups.push(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

function git(cwd: string, ...args: string[]): string {
  return execFileSync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function makeRepo(label: string): string {
  const dir = tempDir(label);
  git(dir, 'init', '-b', 'main');
  git(dir, 'config', 'user.name', 'ContextBridge Test');
  git(dir, 'config', 'user.email', 'test@contextbridge.invalid');
  writeFileSync(join(dir, 'tracked.txt'), 'one\n');
  git(dir, 'add', '.');
  git(dir, 'commit', '-m', 'initial');
  return dir;
}

describe('porcelain -z parsing', () => {
  it('classifies staged, unstaged, untracked, and rename entries', () => {
    const entries = parsePorcelainStatus(
      ' M src/app.ts\0A  staged.txt\0?? loose.txt\0R  new-name.txt\0old-name.txt\0',
    );
    expect(entries).toHaveLength(4);
    expect(entries[0]).toMatchObject({
      path: 'src/app.ts',
      staged: false,
      unstaged: true,
      untracked: false,
    });
    expect(entries[1]).toMatchObject({
      path: 'staged.txt',
      staged: true,
      unstaged: false,
      untracked: false,
    });
    expect(entries[2]).toMatchObject({
      path: 'loose.txt',
      staged: false,
      unstaged: false,
      untracked: true,
    });
    expect(entries[3]).toMatchObject({
      path: 'new-name.txt',
      oldPath: 'old-name.txt',
      staged: true,
      untracked: false,
    });
  });

  it('returns nothing for an empty status output', () => {
    expect(parsePorcelainStatus('')).toEqual([]);
  });
});

describe('captureGitSnapshot', () => {
  it('captures a clean repository', async () => {
    const dir = makeRepo('clean');
    const result = await captureGitSnapshot(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const snap = result.value;
    expect(snap.head).toMatch(/^[0-9a-f]{40}$/);
    expect(snap.branch).toBe('main');
    expect(snap.detached).toBe(false);
    expect(snap.workingTreeClean).toBe(true);
    expect(snap.changedFiles).toEqual([]);
    expect(snap.repositoryRoot?.replace(/\\/g, '/')).toBe(dir.replace(/\\/g, '/'));
    expect(typeof snap.capturedAt).toBe('string');
    expect(Number.isNaN(Date.parse(snap.capturedAt as string))).toBe(false);
  });

  it('captures staged, unstaged, and untracked file names', async () => {
    const dir = makeRepo('dirty');
    writeFileSync(join(dir, 'tracked.txt'), 'two\n');
    writeFileSync(join(dir, 'staged.txt'), 'staged content\n');
    git(dir, 'add', 'staged.txt');
    writeFileSync(join(dir, 'loose.txt'), 'untracked\n');

    const result = await captureGitSnapshot(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.workingTreeClean).toBe(false);
    expect(result.value.changedFiles).toEqual(['loose.txt', 'staged.txt', 'tracked.txt']);
  });

  it('resolves the repository root from a nested subdirectory', async () => {
    const dir = makeRepo('nested');
    const sub = join(dir, 'packages', 'app');
    mkdirSync(sub, { recursive: true });
    const result = await captureGitSnapshot(sub);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.repositoryRoot?.replace(/\\/g, '/')).toBe(dir.replace(/\\/g, '/'));
  });

  it('marks a detached HEAD', async () => {
    const dir = makeRepo('detached');
    git(dir, 'checkout', '--detach');
    const result = await captureGitSnapshot(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.detached).toBe(true);
    expect(result.value.branch).toBe('');
    expect(result.value.head).toMatch(/^[0-9a-f]{40}$/);
  });

  it('handles a repository with no commits yet', async () => {
    const dir = tempDir('unborn');
    git(dir, 'init', '-b', 'main');
    const result = await captureGitSnapshot(dir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.head).toBe('');
    expect(result.value.branch).toBe('main');
    expect(result.value.workingTreeClean).toBe(true);
  });

  it('rejects an empty path with VALIDATION', async () => {
    const result = await captureGitSnapshot('   ');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
    }
  });

  it('reports a missing path as NOT_FOUND', async () => {
    const result = await captureGitSnapshot(join(tempDir('missing'), 'nope'));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('reports a file path as VALIDATION', async () => {
    const dir = tempDir('filepath');
    const file = join(dir, 'file.txt');
    writeFileSync(file, 'x');
    const result = await captureGitSnapshot(file);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
    }
  });

  it('reports a non-repository directory as NOT_FOUND', async () => {
    const dir = tempDir('plaindir');
    const result = await captureGitSnapshot(dir);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
      expect(result.error.message).toContain('not a git repository');
    }
  });
});

describe('detectDrift', () => {
  const captured = {
    head: 'aaaa1111',
    branch: 'feature/x',
    workingTreeClean: true,
    changedFiles: [] as string[],
  };

  it('reports no drift without a baseline snapshot', () => {
    const report = detectDrift(null, { head: 'bbbb2222', branch: 'main' });
    expect(report.hasDrift).toBe(false);
    expect(report.reasons).toEqual([]);
    expect(report.currentHead).toBe('bbbb2222');
    expect(report.currentBranch).toBe('main');
  });

  it('reports no drift when nothing changed', () => {
    const report = detectDrift(captured, { ...captured });
    expect(report.hasDrift).toBe(false);
    expect(report.reasons).toEqual([]);
  });

  it('detects a new commit', () => {
    const report = detectDrift(captured, { ...captured, head: 'bbbb2222' });
    expect(report.hasDrift).toBe(true);
    expect(report.reasons).toEqual(['head-changed']);
    expect(report.currentHead).toBe('bbbb2222');
  });

  it('detects a branch switch', () => {
    const report = detectDrift(captured, { ...captured, branch: 'main' });
    expect(report.hasDrift).toBe(true);
    expect(report.reasons).toEqual(['branch-changed']);
    expect(report.currentBranch).toBe('main');
  });

  it('detects a working tree that became dirty', () => {
    const report = detectDrift(captured, {
      ...captured,
      workingTreeClean: false,
      changedFiles: ['new.txt'],
    });
    expect(report.hasDrift).toBe(true);
    expect(report.reasons).toEqual(['working-tree-changed']);
  });

  it('detects a changed set of dirty files even when both are dirty', () => {
    const dirtyBaseline = {
      ...captured,
      workingTreeClean: false,
      changedFiles: ['a.txt'],
    };
    const report = detectDrift(dirtyBaseline, {
      ...dirtyBaseline,
      changedFiles: ['b.txt'],
    });
    expect(report.hasDrift).toBe(true);
    expect(report.reasons).toEqual(['working-tree-changed']);
  });

  it('does not report drift when only the file order differs', () => {
    const dirtyBaseline = {
      ...captured,
      workingTreeClean: false,
      changedFiles: ['a.txt', 'b.txt'],
    };
    const report = detectDrift(dirtyBaseline, {
      ...dirtyBaseline,
      changedFiles: ['b.txt', 'a.txt'],
    });
    expect(report.hasDrift).toBe(false);
  });

  it('reports drift when the repository becomes unavailable', () => {
    const report = detectDrift(captured, null);
    expect(report.hasDrift).toBe(true);
    expect(report.reasons).toEqual(['repository-unavailable']);
    expect(report.currentHead).toBeNull();
    expect(report.currentBranch).toBeNull();
  });
});
