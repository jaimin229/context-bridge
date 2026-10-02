import { afterEach, describe, expect, it } from 'vitest';
import {
  SNIPPET_CLOSE,
  SNIPPET_OPEN,
  buildMatchQuery,
  createCapsule,
  createProject,
  searchCapsules,
  setCapsuleArchived,
  softDeleteCapsule,
} from '../src/index';
import { createTestDb, type TestContext } from './helpers';

const contexts: TestContext[] = [];
function ctx(): TestContext {
  const c = createTestDb('search');
  contexts.push(c);
  return c;
}
afterEach(() => {
  while (contexts.length > 0) {
    contexts.pop()?.cleanup();
  }
});

function seed(c: TestContext): { projectId: string; migrationId: string } {
  const p = createProject(c.db, { name: 'Bridge API', repositoryPath: '' });
  if (!p.ok) throw new Error('seed failed');
  const migration = createCapsule(c.db, p.value.id, {
    title: 'Migration plan',
    type: 'Architecture',
    status: 'Active',
    summary: 'sequencing plan',
    goal: 'Roll out the schema migration safely',
    currentTask: 'Write the migration rollback strategy',
    tags: ['database'],
  });
  if (!migration.ok) throw new Error('seed failed');

  createCapsule(c.db, p.value.id, {
    title: 'Elephant enclosure',
    type: 'Research',
    status: 'Draft',
    summary: 'notes about habitats',
    goal: 'Study enclosure design',
  });

  createCapsule(c.db, p.value.id, {
    title: 'Fox hunt report',
    type: 'Bug Report',
    status: 'Draft',
    currentTask: 'the quick brown fox jumps over the lazy dog',
  });

  const archived = createCapsule(c.db, p.value.id, {
    title: 'Old migration notes',
    type: 'Other',
    status: 'Archived',
  });
  if (!archived.ok) throw new Error('seed failed');
  setCapsuleArchived(c.db, archived.value.id, true);

  const deleted = createCapsule(c.db, p.value.id, {
    title: 'Deleted migration draft',
    type: 'Other',
    status: 'Draft',
  });
  if (!deleted.ok) throw new Error('seed failed');
  softDeleteCapsule(c.db, deleted.value.id);

  return { projectId: p.value.id, migrationId: migration.value.id };
}

describe('buildMatchQuery', () => {
  it('quotes every term and prefixes the final one', () => {
    expect(buildMatchQuery('foo bar')).toBe('"foo" AND "bar"*');
    expect(buildMatchQuery('migrat')).toBe('"migrat"*');
  });

  it('keeps quoted phrases together', () => {
    expect(buildMatchQuery('"quick brown" fox')).toBe('"quick brown" AND "fox"*');
  });

  it('treats FTS operators as literal text', () => {
    expect(buildMatchQuery('NEAR(')).toBe('"NEAR("*');
    expect(buildMatchQuery('*')).toBe('"*"*');
    expect(buildMatchQuery('migration OR elephant')).toBe('"migration" AND "OR" AND "elephant"*');
    expect(buildMatchQuery('a:b')).toBe('"a:b"*');
  });

  it('returns null for input with no searchable terms', () => {
    expect(buildMatchQuery('')).toBeNull();
    expect(buildMatchQuery('   ')).toBeNull();
    expect(buildMatchQuery('""')).toBeNull();
    expect(buildMatchQuery('"   "')).toBeNull();
  });

  it('drops unbalanced quotes instead of leaking them', () => {
    expect(buildMatchQuery('a" b')).toBe('"a" AND "b"*');
  });
});

describe('searchCapsules', () => {
  it('finds results with a prefix query', () => {
    const c = ctx();
    const { migrationId } = seed(c);
    const result = searchCapsules(c.db, 'migrat');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const outcome = result.value;
    expect(outcome.normalizedQuery).toBe('"migrat"*');
    expect(outcome.hits.length).toBeGreaterThan(0);
    expect(outcome.hits[0].id).toBe(migrationId);
    expect(outcome.total).toBe(outcome.hits.length);
  });

  it('finds matches inside content and wraps them with snippet markers', () => {
    const c = ctx();
    seed(c);
    const result = searchCapsules(c.db, 'rollback');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hits).toHaveLength(1);
    const snippet = result.value.hits[0].snippet;
    expect(snippet).toContain(`${SNIPPET_OPEN}rollback${SNIPPET_CLOSE}`);
  });

  it('falls back to a title snippet when only the title matched', () => {
    const c = ctx();
    seed(c);
    const result = searchCapsules(c.db, 'elephant');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hits).toHaveLength(1);
    expect(result.value.hits[0].title).toBe('Elephant enclosure');
    expect(result.value.hits[0].snippet).toContain(SNIPPET_OPEN);
    expect(result.value.hits[0].snippet).toContain(SNIPPET_CLOSE);
  });

  it('requires quoted phrases to appear in order', () => {
    const c = ctx();
    seed(c);
    const hit = searchCapsules(c.db, '"quick brown fox"');
    expect(hit.ok).toBe(true);
    if (hit.ok) {
      expect(hit.value.hits).toHaveLength(1);
    }
    const miss = searchCapsules(c.db, '"brown quick"');
    expect(miss.ok).toBe(true);
    if (miss.ok) {
      expect(miss.value.hits).toHaveLength(0);
    }
  });

  it('excludes archived capsules by default and includes them on request', () => {
    const c = ctx();
    seed(c);
    const excluded = searchCapsules(c.db, 'migration');
    expect(excluded.ok).toBe(true);
    if (excluded.ok) {
      const titles = excluded.value.hits.map((h) => h.title);
      expect(titles).not.toContain('Old migration notes');
    }
    const included = searchCapsules(c.db, 'migration', {
      includeArchived: true,
    });
    expect(included.ok).toBe(true);
    if (included.ok) {
      expect(included.value.hits.map((h) => h.title)).toContain('Old migration notes');
    }
  });

  it('excludes soft-deleted capsules by default and includes them on request', () => {
    const c = ctx();
    seed(c);
    const excluded = searchCapsules(c.db, 'migration');
    expect(excluded.ok).toBe(true);
    if (excluded.ok) {
      expect(excluded.value.hits.map((h) => h.title)).not.toContain('Deleted migration draft');
    }
    const included = searchCapsules(c.db, 'migration', {
      includeDeleted: true,
    });
    expect(included.ok).toBe(true);
    if (included.ok) {
      expect(included.value.hits.map((h) => h.title)).toContain('Deleted migration draft');
    }
  });

  it('filters by project, type, status, and tag', () => {
    const c = ctx();
    const { projectId, migrationId } = seed(c);
    const other = createProject(c.db, { name: 'Other Project' });
    if (!other.ok) throw new Error('seed failed');
    const otherCapsule = createCapsule(c.db, other.value.id, {
      title: 'Other migration',
      type: 'Decision',
      status: 'Verified',
    });
    if (!otherCapsule.ok) throw new Error('seed failed');

    const byProject = searchCapsules(c.db, 'migration', { projectId });
    expect(byProject.ok).toBe(true);
    if (byProject.ok) {
      expect(byProject.value.hits.every((h) => h.projectId === projectId)).toBe(true);
      expect(byProject.value.hits.some((h) => h.id === otherCapsule.value.id)).toBe(false);
    }

    const byType = searchCapsules(c.db, 'migration', {
      types: ['Architecture'],
    });
    expect(byType.ok).toBe(true);
    if (byType.ok) {
      expect(byType.value.hits.map((h) => h.id)).toEqual([migrationId]);
    }

    const byStatus = searchCapsules(c.db, 'migration', {
      statuses: ['Verified'],
    });
    expect(byStatus.ok).toBe(true);
    if (byStatus.ok) {
      expect(byStatus.value.hits.map((h) => h.id)).toEqual([otherCapsule.value.id]);
    }

    const byTag = searchCapsules(c.db, 'migration', { tagNames: ['DATABASE'] });
    expect(byTag.ok).toBe(true);
    if (byTag.ok) {
      expect(byTag.value.hits.map((h) => h.id)).toEqual([migrationId]);
    }

    const noTag = searchCapsules(c.db, 'migration', {
      tagNames: ['missing-tag'],
    });
    expect(noTag.ok).toBe(true);
    if (noTag.ok) {
      expect(noTag.value.hits).toHaveLength(0);
    }
  });

  it('limits and pages results with a stable total', () => {
    const c = ctx();
    seed(c);
    const filter = { includeArchived: true, includeDeleted: true, limit: 1 };
    const first = searchCapsules(c.db, 'migration', filter);
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.hits).toHaveLength(1);
    expect(first.value.total).toBe(3);

    const second = searchCapsules(c.db, 'migration', { ...filter, offset: 1 });
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.hits).toHaveLength(1);
    expect(second.value.hits[0].id).not.toBe(first.value.hits[0].id);
    expect(second.value.total).toBe(3);
  });

  it('rejects an empty query with VALIDATION', () => {
    const c = ctx();
    seed(c);
    const result = searchCapsules(c.db, '   ');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
    }
  });

  it('rejects an over-long query with VALIDATION', () => {
    const c = ctx();
    seed(c);
    const result = searchCapsules(c.db, 'a'.repeat(1001));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
    }
  });

  it('survives hostile queries without throwing or altering data', () => {
    const c = ctx();
    const { migrationId } = seed(c);
    const hostile = [
      '"',
      "'",
      '*',
      '-',
      'NEAR(',
      'NEAR(a b, 999)',
      'a" OR "b',
      '(((((((',
      ';; DROP TABLE capsules; --',
      '^',
      '你好',
      'a'.repeat(900),
    ];
    for (const query of hostile) {
      const result = searchCapsules(c.db, query);
      expect(result.ok, `query failed: ${query}`).toBe(true);
    }
    const stillThere = searchCapsules(c.db, 'migrat');
    expect(stillThere.ok).toBe(true);
    if (stillThere.ok) {
      expect(stillThere.value.hits.map((h) => h.id)).toContain(migrationId);
    }
    const rows = c.db.prepare('SELECT count(*) AS n FROM capsules').get() as {
      n: number;
    };
    expect(rows.n).toBe(5);
  });

  it('returns an empty result for symbol-only queries', () => {
    const c = ctx();
    seed(c);
    const result = searchCapsules(c.db, '""');
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.hits).toHaveLength(0);
    expect(result.value.total).toBe(0);
    expect(result.value.normalizedQuery).toBe('');
  });
});
