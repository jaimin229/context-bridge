import type { Database } from 'better-sqlite3';
import { formatZodIssues, projectInputSchema, projectPatchSchema } from '../schemas';
import { err, ok, type AppResult, type Project } from '../types';
import { newId, nowIso, slugify, uniqueSlug } from '../util';

interface ProjectRow {
  id: string;
  name: string;
  slug: string;
  description: string;
  repository_path: string;
  active_capsule_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
}

function mapProject(row: ProjectRow): Project {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    description: row.description,
    repositoryPath: row.repository_path,
    activeCapsuleId: row.active_capsule_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
  };
}

const SELECT = `
  SELECT id, name, slug, description, repository_path, active_capsule_id,
         created_at, updated_at, archived_at
  FROM projects
`;

export function getProject(db: Database, id: string): AppResult<Project> {
  const row = db.prepare(`${SELECT} WHERE id = ?`).get(id) as ProjectRow | undefined;
  if (!row) {
    return err('NOT_FOUND', `Project not found: ${id}`);
  }
  return ok(mapProject(row));
}

export function getProjectBySlug(db: Database, slug: string): AppResult<Project> {
  const row = db.prepare(`${SELECT} WHERE slug = ?`).get(slug) as ProjectRow | undefined;
  if (!row) {
    return err('NOT_FOUND', `Project not found: ${slug}`);
  }
  return ok(mapProject(row));
}

export function listProjects(db: Database, options: { includeArchived?: boolean } = {}): Project[] {
  const where = options.includeArchived ? '' : ' WHERE archived_at IS NULL';
  const rows = db.prepare(`${SELECT}${where} ORDER BY updated_at DESC`).all() as ProjectRow[];
  return rows.map(mapProject);
}

export function createProject(db: Database, input: unknown): AppResult<Project> {
  const parsed = projectInputSchema.safeParse(input);
  if (!parsed.success) {
    return err('VALIDATION', 'Invalid project input.', formatZodIssues(parsed.error));
  }
  const id = newId();
  const now = nowIso();
  const slug = uniqueSlug(db, slugify(parsed.data.name));
  db.prepare(
    `INSERT INTO projects
       (id, name, slug, description, repository_path, active_capsule_id, created_at, updated_at, archived_at)
     VALUES (?, ?, ?, ?, ?, NULL, ?, ?, NULL)`,
  ).run(
    id,
    parsed.data.name,
    slug,
    parsed.data.description ?? '',
    parsed.data.repositoryPath ?? '',
    now,
    now,
  );
  return getProject(db, id);
}

export function updateProject(db: Database, id: string, patch: unknown): AppResult<Project> {
  const existing = getProject(db, id);
  if (!existing.ok) {
    return existing;
  }
  const parsed = projectPatchSchema.safeParse(patch);
  if (!parsed.success) {
    return err('VALIDATION', 'Invalid project patch.', formatZodIssues(parsed.error));
  }
  const next = {
    name: parsed.data.name ?? existing.value.name,
    description: parsed.data.description ?? existing.value.description,
    repositoryPath: parsed.data.repositoryPath ?? existing.value.repositoryPath,
  };
  db.prepare(
    'UPDATE projects SET name = ?, description = ?, repository_path = ?, updated_at = ? WHERE id = ?',
  ).run(next.name, next.description, next.repositoryPath, nowIso(), id);
  return getProject(db, id);
}

export function setProjectArchived(
  db: Database,
  id: string,
  archived: boolean,
): AppResult<Project> {
  const existing = getProject(db, id);
  if (!existing.ok) {
    return existing;
  }
  db.prepare('UPDATE projects SET archived_at = ?, updated_at = ? WHERE id = ?').run(
    archived ? nowIso() : null,
    nowIso(),
    id,
  );
  return getProject(db, id);
}
