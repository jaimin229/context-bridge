import type { Database } from 'better-sqlite3';
import { err, ok, type AppResult, type Tag } from '../types';
import { newId, nowIso } from '../util';

interface TagRow {
  id: string;
  name: string;
  created_at: string;
}

function mapTag(row: TagRow): Tag {
  return { id: row.id, name: row.name, createdAt: row.created_at };
}

const UNSAFE_TAG_CHARS = /[,;[\]{}]/;

/** Tag names are normalized: trimmed, lowercased, internal whitespace collapsed. */
export function normalizeTagName(name: string): string {
  return name.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function createTag(db: Database, name: string): AppResult<Tag> {
  const normalized = normalizeTagName(name);
  if (normalized.length === 0 || normalized.length > 60) {
    return err('VALIDATION', 'Tag name must be 1-60 characters.');
  }
  if (UNSAFE_TAG_CHARS.test(normalized)) {
    return err('VALIDATION', 'Tag name must not contain , ; [ ] { }.');
  }
  const existing = db.prepare('SELECT id, name, created_at FROM tags WHERE name = ?').get(
    normalized,
  ) as TagRow | undefined;
  if (existing) {
    return ok(mapTag(existing));
  }
  const id = newId();
  const createdAt = nowIso();
  db.prepare('INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?)').run(
    id,
    normalized,
    createdAt,
  );
  return ok({ id, name: normalized, createdAt });
}

export function listTags(db: Database): Tag[] {
  const rows = db
    .prepare('SELECT id, name, created_at FROM tags ORDER BY name ASC')
    .all() as TagRow[];
  return rows.map(mapTag);
}

export function getTagsForCapsule(db: Database, capsuleId: string): Tag[] {
  const rows = db
    .prepare(
      `SELECT t.id, t.name, t.created_at
       FROM tags t
       JOIN capsule_tags ct ON ct.tag_id = t.id
       WHERE ct.capsule_id = ?
       ORDER BY t.name ASC`,
    )
    .all(capsuleId) as TagRow[];
  return rows.map(mapTag);
}

/**
 * Replaces the tag set of a capsule. Creates missing tags.
 * Returns the resulting tags; on invalid input returns a validation error
 * without modifying anything.
 */
export function setCapsuleTags(
  db: Database,
  capsuleId: string,
  tagNames: string[],
): AppResult<Tag[]> {
  const normalized = tagNames.map(normalizeTagName);
  for (const name of normalized) {
    if (name.length === 0 || name.length > 60) {
      return err('VALIDATION', 'Tag names must be 1-60 characters.');
    }
    if (UNSAFE_TAG_CHARS.test(name)) {
      return err('VALIDATION', 'Tag names must not contain , ; [ ] { }.');
    }
  }
  const unique = [...new Set(normalized)];
  const ensure = db.prepare(
    'INSERT INTO tags (id, name, created_at) VALUES (?, ?, ?) ON CONFLICT(name) DO NOTHING',
  );
  const select = db.prepare('SELECT id, name, created_at FROM tags WHERE name = ?');
  const replace = db.prepare('DELETE FROM capsule_tags WHERE capsule_id = ?');
  const link = db.prepare('INSERT INTO capsule_tags (capsule_id, tag_id) VALUES (?, ?)');

  const tx = db.transaction(() => {
    replace.run(capsuleId);
    for (const name of unique) {
      ensure.run(newId(), name, nowIso());
      const row = select.get(name) as TagRow;
      link.run(capsuleId, row.id);
    }
  });
  tx();

  return ok(getTagsForCapsule(db, capsuleId));
}

export function deleteTag(db: Database, tagId: string): AppResult<number> {
  const info = db.prepare('DELETE FROM tags WHERE id = ?').run(tagId);
  if (info.changes === 0) {
    return err('NOT_FOUND', `Tag not found: ${tagId}`);
  }
  return ok(info.changes);
}
