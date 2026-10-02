import { afterEach, describe, expect, it } from 'vitest';
import {
  addRevision,
  createCapsule,
  createProject,
  getCapsule,
  listRevisions,
  updateCapsule,
} from '../src/index';
import { createTestDb, type TestContext } from './helpers';

const contexts: TestContext[] = [];
function ctx(): TestContext {
  const c = createTestDb('revisions');
  contexts.push(c);
  return c;
}
afterEach(() => {
  while (contexts.length > 0) {
    contexts.pop()?.cleanup();
  }
});

function setup(c: TestContext): { projectId: string; capsuleId: string } {
  const p = createProject(c.db, { name: 'Rev Project' });
  if (!p.ok) throw new Error('setup failed');
  const cap = createCapsule(c.db, p.value.id, {
    title: 'Rev Capsule',
    notes: 'v1',
  });
  if (!cap.ok) throw new Error('setup failed');
  return { projectId: p.value.id, capsuleId: cap.value.id };
}

describe('revision policy', () => {
  it('creates a create revision on capsule creation', () => {
    const c = ctx();
    const { capsuleId } = setup(c);
    const revisions = listRevisions(c.db, capsuleId);
    expect(revisions).toHaveLength(1);
    expect(revisions[0].reason).toBe('create');
    expect(revisions[0].version).toBe(1);
  });

  it('creates a manual-save revision and bumps capsule version', () => {
    const c = ctx();
    const { capsuleId } = setup(c);
    const updated = updateCapsule(
      c.db,
      capsuleId,
      { notes: 'v2 edited' },
      { reason: 'manual-save' },
    );
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.version).toBe(2);
    const revisions = listRevisions(c.db, capsuleId);
    expect(revisions).toHaveLength(2);
    expect(revisions[0].reason).toBe('manual-save');
    expect(revisions[0].version).toBe(2);
  });

  it('creates a copy-handoff revision on demand', () => {
    const c = ctx();
    const { capsuleId } = setup(c);
    const changed = updateCapsule(c.db, capsuleId, { notes: 'about to copy' }, { reason: null });
    expect(changed.ok).toBe(true);
    const result = addRevision(c.db, capsuleId, 'copy-handoff');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.skipped).toBe(false);
    expect(result.value.revision?.reason).toBe('copy-handoff');
  });

  it('skips an identical revision', () => {
    const c = ctx();
    const { capsuleId } = setup(c);
    const before = listRevisions(c.db, capsuleId);

    const noOpUpdate = updateCapsule(
      c.db,
      capsuleId,
      {},
      { reason: 'manual-save' },
    );
    expect(noOpUpdate.ok).toBe(true);
    const after = listRevisions(c.db, capsuleId);
    expect(after).toHaveLength(before.length);

    const second = addRevision(c.db, capsuleId, 'manual-save');
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value.skipped).toBe(true);
      expect(second.value.revision).toBeNull();
    }
    expect(listRevisions(c.db, capsuleId)).toHaveLength(before.length);
  });

  it('creates a status-change revision automatically on status change', () => {
    const c = ctx();
    const { capsuleId } = setup(c);
    const updated = updateCapsule(c.db, capsuleId, { status: 'Verified' });
    expect(updated.ok).toBe(true);
    const revisions = listRevisions(c.db, capsuleId);
    expect(revisions).toHaveLength(2);
    expect(revisions[0].reason).toBe('status-change');
  });

  it('does not create a revision when reason is explicitly null', () => {
    const c = ctx();
    const { capsuleId } = setup(c);
    const updated = updateCapsule(
      c.db,
      capsuleId,
      { notes: 'silent change' },
      { reason: null },
    );
    expect(updated.ok).toBe(true);
    expect(listRevisions(c.db, capsuleId)).toHaveLength(1);
  });

  it('keeps at most 50 revisions per capsule while version keeps increasing', () => {
    const c = ctx();
    const { capsuleId } = setup(c);
    for (let i = 0; i < 60; i += 1) {
      const updated = updateCapsule(
        c.db,
        capsuleId,
        { notes: `edit ${i} ${'x'.repeat(i + 1)}` },
        { reason: 'manual-save' },
      );
      if (!updated.ok) throw new Error(`update ${i} failed`);
    }
    const revisions = listRevisions(c.db, capsuleId);
    expect(revisions).toHaveLength(50);
    const capsule = getCapsule(c.db, capsuleId);
    expect(capsule.ok).toBe(true);
    if (capsule.ok) {
      expect(capsule.value.version).toBe(61);
      expect(revisions[0].version).toBe(61);
      expect(revisions[revisions.length - 1].version).toBe(12);
    }
  });

  it('returns NOT_FOUND when revising a missing capsule', () => {
    const c = ctx();
    const result = addRevision(c.db, 'missing', 'manual-save');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });

  it('lists revisions newest-first with parseable snapshots', () => {
    const c = ctx();
    const { capsuleId } = setup(c);
    updateCapsule(c.db, capsuleId, { notes: 'second' }, { reason: 'manual-save' });
    updateCapsule(c.db, capsuleId, { notes: 'third' }, { reason: 'manual-save' });
    const revisions = listRevisions(c.db, capsuleId);
    expect(revisions.map((r) => r.version)).toEqual([3, 2, 1]);
    const snapshot = JSON.parse(revisions[0].snapshotJson) as { notes: string };
    expect(snapshot.notes).toBe('third');
  });
});
