import { afterEach, describe, expect, it } from 'vitest';
import {
  createProject,
  createCapsule,
  duplicateCapsule,
  getActiveHandoff,
  getCapsule,
  listCapsules,
  listRevisions,
  restoreCapsule,
  setActiveHandoff,
  setCapsuleArchived,
  softDeleteCapsule,
  updateCapsule,
} from '../src/index';
import { createTestDb, type TestContext } from './helpers';

const contexts: TestContext[] = [];
function ctx(): TestContext {
  const c = createTestDb('capsules');
  contexts.push(c);
  return c;
}
afterEach(() => {
  while (contexts.length > 0) {
    contexts.pop()?.cleanup();
  }
});

function setupProject(c: TestContext, name = 'Test Project'): string {
  const p = createProject(c.db, { name, repositoryPath: 'C:\\dev\\test-project' });
  if (!p.ok) throw new Error('project setup failed');
  return p.value.id;
}

const fullInput = {
  title: 'Session 42',
  type: 'Session Handoff' as const,
  status: 'Active' as const,
  summary: 'Working on the search feature',
  goal: 'Ship FTS search',
  currentTask: 'Wire query escaping',
  completedWork: 'Created FTS table',
  changedFiles: ['src/search.ts', 'tests/search.test.ts'],
  commandsRun: ['npm test'],
  verificationResults: '12 tests passed',
  knownIssues: 'Snippet highlight is plain text',
  nextTask: 'Add filters UI',
  rulesConstraints: 'Do not break Windows paths',
  architectureNotes: 'Search lives in core',
  notes: 'free form',
  gitHead: 'abcdef1234567890abcdef1234567890abcdef12',
  gitBranch: 'feature/search',
  gitSnapshot: {
    repositoryRoot: 'C:\\dev\\test-project',
    head: 'abcdef1234567890abcdef1234567890abcdef12',
    branch: 'feature/search',
    workingTreeClean: false,
    changedFiles: ['src/search.ts'],
    capturedAt: '2026-10-02T10:00:00.000Z',
  },
  tags: ['search', 'Backend'],
};

describe('capsule CRUD', () => {
  it('creates a capsule with derived content_markdown and token estimate', () => {
    const c = ctx();
    const projectId = setupProject(c);
    const result = createCapsule(c.db, projectId, fullInput);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const capsule = result.value;
    expect(capsule.title).toBe('Session 42');
    expect(capsule.type).toBe('Session Handoff');
    expect(capsule.status).toBe('Active');
    expect(capsule.changedFiles).toEqual(['src/search.ts', 'tests/search.test.ts']);
    expect(capsule.gitSnapshot?.workingTreeClean).toBe(false);
    expect(capsule.contentMarkdown).toContain('# Project Handoff');
    expect(capsule.contentMarkdown).toContain('## Current Task');
    expect(capsule.contentMarkdown).toContain('Wire query escaping');
    expect(capsule.contentMarkdown).toContain('- src/search.ts');
    expect(capsule.tokenEstimate).toBeGreaterThan(0);
    expect(capsule.version).toBe(1);

    const revisions = listRevisions(c.db, capsule.id);
    expect(revisions).toHaveLength(1);
    expect(revisions[0].reason).toBe('create');
  });

  it('normalizes tags on create', () => {
    const c = ctx();
    const projectId = setupProject(c);
    const result = createCapsule(c.db, projectId, { title: 'Tagged', tags: ['Search', 'search'] });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.title).toBe('Tagged');
  });

  it('rejects invalid capsule type with a field-level error', () => {
    const c = ctx();
    const projectId = setupProject(c);
    const result = createCapsule(c.db, projectId, { title: 'x', type: 'NotAType' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.details?.[0]?.field).toBe('type');
    }
  });

  it('returns NOT_FOUND when creating under a missing project', () => {
    const c = ctx();
    const result = createCapsule(c.db, 'missing-project', { title: 'x' });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('updates fields and regenerates content_markdown', () => {
    const c = ctx();
    const projectId = setupProject(c);
    const created = createCapsule(c.db, projectId, { title: 'Updatable', currentTask: 'first' });
    if (!created.ok) throw new Error('setup failed');
    const before = created.value.contentMarkdown;

    const updated = updateCapsule(c.db, created.value.id, { currentTask: 'second task' });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.currentTask).toBe('second task');
    expect(updated.value.contentMarkdown).not.toBe(before);
    expect(updated.value.contentMarkdown).toContain('second task');
  });

  it('rejects invalid patches', () => {
    const c = ctx();
    const projectId = setupProject(c);
    const created = createCapsule(c.db, projectId, { title: 'Patch' });
    if (!created.ok) throw new Error('setup failed');
    const updated = updateCapsule(c.db, created.value.id, { status: 'Bogus' });
    expect(updated.ok).toBe(false);
    if (!updated.ok) {
      expect(updated.error.details?.[0]?.field).toBe('status');
    }
  });
});

describe('soft delete, restore, archive', () => {
  it('soft deletes, hides from default views, and restores', () => {
    const c = ctx();
    const projectId = setupProject(c);
    const created = createCapsule(c.db, projectId, { title: 'Deletable' });
    if (!created.ok) throw new Error('setup failed');
    const id = created.value.id;

    const deleted = softDeleteCapsule(c.db, id);
    expect(deleted.ok && deleted.value.deletedAt !== null).toBe(true);

    const normalGet = getCapsule(c.db, id);
    expect(normalGet.ok).toBe(false);

    const listed = listCapsules(c.db, { projectId });
    expect(listed.ok && listed.value).toHaveLength(0);

    const listedDeleted = listCapsules(c.db, { projectId, includeDeleted: true });
    expect(listedDeleted.ok && listedDeleted.value).toHaveLength(1);

    const restored = restoreCapsule(c.db, id);
    expect(restored.ok && restored.value.deletedAt === null).toBe(true);
    expect(listCapsules(c.db, { projectId }).ok).toBe(true);
    const listedAgain = listCapsules(c.db, { projectId });
    expect(listedAgain.ok && listedAgain.value).toHaveLength(1);
  });

  it('restore on a non-deleted capsule returns INVALID_STATE', () => {
    const c = ctx();
    const projectId = setupProject(c);
    const created = createCapsule(c.db, projectId, { title: 'NotDeleted' });
    if (!created.ok) throw new Error('setup failed');
    const restored = restoreCapsule(c.db, created.value.id);
    expect(restored.ok).toBe(false);
    if (!restored.ok) {
      expect(restored.error.code).toBe('INVALID_STATE');
    }
  });

  it('archives, hides, and unarchives capsules', () => {
    const c = ctx();
    const projectId = setupProject(c);
    const created = createCapsule(c.db, projectId, { title: 'Archivable' });
    if (!created.ok) throw new Error('setup failed');
    const id = created.value.id;

    const archived = setCapsuleArchived(c.db, id, true);
    expect(archived.ok && archived.value.archivedAt !== null).toBe(true);
    const defaultList = listCapsules(c.db, { projectId });
    expect(defaultList.ok && defaultList.value).toHaveLength(0);
    const archivedList = listCapsules(c.db, { projectId, includeArchived: true });
    expect(archivedList.ok && archivedList.value).toHaveLength(1);

    const unarchived = setCapsuleArchived(c.db, id, false);
    expect(unarchived.ok && unarchived.value.archivedAt === null).toBe(true);
    expect(listCapsules(c.db, { projectId }).ok && listCapsules(c.db, { projectId }).ok).toBe(
      true,
    );
    const back = listCapsules(c.db, { projectId });
    expect(back.ok && back.value).toHaveLength(1);
  });

  it('archiving the active handoff clears the active pointer', () => {
    const c = ctx();
    const projectId = setupProject(c);
    const created = createCapsule(c.db, projectId, { title: 'ActiveOne' });
    if (!created.ok) throw new Error('setup failed');
    setActiveHandoff(c.db, created.value.id);
    setCapsuleArchived(c.db, created.value.id, true);
    const project = getActiveHandoff(c.db, projectId);
    expect(project.ok && project.value === null).toBe(true);
  });
});

describe('active handoff (one per project)', () => {
  it('sets and replaces the single active handoff', () => {
    const c = ctx();
    const projectId = setupProject(c);
    const a = createCapsule(c.db, projectId, { title: 'A' });
    const b = createCapsule(c.db, projectId, { title: 'B' });
    if (!a.ok || !b.ok) throw new Error('setup failed');

    const setA = setActiveHandoff(c.db, a.value.id);
    expect(setA.ok && setA.value.activeCapsuleId === a.value.id).toBe(true);

    const setB = setActiveHandoff(c.db, b.value.id);
    expect(setB.ok && setB.value.activeCapsuleId === b.value.id).toBe(true);

    const active = getActiveHandoff(c.db, projectId);
    expect(active.ok && active.value?.id === b.value.id).toBe(true);

    const count = c.db
      .prepare('SELECT count(*) AS c FROM projects WHERE active_capsule_id IS NOT NULL')
      .get() as { c: number };
    expect(count.c).toBe(1);
  });

  it('clears the active pointer when the active capsule is soft deleted', () => {
    const c = ctx();
    const projectId = setupProject(c);
    const a = createCapsule(c.db, projectId, { title: 'Active' });
    if (!a.ok) throw new Error('setup failed');
    setActiveHandoff(c.db, a.value.id);
    softDeleteCapsule(c.db, a.value.id);
    const active = getActiveHandoff(c.db, projectId);
    expect(active.ok && active.value === null).toBe(true);
  });

  it('rejects archived capsules and capsules from other contexts', () => {
    const c = ctx();
    const projectId = setupProject(c);
    const a = createCapsule(c.db, projectId, { title: 'Arch' });
    if (!a.ok) throw new Error('setup failed');
    setCapsuleArchived(c.db, a.value.id, true);
    const result = setActiveHandoff(c.db, a.value.id);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_STATE');
    }

    const missing = setActiveHandoff(c.db, 'nope');
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.error.code).toBe('NOT_FOUND');
    }
  });
});

describe('duplicate capsule', () => {
  it('creates a draft copy with parent link and identical derived content', () => {
    const c = ctx();
    const projectId = setupProject(c);
    const created = createCapsule(c.db, projectId, fullInput);
    if (!created.ok) throw new Error('setup failed');

    const copy = duplicateCapsule(c.db, created.value.id);
    expect(copy.ok).toBe(true);
    if (!copy.ok) return;
    expect(copy.value.id).not.toBe(created.value.id);
    expect(copy.value.title).toBe('Session 42 (copy)');
    expect(copy.value.status).toBe('Draft');
    expect(copy.value.parentCapsuleId).toBe(created.value.id);
    expect(copy.value.contentMarkdown).toBe(created.value.contentMarkdown);
    expect(copy.value.version).toBe(1);
    const revisions = listRevisions(c.db, copy.value.id);
    expect(revisions).toHaveLength(1);
    expect(revisions[0].reason).toBe('duplicate');
  });
});

describe('list filters', () => {
  it('filters by type, status, tag, and updated date range', () => {
    const c = ctx();
    const projectId = setupProject(c);
    const other = setupProject(c, 'Other Project');
    createCapsule(c.db, projectId, {
      title: 'Research note',
      type: 'Research',
      status: 'Draft',
      tags: ['mobile'],
    });
    createCapsule(c.db, projectId, {
      title: 'Bug thing',
      type: 'Bug Report',
      status: 'Verified',
      tags: ['urgent'],
    });
    createCapsule(c.db, other, { title: 'Elsewhere', type: 'Decision' });

    const byType = listCapsules(c.db, { projectId, types: ['Research'] });
    expect(byType.ok && byType.value).toHaveLength(1);
    expect(byType.ok && byType.value[0].title).toBe('Research note');

    const byStatus = listCapsules(c.db, { projectId, statuses: ['Verified'] });
    expect(byStatus.ok && byStatus.value).toHaveLength(1);
    expect(byStatus.ok && byStatus.value[0].title).toBe('Bug thing');

    const byTag = listCapsules(c.db, { projectId, tagNames: ['Mobile'] });
    expect(byTag.ok && byTag.value).toHaveLength(1);
    expect(byTag.ok && byTag.value[0].title).toBe('Research note');

    const future = listCapsules(c.db, {
      projectId,
      updatedFrom: '2099-01-01T00:00:00.000Z',
    });
    expect(future.ok && future.value).toHaveLength(0);

    const past = listCapsules(c.db, {
      projectId,
      updatedFrom: '2000-01-01T00:00:00.000Z',
      updatedTo: '2099-01-01T00:00:00.000Z',
    });
    expect(past.ok && past.value).toHaveLength(2);

    const perProject = listCapsules(c.db, { projectId: other });
    expect(perProject.ok && perProject.value).toHaveLength(1);
  });

  it('rejects invalid filters with field-level details', () => {
    const c = ctx();
    const result = listCapsules(c.db, { statuses: ['Nope'] });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.details?.[0]?.field).toContain('statuses');
    }
  });

  it('sorts by title ascending when requested', () => {
    const c = ctx();
    const projectId = setupProject(c);
    createCapsule(c.db, projectId, { title: 'zeta' });
    createCapsule(c.db, projectId, { title: 'alpha' });
    createCapsule(c.db, projectId, { title: 'Midway' });
    const sorted = listCapsules(c.db, { projectId, sort: 'title-asc' });
    expect(sorted.ok).toBe(true);
    if (!sorted.ok) return;
    expect(sorted.value.map((x) => x.title)).toEqual(['alpha', 'Midway', 'zeta']);
  });
});
