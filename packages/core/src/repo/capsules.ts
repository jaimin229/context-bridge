import type { Database } from 'better-sqlite3';
import {
  capsuleInputSchema,
  capsuleListFilterSchema,
  capsulePatchSchema,
  formatZodIssues,
} from '../schemas';
import {
  generateHandoff,
  type MasterContextInfo,
} from '../handoff/generator';
import { estimateTokens } from '../handoff/tokens';
import {
  err,
  ok,
  type AppResult,
  type Capsule,
  type CapsuleType,
  type Project,
  type RevisionReason,
} from '../types';
import type { CapsuleListFilter } from '../schemas';
import { newId, nowIso, parseJsonArray } from '../util';
import { getProject } from './projects';
import { addRevision, getCapsuleById } from './revisions';
import { getTagsForCapsule, setCapsuleTags } from './tags';

const CAPSULE_COLUMNS = `
  id, project_id, title, type, status, summary, goal, current_task,
  completed_work, changed_files, commands_run, verification_results,
  known_issues, next_task, rules_constraints, architecture_notes, notes,
  content_markdown, git_head, git_branch, git_snapshot, token_estimate,
  source, imported_original_id, version, parent_capsule_id,
  created_at, updated_at, archived_at, deleted_at
`;

export interface CreateCapsuleOptions {
  revisionReason?: RevisionReason;
  parentCapsuleId?: string | null;
  source?: 'manual' | 'imported';
  importedOriginalId?: string | null;
  preserveId?: string;
  createdAt?: string;
  updatedAt?: string;
}

export function loadMasterContext(
  db: Database,
  projectId: string,
): MasterContextInfo | null {
  const row = db
    .prepare(
      `SELECT id, goal, architecture_notes, rules_constraints
       FROM capsules
       WHERE project_id = ? AND type = 'Master Context' AND deleted_at IS NULL
       ORDER BY updated_at DESC
       LIMIT 1`,
    )
    .get(projectId) as
    | { id: string; goal: string; architecture_notes: string; rules_constraints: string }
    | undefined;
  if (!row) {
    return null;
  }
  return {
    goal: row.goal,
    architectureNotes: row.architecture_notes,
    rulesConstraints: row.rules_constraints,
  };
}

function deriveContent(
  db: Database,
  capsule: Pick<
    Capsule,
    | 'type'
    | 'goal'
    | 'currentTask'
    | 'completedWork'
    | 'changedFiles'
    | 'commandsRun'
    | 'verificationResults'
    | 'knownIssues'
    | 'architectureNotes'
    | 'rulesConstraints'
    | 'nextTask'
    | 'gitHead'
    | 'gitBranch'
    | 'gitSnapshot'
  >,
  project: Pick<Project, 'name' | 'repositoryPath'>,
  projectId: string,
): { contentMarkdown: string; tokenEstimate: number } {
  const master = loadMasterContext(db, projectId);
  const contentMarkdown = generateHandoff(capsule, project, master, {});
  return { contentMarkdown, tokenEstimate: estimateTokens(contentMarkdown) };
}

export function getCapsule(
  db: Database,
  id: string,
  options: { includeDeleted?: boolean } = {},
): AppResult<Capsule> {
  const result = getCapsuleById(db, id);
  if (!result.ok) {
    return result;
  }
  if (result.value.deletedAt !== null && !options.includeDeleted) {
    return err('NOT_FOUND', `Capsule not found: ${id}`);
  }
  return result;
}

export function createCapsule(
  db: Database,
  projectId: string,
  input: unknown,
  options: CreateCapsuleOptions = {},
): AppResult<Capsule> {
  const project = getProject(db, projectId);
  if (!project.ok) {
    return project;
  }
  const parsed = capsuleInputSchema.safeParse(input);
  if (!parsed.success) {
    return err('VALIDATION', 'Invalid capsule input.', formatZodIssues(parsed.error));
  }
  const data = parsed.data;

  const id = options.preserveId ?? newId();
  if (options.preserveId) {
    const collision = db.prepare('SELECT 1 FROM capsules WHERE id = ?').get(options.preserveId);
    if (collision) {
      return err('CONFLICT', `Capsule id already exists: ${options.preserveId}`);
    }
  }

  const now = nowIso();
  const createdAt = options.createdAt ?? now;
  const title = data.title && data.title.length > 0 ? data.title : 'Untitled Handoff';
  const type: CapsuleType = data.type ?? 'Session Handoff';
  const status = data.status ?? 'Draft';
  const changedFiles = data.changedFiles ?? [];
  const commandsRun = data.commandsRun ?? [];
  const gitSnapshot = data.gitSnapshot ?? null;

  const draftCapsule = {
    type,
    goal: data.goal ?? '',
    currentTask: data.currentTask ?? '',
    completedWork: data.completedWork ?? '',
    changedFiles,
    commandsRun,
    verificationResults: data.verificationResults ?? '',
    knownIssues: data.knownIssues ?? '',
    architectureNotes: data.architectureNotes ?? '',
    rulesConstraints: data.rulesConstraints ?? '',
    nextTask: data.nextTask ?? '',
    gitHead: data.gitHead ?? '',
    gitBranch: data.gitBranch ?? '',
    gitSnapshot,
  };
  const derived = deriveContent(db, draftCapsule, project.value, projectId);

  const tx = db.transaction(() => {
    db.prepare(
      `INSERT INTO capsules (
         id, project_id, title, type, status, summary, goal, current_task,
         completed_work, changed_files, commands_run, verification_results,
         known_issues, next_task, rules_constraints, architecture_notes, notes,
         content_markdown, git_head, git_branch, git_snapshot, token_estimate,
         source, imported_original_id, version, parent_capsule_id,
         created_at, updated_at, archived_at, deleted_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, NULL)`,
    ).run(
      id,
      projectId,
      title,
      type,
      status,
      data.summary ?? '',
      draftCapsule.goal,
      draftCapsule.currentTask,
      draftCapsule.completedWork,
      JSON.stringify(draftCapsule.changedFiles),
      JSON.stringify(draftCapsule.commandsRun),
      draftCapsule.verificationResults,
      draftCapsule.knownIssues,
      draftCapsule.nextTask,
      draftCapsule.rulesConstraints,
      draftCapsule.architectureNotes,
      data.notes ?? '',
      derived.contentMarkdown,
      draftCapsule.gitHead,
      draftCapsule.gitBranch,
      gitSnapshot === null ? null : JSON.stringify(gitSnapshot),
      derived.tokenEstimate,
      options.source ?? 'manual',
      options.importedOriginalId ?? null,
      1,
      options.parentCapsuleId ?? null,
      createdAt,
      options.updatedAt ?? now,
    );
    if (data.tags) {
      setCapsuleTags(db, id, data.tags);
    }
  });
  tx();

  const revision = addRevision(db, id, options.revisionReason ?? 'create');
  if (!revision.ok) {
    return revision;
  }
  return getCapsule(db, id);
}

export interface UpdateCapsuleOptions {
  /** Explicit revision reason; `null` skips revision creation entirely. */
  reason?: RevisionReason | null;
}

export function updateCapsule(
  db: Database,
  id: string,
  patch: unknown,
  options: UpdateCapsuleOptions = {},
): AppResult<Capsule> {
  const existing = getCapsule(db, id);
  if (!existing.ok) {
    return existing;
  }
  const parsed = capsulePatchSchema.safeParse(patch);
  if (!parsed.success) {
    return err('VALIDATION', 'Invalid capsule patch.', formatZodIssues(parsed.error));
  }
  const data = parsed.data;
  const current = existing.value;
  const project = getProject(db, current.projectId);
  if (!project.ok) {
    return project;
  }

  const statusChanged = data.status !== undefined && data.status !== current.status;

  const next = {
    title: data.title !== undefined && data.title.length > 0 ? data.title : current.title,
    type: data.type ?? current.type,
    status: data.status ?? current.status,
    summary: data.summary ?? current.summary,
    goal: data.goal ?? current.goal,
    currentTask: data.currentTask ?? current.currentTask,
    completedWork: data.completedWork ?? current.completedWork,
    changedFiles: data.changedFiles ?? current.changedFiles,
    commandsRun: data.commandsRun ?? current.commandsRun,
    verificationResults: data.verificationResults ?? current.verificationResults,
    knownIssues: data.knownIssues ?? current.knownIssues,
    nextTask: data.nextTask ?? current.nextTask,
    rulesConstraints: data.rulesConstraints ?? current.rulesConstraints,
    architectureNotes: data.architectureNotes ?? current.architectureNotes,
    notes: data.notes ?? current.notes,
    gitHead: data.gitHead ?? current.gitHead,
    gitBranch: data.gitBranch ?? current.gitBranch,
    gitSnapshot: data.gitSnapshot !== undefined ? data.gitSnapshot : current.gitSnapshot,
  };

  const derived = deriveContent(db, next, project.value, current.projectId);

  const tx = db.transaction(() => {
    db.prepare(
      `UPDATE capsules SET
         title = ?, type = ?, status = ?, summary = ?, goal = ?, current_task = ?,
         completed_work = ?, changed_files = ?, commands_run = ?,
         verification_results = ?, known_issues = ?, next_task = ?,
         rules_constraints = ?, architecture_notes = ?, notes = ?,
         content_markdown = ?, git_head = ?, git_branch = ?, git_snapshot = ?,
         token_estimate = ?, updated_at = ?
       WHERE id = ?`,
    ).run(
      next.title,
      next.type,
      next.status,
      next.summary,
      next.goal,
      next.currentTask,
      next.completedWork,
      JSON.stringify(next.changedFiles),
      JSON.stringify(next.commandsRun),
      next.verificationResults,
      next.knownIssues,
      next.nextTask,
      next.rulesConstraints,
      next.architectureNotes,
      next.notes,
      derived.contentMarkdown,
      next.gitHead,
      next.gitBranch,
      next.gitSnapshot === null ? null : JSON.stringify(next.gitSnapshot),
      derived.tokenEstimate,
      nowIso(),
      id,
    );
    if (data.tags !== undefined) {
      setCapsuleTags(db, id, data.tags);
    }
  });
  tx();

  const wantsRevision =
    options.reason === null
      ? false
      : options.reason !== undefined
        ? true
        : statusChanged;
  if (wantsRevision) {
    const revision = addRevision(
      db,
      id,
      options.reason ?? 'status-change',
    );
    if (!revision.ok) {
      return revision;
    }
  }

  return getCapsule(db, id);
}

export function listCapsules(
  db: Database,
  filterInput: CapsuleListFilter | unknown = {},
): AppResult<Capsule[]> {
  const parsed = capsuleListFilterSchema.safeParse(filterInput ?? {});
  if (!parsed.success) {
    return err('VALIDATION', 'Invalid list filter.', formatZodIssues(parsed.error));
  }
  const filter = parsed.data;

  const where: string[] = [];
  const params: unknown[] = [];

  if (!filter.includeDeleted) {
    where.push('deleted_at IS NULL');
  }
  if (!filter.includeArchived) {
    where.push('archived_at IS NULL');
  }
  if (filter.projectId) {
    where.push('project_id = ?');
    params.push(filter.projectId);
  }
  if (filter.types && filter.types.length > 0) {
    where.push(`type IN (${filter.types.map(() => '?').join(', ')})`);
    params.push(...filter.types);
  }
  if (filter.statuses && filter.statuses.length > 0) {
    where.push(`status IN (${filter.statuses.map(() => '?').join(', ')})`);
    params.push(...filter.statuses);
  }
  if (filter.tagNames && filter.tagNames.length > 0) {
    const normalized = filter.tagNames.map((n) => n.trim().toLowerCase());
    where.push(
      `EXISTS (
         SELECT 1 FROM capsule_tags ct
         JOIN tags t ON t.id = ct.tag_id
         WHERE ct.capsule_id = capsules.id AND t.name IN (${normalized.map(() => '?').join(', ')})
       )`,
    );
    params.push(...normalized);
  }
  if (filter.updatedFrom) {
    where.push('updated_at >= ?');
    params.push(filter.updatedFrom);
  }
  if (filter.updatedTo) {
    where.push('updated_at <= ?');
    params.push(filter.updatedTo);
  }

  const sort =
    filter.sort === 'updated-asc'
      ? 'updated_at ASC'
      : filter.sort === 'title-asc'
        ? 'title COLLATE NOCASE ASC'
        : 'updated_at DESC';

  const limit = filter.limit ?? 200;
  const offset = filter.offset ?? 0;

  const sql = `
    SELECT ${CAPSULE_COLUMNS}
    FROM capsules
    ${where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''}
    ORDER BY ${sort}
    LIMIT ? OFFSET ?
  `;
  params.push(limit, offset);

  const rows = db.prepare(sql).all(...params) as RawCapsuleRow[];
  return ok(rows.map(mapCapsuleRow));
}

function mapCapsuleRow(row: RawCapsuleRow): Capsule {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    type: row.type,
    status: row.status,
    summary: row.summary,
    goal: row.goal,
    currentTask: row.current_task,
    completedWork: row.completed_work,
    changedFiles: parseJsonArray(row.changed_files),
    commandsRun: parseJsonArray(row.commands_run),
    verificationResults: row.verification_results,
    knownIssues: row.known_issues,
    nextTask: row.next_task,
    rulesConstraints: row.rules_constraints,
    architectureNotes: row.architecture_notes,
    notes: row.notes,
    contentMarkdown: row.content_markdown,
    gitHead: row.git_head,
    gitBranch: row.git_branch,
    gitSnapshot: parseSnapshot(row.git_snapshot),
    tokenEstimate: row.token_estimate,
    source: row.source === 'imported' ? 'imported' : 'manual',
    importedOriginalId: row.imported_original_id,
    version: row.version,
    parentCapsuleId: row.parent_capsule_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
  };
}

interface RawCapsuleRow {
  id: string;
  project_id: string;
  title: string;
  type: Capsule['type'];
  status: Capsule['status'];
  summary: string;
  goal: string;
  current_task: string;
  completed_work: string;
  changed_files: string;
  commands_run: string;
  verification_results: string;
  known_issues: string;
  next_task: string;
  rules_constraints: string;
  architecture_notes: string;
  notes: string;
  content_markdown: string;
  git_head: string;
  git_branch: string;
  git_snapshot: string | null;
  token_estimate: number;
  source: string;
  imported_original_id: string | null;
  version: number;
  parent_capsule_id: string | null;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  deleted_at: string | null;
}

function parseSnapshot(value: string | null): Capsule['gitSnapshot'] {
  if (value === null) {
    return null;
  }
  try {
    return JSON.parse(value) as Capsule['gitSnapshot'];
  } catch {
    return null;
  }
}

export function setCapsuleArchived(
  db: Database,
  id: string,
  archived: boolean,
): AppResult<Capsule> {
  const existing = getCapsule(db, id);
  if (!existing.ok) {
    return existing;
  }
  const tx = db.transaction(() => {
    db.prepare('UPDATE capsules SET archived_at = ?, updated_at = ? WHERE id = ?').run(
      archived ? nowIso() : null,
      nowIso(),
      id,
    );
    if (archived) {
      // archived capsules must not remain the Active Handoff
      db.prepare(
        'UPDATE projects SET active_capsule_id = NULL, updated_at = ? WHERE active_capsule_id = ?',
      ).run(nowIso(), id);
    }
  });
  tx();
  return getCapsule(db, id);
}

export function softDeleteCapsule(db: Database, id: string): AppResult<Capsule> {
  const existing = getCapsule(db, id);
  if (!existing.ok) {
    return existing;
  }
  const now = nowIso();
  const tx = db.transaction(() => {
    db.prepare('UPDATE capsules SET deleted_at = ?, updated_at = ? WHERE id = ?').run(
      now,
      now,
      id,
    );
    db.prepare(
      'UPDATE projects SET active_capsule_id = NULL, updated_at = ? WHERE active_capsule_id = ?',
    ).run(now, id);
  });
  tx();
  return getCapsule(db, id, { includeDeleted: true });
}

export function restoreCapsule(db: Database, id: string): AppResult<Capsule> {
  const existing = getCapsule(db, id, { includeDeleted: true });
  if (!existing.ok) {
    return existing;
  }
  if (existing.value.deletedAt === null) {
    return err('INVALID_STATE', 'Capsule is not deleted.');
  }
  db.prepare('UPDATE capsules SET deleted_at = NULL, updated_at = ? WHERE id = ?').run(
    nowIso(),
    id,
  );
  return getCapsule(db, id);
}

export function duplicateCapsule(db: Database, id: string): AppResult<Capsule> {
  const source = getCapsule(db, id);
  if (!source.ok) {
    return source;
  }
  const s = source.value;
  const tags = getTagsForCapsule(db, id).map((t) => t.name);
  return createCapsule(
    db,
    s.projectId,
    {
      title: `${s.title} (copy)`,
      type: s.type,
      status: 'Draft',
      summary: s.summary,
      goal: s.goal,
      currentTask: s.currentTask,
      completedWork: s.completedWork,
      changedFiles: s.changedFiles,
      commandsRun: s.commandsRun,
      verificationResults: s.verificationResults,
      knownIssues: s.knownIssues,
      nextTask: s.nextTask,
      rulesConstraints: s.rulesConstraints,
      architectureNotes: s.architectureNotes,
      notes: s.notes,
      gitHead: s.gitHead,
      gitBranch: s.gitBranch,
      gitSnapshot: s.gitSnapshot,
      tags,
    },
    { revisionReason: 'duplicate', parentCapsuleId: s.id },
  );
}

export function setActiveHandoff(db: Database, capsuleId: string): AppResult<Project> {
  const capsule = getCapsule(db, capsuleId);
  if (!capsule.ok) {
    return capsule;
  }
  if (capsule.value.archivedAt !== null) {
    return err('INVALID_STATE', 'Archived capsules cannot be the Active Handoff.');
  }
  const project = getProject(db, capsule.value.projectId);
  if (!project.ok) {
    return project;
  }
  db.prepare(
    'UPDATE projects SET active_capsule_id = ?, updated_at = ? WHERE id = ?',
  ).run(capsuleId, nowIso(), project.value.id);
  return getProject(db, project.value.id);
}

export function getActiveHandoff(db: Database, projectId: string): AppResult<Capsule | null> {
  const project = getProject(db, projectId);
  if (!project.ok) {
    return project;
  }
  if (!project.value.activeCapsuleId) {
    return ok(null);
  }
  const capsule = getCapsule(db, project.value.activeCapsuleId);
  if (!capsule.ok) {
    return ok(null);
  }
  return ok(capsule.value);
}
