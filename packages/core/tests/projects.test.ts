import { afterEach, describe, expect, it } from 'vitest';
import {
  createProject,
  getProject,
  getProjectBySlug,
  listProjects,
  setProjectArchived,
  updateProject,
} from '../src/index';
import { createTestDb, type TestContext } from './helpers';

const contexts: TestContext[] = [];
function ctx(): TestContext {
  const c = createTestDb('projects');
  contexts.push(c);
  return c;
}
afterEach(() => {
  while (contexts.length > 0) {
    contexts.pop()?.cleanup();
  }
});

describe('project CRUD', () => {
  it('creates a project with slug, defaults, and ISO timestamps', () => {
    const c = ctx();
    const result = createProject(c.db, {
      name: 'My Cool App',
      description: 'A test app',
      repositoryPath: 'C:\\dev\\my-cool-app',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.name).toBe('My Cool App');
    expect(result.value.slug).toBe('my-cool-app');
    expect(result.value.description).toBe('A test app');
    expect(result.value.repositoryPath).toBe('C:\\dev\\my-cool-app');
    expect(result.value.activeCapsuleId).toBeNull();
    expect(result.value.archivedAt).toBeNull();
    expect(Number.isNaN(Date.parse(result.value.createdAt))).toBe(false);
    expect(Number.isNaN(Date.parse(result.value.updatedAt))).toBe(false);
  });

  it('rejects an empty name with a field-level validation error', () => {
    const c = ctx();
    const result = createProject(c.db, { name: '   ' });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error.code).toBe('VALIDATION');
    expect(result.error.details?.[0]?.field).toBe('name');
  });

  it('generates unique slugs for duplicate names', () => {
    const c = ctx();
    const a = createProject(c.db, { name: 'Dup Name' });
    const b = createProject(c.db, { name: 'Dup Name' });
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(a.value.slug).toBe('dup-name');
    expect(b.value.slug).toBe('dup-name-2');
  });

  it('reads projects by id and slug, and reports NOT_FOUND for missing ids', () => {
    const c = ctx();
    const created = createProject(c.db, { name: 'Lookup' });
    if (!created.ok) throw new Error('setup failed');
    expect(getProject(c.db, created.value.id).ok).toBe(true);
    expect(getProjectBySlug(c.db, 'lookup').ok).toBe(true);
    const missing = getProject(c.db, 'does-not-exist');
    expect(missing.ok).toBe(false);
    if (!missing.ok) {
      expect(missing.error.code).toBe('NOT_FOUND');
    }
  });

  it('updates name, description, and repository path', () => {
    const c = ctx();
    const created = createProject(c.db, { name: 'Before' });
    if (!created.ok) throw new Error('setup failed');
    const updated = updateProject(c.db, created.value.id, {
      name: 'After',
      description: 'updated',
      repositoryPath: '/tmp/repo',
    });
    expect(updated.ok).toBe(true);
    if (!updated.ok) return;
    expect(updated.value.name).toBe('After');
    expect(updated.value.slug).toBe('before');
    expect(updated.value.description).toBe('updated');
    expect(updated.value.repositoryPath).toBe('/tmp/repo');
  });

  it('rejects invalid updates', () => {
    const c = ctx();
    const created = createProject(c.db, { name: 'Patch' });
    if (!created.ok) throw new Error('setup failed');
    const updated = updateProject(c.db, created.value.id, { name: '' });
    expect(updated.ok).toBe(false);
    if (!updated.ok) {
      expect(updated.error.code).toBe('VALIDATION');
    }
  });

  it('archives and unarchives projects, affecting default listing', () => {
    const c = ctx();
    const created = createProject(c.db, { name: 'Archivable' });
    if (!created.ok) throw new Error('setup failed');

    expect(listProjects(c.db)).toHaveLength(1);
    const archived = setProjectArchived(c.db, created.value.id, true);
    expect(archived.ok && archived.value.archivedAt !== null).toBe(true);
    expect(listProjects(c.db)).toHaveLength(0);
    expect(listProjects(c.db, { includeArchived: true })).toHaveLength(1);

    const restored = setProjectArchived(c.db, created.value.id, false);
    expect(restored.ok && restored.value.archivedAt === null).toBe(true);
    expect(listProjects(c.db)).toHaveLength(1);
  });

  it('setProjectArchived on a missing project returns NOT_FOUND', () => {
    const c = ctx();
    const result = setProjectArchived(c.db, 'missing', true);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('NOT_FOUND');
    }
  });
});
