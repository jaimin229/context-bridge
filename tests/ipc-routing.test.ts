import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { SNIPPET_OPEN } from '../packages/core/src/search/search';
import { createTestDb, type TestContext } from '../packages/core/tests/helpers';
import { IPC_CHANNELS, routeIpc, type IpcDeps, type Result } from '../apps/desktop/electron/ipc';

interface TestRuntime {
  ctx: TestContext;
  deps: IpcDeps;
  copied: string[];
  repoDir: string;
}

let runtime: TestRuntime;

function git(args: string[], cwd: string): void {
  execFileSync('git', args, { cwd, windowsHide: true });
}

function makeRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'contextbridge-repo-'));
  git(['init', '-b', 'main'], dir);
  git(['config', 'user.email', 'test@contextbridge.local'], dir);
  git(['config', 'user.name', 'ContextBridge Test'], dir);
  writeFileSync(path.join(dir, 'app.ts'), 'export const version = 1;\n');
  git(['add', '.'], dir);
  git(['commit', '-m', 'initial'], dir);
  return dir;
}

async function call<O>(channel: string, payload: unknown): Promise<O> {
  const result = (await routeIpc(runtime.deps, channel, payload)) as Result<O>;
  if (!result.ok) {
    throw new Error(`${channel} failed: ${result.error.code} ${result.error.message}`);
  }
  return result.value;
}

async function expectErrorCode(channel: string, payload: unknown, code: string): Promise<void> {
  const result = await routeIpc(runtime.deps, channel, payload);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.error.code).toBe(code);
  }
}

beforeAll(() => {
  const ctx = createTestDb('ipc');
  const repoDir = makeRepo();
  const copied: string[] = [];
  runtime = {
    ctx,
    repoDir,
    copied,
    deps: {
      db: ctx.db,
      ping: () => ({
        ok: true,
        value: {
          appVersion: '0.1.0',
          platform: 'win32',
          probe: {
            sqliteVersion: '3.50.0',
            fts5Available: true,
            fts5QueryWorked: true,
          },
          security: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        },
      }),
      copyText: (text) => copied.push(text),
    },
  };
});

afterAll(() => {
  runtime.ctx.cleanup();
  rmSync(runtime.repoDir, { recursive: true, force: true });
});

describe('IPC router integration (real SQLite, real git)', () => {
  let projectId = '';
  let capsuleId = '';
  let duplicateId = '';

  it('routes ping through the injected deps', async () => {
    const value = await call<{ appVersion: string }>(IPC_CHANNELS.ping, {
      nonce: 'x',
    });
    expect(value.appVersion).toBe('0.1.0');
  });

  it('rejects an unknown channel', async () => {
    await expectErrorCode('contextbridge:does.not.exist', {}, 'INVALID_CHANNEL');
  });

  it('rejects malformed payloads with INVALID_PAYLOAD and field details', async () => {
    const result = await routeIpc(runtime.deps, IPC_CHANNELS.capsulesGet, {
      id: 42,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_PAYLOAD');
      expect(result.error.details?.length).toBeGreaterThan(0);
    }
  });

  it('creates a project wired to a real git repository', async () => {
    const project = await call<{ id: string; name: string }>(IPC_CHANNELS.projectsCreate, {
      name: 'Routing Project',
      repositoryPath: runtime.repoDir,
    });
    projectId = project.id;
    expect(project.name).toBe('Routing Project');

    const list = await call<Array<{ id: string }>>(IPC_CHANNELS.projectsList, {});
    expect(list.some((p) => p.id === projectId)).toBe(true);
  });

  it('creates a capsule whose content markdown is derived', async () => {
    const capsule = await call<{ id: string; contentMarkdown: string }>(
      IPC_CHANNELS.capsulesCreate,
      {
        projectId,
        input: {
          title: 'Session One',
          goal: 'Implement the routing integration test',
          currentTask: 'Wiring IPC channels',
        },
      },
    );
    capsuleId = capsule.id;
    expect(capsule.contentMarkdown).toContain('# Project Handoff');
    expect(capsule.contentMarkdown).toContain('Implement the routing integration test');
  });

  it('updates a capsule and records a manual-save revision', async () => {
    const updated = await call<{
      goal: string;
      version: number;
      status: string;
    }>(IPC_CHANNELS.capsulesUpdate, {
      id: capsuleId,
      patch: {
        goal: 'Updated goal with uniqueflavour wording',
        status: 'Active',
      },
      reason: 'manual-save',
    });
    expect(updated.goal).toBe('Updated goal with uniqueflavour wording');
    expect(updated.status).toBe('Active');

    const revisions = await call<Array<{ version: number; reason: string }>>(
      IPC_CHANNELS.revisionsList,
      { capsuleId },
    );
    expect(revisions.length).toBeGreaterThanOrEqual(2);
    expect(revisions.some((r) => r.reason === 'manual-save')).toBe(true);
  });

  it('renders live previews from draft input without saving', async () => {
    const draft = await call<{ markdown: string; tokenEstimate: number }>(
      IPC_CHANNELS.handoffDraft,
      {
        projectId,
        input: {
          title: 'Draft only',
          goal: 'draftgoalz appears only in preview',
        },
      },
    );
    expect(draft.markdown).toContain('draftgoalz appears only in preview');
    expect(draft.tokenEstimate).toBeGreaterThan(0);

    const saved = await call<{ goal: string }>(IPC_CHANNELS.capsulesGet, {
      id: capsuleId,
    });
    expect(saved.goal).not.toContain('draftgoalz appears only in preview');
  });

  it('renders the saved capsule through handoff.render', async () => {
    const rendered = await call<{ markdown: string }>(IPC_CHANNELS.handoffRender, {
      capsuleId,
    });
    expect(rendered.markdown).toContain('Updated goal with uniqueflavour wording');
  });

  it('searches capsule content with FTS and highlight markers', async () => {
    const outcome = await call<{
      hits: Array<{ id: string; snippet: string }>;
      total: number;
    }>(IPC_CHANNELS.searchQuery, {
      query: 'uniqueflavour',
      filter: { projectId },
    });
    expect(outcome.total).toBeGreaterThanOrEqual(1);
    expect(outcome.hits[0].id).toBe(capsuleId);
    expect(outcome.hits[0].snippet).toContain(SNIPPET_OPEN);
  });

  it('creates tags and attaches them to a capsule', async () => {
    const tag = await call<{ name: string }>(IPC_CHANNELS.tagsCreate, {
      name: 'Handoff',
    });
    expect(tag.name).toBe('handoff');

    await call(IPC_CHANNELS.capsulesUpdate, {
      id: capsuleId,
      patch: { tags: ['handoff', 's3'] },
      reason: 'manual-save',
    });
    const tags = await call<Array<{ name: string }>>(IPC_CHANNELS.tagsListForCapsule, {
      capsuleId,
    });
    expect(tags.map((t) => t.name).sort()).toEqual(['handoff', 's3']);
  });

  it('exports JSON and Markdown and re-imports the JSON round trip', async () => {
    const json = await call<string>(IPC_CHANNELS.exportJson, { capsuleId });
    const parsed = JSON.parse(json) as { capsule: { title: string } };
    expect(parsed.capsule.title).toBe('Session One');

    const markdown = await call<string>(IPC_CHANNELS.exportMarkdown, {
      capsuleId,
    });
    expect(markdown).toContain('contextbridge: 1');
    expect(markdown).toContain('# Project Handoff');

    const imported = await call<{ id: string; title: string }>(IPC_CHANNELS.importJson, {
      text: json,
      projectId,
    });
    expect(imported.title).toBe('Session One');
    expect(imported.id).not.toBe(capsuleId);

    const mdImport = await call<{ capsule: { type: string }; kind: string }>(
      IPC_CHANNELS.importMarkdown,
      { text: '# Scratch\n\nJust some notes\n', projectId },
    );
    expect(mdImport.kind).toBe('plain');
    expect(mdImport.capsule.type).toBe('Other');
  });

  it('stores and reads settings', async () => {
    await call(IPC_CHANNELS.settingsSet, {
      key: 'handoff.tokenBudget',
      value: 4321,
    });
    const value = await call<unknown>(IPC_CHANNELS.settingsGet, {
      key: 'handoff.tokenBudget',
      fallback: 0,
    });
    expect(value).toBe(4321);
    const all = await call<Record<string, unknown>>(IPC_CHANNELS.settingsList, {});
    expect(all['handoff.tokenBudget']).toBe(4321);
  });

  it('scans for secrets and always redacts the match', async () => {
    const fakeKeyId = 'AKIA' + 'F'.repeat(16);
    const findings = await call<Array<{ ruleId: string; redacted: string }>>(
      IPC_CHANNELS.secretsScan,
      { text: `token = "${fakeKeyId}"` },
    );
    expect(findings.length).toBeGreaterThan(0);
    for (const finding of findings) {
      expect(finding.redacted).not.toContain(fakeKeyId);
    }
  });

  it('writes to the clipboard through the injected dep', async () => {
    await call(IPC_CHANNELS.clipboardWrite, { text: 'handoff-body' });
    expect(runtime.copied).toContain('handoff-body');
  });

  it('captures a real git snapshot', async () => {
    const snapshot = await call<{
      head: string;
      branch: string;
      workingTreeClean: boolean;
    }>(IPC_CHANNELS.gitCapture, { repositoryPath: runtime.repoDir });
    expect(snapshot.head).toHaveLength(40);
    expect(snapshot.branch).toBe('main');
    expect(snapshot.workingTreeClean).toBe(true);
  });

  it('attaches the snapshot to the capsule on update', async () => {
    const snapshot = await call<{ head: string; branch: string }>(IPC_CHANNELS.gitCapture, {
      repositoryPath: runtime.repoDir,
    });
    const updated = await call<{ gitHead: string }>(IPC_CHANNELS.capsulesUpdate, {
      id: capsuleId,
      patch: {
        gitHead: snapshot.head,
        gitBranch: snapshot.branch,
        gitSnapshot: snapshot,
      },
      reason: 'manual-save',
    });
    expect(updated.gitHead).toBe(snapshot.head);
  });

  it('detects drift after the repository advances', async () => {
    writeFileSync(path.join(runtime.repoDir, 'app.ts'), 'export const version = 2;\n');
    git(['add', '.'], runtime.repoDir);
    git(['commit', '-m', 'second'], runtime.repoDir);

    const report = await call<{
      hasDrift: boolean;
      reasons: string[];
      currentHead: string | null;
    }>(IPC_CHANNELS.gitDrift, { capsuleId });
    expect(report.hasDrift).toBe(true);
    expect(report.reasons).toContain('head-changed');
    expect(report.currentHead).toHaveLength(40);
  });

  it('marks and reads the active handoff', async () => {
    await call(IPC_CHANNELS.capsulesSetActiveHandoff, { capsuleId });
    const active = await call<{ id: string } | null>(IPC_CHANNELS.capsulesGetActiveHandoff, {
      projectId,
    });
    expect(active?.id).toBe(capsuleId);
  });

  it('duplicates, archives, soft-deletes, and restores a capsule', async () => {
    const duplicate = await call<{ id: string; title: string }>(IPC_CHANNELS.capsulesDuplicate, {
      id: capsuleId,
    });
    duplicateId = duplicate.id;
    expect(duplicate.id).not.toBe(capsuleId);
    expect(duplicate.title).toContain('Session One');

    const archived = await call<{ archivedAt: string | null }>(IPC_CHANNELS.capsulesSetArchived, {
      id: duplicateId,
      archived: true,
    });
    expect(archived.archivedAt).not.toBeNull();

    await call(IPC_CHANNELS.capsulesSoftDelete, { id: duplicateId });
    const gone = await routeIpc(runtime.deps, IPC_CHANNELS.capsulesGet, {
      id: duplicateId,
    });
    expect(gone.ok).toBe(false);

    const restored = await call<{ deletedAt: string | null }>(IPC_CHANNELS.capsulesRestore, {
      id: duplicateId,
    });
    expect(restored.deletedAt).toBeNull();
  });

  it('surfaces core domain errors with their original codes', async () => {
    await expectErrorCode(IPC_CHANNELS.capsulesGet, { id: 'no-such-capsule' }, 'NOT_FOUND');
    await expectErrorCode(IPC_CHANNELS.projectsCreate, { name: '' }, 'VALIDATION');
    await expectErrorCode(IPC_CHANNELS.gitCapture, { repositoryPath: '' }, 'INVALID_PAYLOAD');
    await expectErrorCode(
      IPC_CHANNELS.gitCapture,
      { repositoryPath: path.join(runtime.repoDir, 'missing-subdir') },
      'NOT_FOUND',
    );
  });
});
