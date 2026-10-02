import { afterEach, describe, expect, it } from 'vitest';
import {
  createCapsule,
  createProject,
  createTag,
  deleteTag,
  getTagsForCapsule,
  listTags,
  normalizeTagName,
  setCapsuleTags,
} from '../src/index';
import { createTestDb, type TestContext } from './helpers';

const contexts: TestContext[] = [];
function ctx(): TestContext {
  const c = createTestDb('tags');
  contexts.push(c);
  return c;
}
afterEach(() => {
  while (contexts.length > 0) {
    contexts.pop()?.cleanup();
  }
});

describe('tags', () => {
  it('normalizes tag names on create and reuses existing tags', () => {
    const c = ctx();
    const first = createTag(c.db, '  My Tag  ');
    expect(first.ok).toBe(true);
    if (!first.ok) return;
    expect(first.value.name).toBe('my tag');

    const second = createTag(c.db, 'MY TAG');
    expect(second.ok).toBe(true);
    if (second.ok) {
      expect(second.value.id).toBe(first.value.id);
    }
    expect(listTags(c.db)).toHaveLength(1);
  });

  it('rejects empty tags and unsafe characters', () => {
    const c = ctx();
    expect(createTag(c.db, '   ').ok).toBe(false);
    const comma = createTag(c.db, 'a,b');
    expect(comma.ok).toBe(false);
    if (!comma.ok) {
      expect(comma.error.code).toBe('VALIDATION');
    }
  });

  it('normalizeTagName lowercases and collapses whitespace', () => {
    expect(normalizeTagName('  Hello   World ')).toBe('hello world');
  });

  it('sets, replaces, and reads capsule tags', () => {
    const c = ctx();
    const p = createProject(c.db, { name: 'Tag Project' });
    if (!p.ok) throw new Error('setup failed');
    const cap = createCapsule(c.db, p.value.id, {
      title: 'Tagged',
      tags: ['alpha', 'beta'],
    });
    if (!cap.ok) throw new Error('setup failed');

    const tags = getTagsForCapsule(c.db, cap.value.id);
    expect(tags.map((t) => t.name)).toEqual(['alpha', 'beta']);

    const replaced = setCapsuleTags(c.db, cap.value.id, ['gamma']);
    expect(replaced.ok).toBe(true);
    if (replaced.ok) {
      expect(replaced.value.map((t) => t.name)).toEqual(['gamma']);
    }
    const after = getTagsForCapsule(c.db, cap.value.id);
    expect(after.map((t) => t.name)).toEqual(['gamma']);
  });

  it('deletes tags and their links', () => {
    const c = ctx();
    const p = createProject(c.db, { name: 'Del Project' });
    if (!p.ok) throw new Error('setup failed');
    const cap = createCapsule(c.db, p.value.id, {
      title: 'T',
      tags: ['doomed'],
    });
    if (!cap.ok) throw new Error('setup failed');
    const tag = createTag(c.db, 'doomed');
    if (!tag.ok) throw new Error('setup failed');

    const deleted = deleteTag(c.db, tag.value.id);
    expect(deleted.ok && deleted.value === 1).toBe(true);
    expect(getTagsForCapsule(c.db, cap.value.id)).toHaveLength(0);

    const again = deleteTag(c.db, tag.value.id);
    expect(again.ok).toBe(false);
    if (!again.ok) {
      expect(again.error.code).toBe('NOT_FOUND');
    }
  });

  it('rejects invalid tag sets without modifying existing tags', () => {
    const c = ctx();
    const p = createProject(c.db, { name: 'Guard Project' });
    if (!p.ok) throw new Error('setup failed');
    const cap = createCapsule(c.db, p.value.id, {
      title: 'Guarded',
      tags: ['keep'],
    });
    if (!cap.ok) throw new Error('setup failed');

    const result = setCapsuleTags(c.db, cap.value.id, ['ok', 'bad,tag']);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
    }
    const unchanged = getTagsForCapsule(c.db, cap.value.id);
    expect(unchanged.map((t) => t.name)).toEqual(['keep']);
  });
});
