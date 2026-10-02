import type { Database } from 'better-sqlite3';
import { getTagsForCapsule } from './tags';
import { err, ok, type AppResult, type Capsule, type CapsuleRevision, type RevisionReason } from '../types';
import { newId, nowIso, parseJsonArray, parseJsonSnapshot } from '../util';
import type { GitSnapshotInfo } from '../types';

const MAX_REVISIONS = 50;

interface RevisionRow {
  id: string;
  capsule_id: string;
  version: number;
  snapshot_json: string;
  reason: string;
  created_at: string;
}

function mapRevision(row: RevisionRow): CapsuleRevision {
  return {
    id: row.id,
    capsuleId: row.capsule_id,
    version: row.version,
    snapshotJson: row.snapshot_json,
    reason: row.reason,
    createdAt: row.created_at,
  };
}

const SELECT_REVISION = `
  SELECT id, capsule_id, version, snapshot_json, reason, created_at
  FROM capsule_revisions
`;

/**
 * Stable, deterministic snapshot of a capsule's structured state including tags.
 * Key order is fixed so identical states always produce identical JSON.
 */
export function capsuleSnapshot(db: Database, capsule: Capsule): string {
  const tags = getTagsForCapsule(db, capsule.id).map((t) => t.name);
  const snapshot = {
    title: capsule.title,
    type: capsule.type,
    status: capsule.status,
    summary: capsule.summary,
    goal: capsule.goal,
    currentTask: capsule.currentTask,
    completedWork: capsule.completedWork,
    changedFiles: capsule.changedFiles,
    commandsRun: capsule.commandsRun,
    verificationResults: capsule.verificationResults,
    knownIssues: capsule.knownIssues,
    nextTask: capsule.nextTask,
    rulesConstraints: capsule.rulesConstraints,
    architectureNotes: capsule.architectureNotes,
    notes: capsule.notes,
    gitHead: capsule.gitHead,
    gitBranch: capsule.gitBranch,
    gitSnapshot: capsule.gitSnapshot,
    tags,
  };
  return JSON.stringify(snapshot);
}

export function listRevisions(db: Database, capsuleId: string): CapsuleRevision[] {
  const rows = db
    .prepare(`${SELECT_REVISION} WHERE capsule_id = ? ORDER BY version DESC, created_at DESC`)
    .all(capsuleId) as RevisionRow[];
  return rows.map(mapRevision);
}

export function getRevision(db: Database, revisionId: string): AppResult<CapsuleRevision> {
  const row = db.prepare(`${SELECT_REVISION} WHERE id = ?`).get(revisionId) as
    | RevisionRow
    | undefined;
  if (!row) {
    return err('NOT_FOUND', `Revision not found: ${revisionId}`);
  }
  return ok(mapRevision(row));
}

/**
 * Creates a revision for the capsule unless the newest revision already has an
 * identical snapshot (then returns { skipped: true }). Keeps at most
 * MAX_REVISIONS revisions per capsule and bumps capsule.version when a
 * revision is stored.
 */
export function addRevision(
  db: Database,
  capsuleId: string,
  reason: RevisionReason | string,
): AppResult<{ revision: CapsuleRevision | null; skipped: boolean }> {
  const capsuleRow = db
    .prepare('SELECT id, version FROM capsules WHERE id = ? AND deleted_at IS NULL')
    .get(capsuleId) as { id: string; version: number } | undefined;
  if (!capsuleRow) {
    return err('NOT_FOUND', `Capsule not found: ${capsuleId}`);
  }

  const capsuleResult = getCapsuleById(db, capsuleId);
  if (!capsuleResult.ok) {
    return capsuleResult;
  }
  const snapshot = capsuleSnapshot(db, capsuleResult.value);

  const latest = db
    .prepare(`${SELECT_REVISION} WHERE capsule_id = ? ORDER BY version DESC LIMIT 1`)
    .get(capsuleId) as RevisionRow | undefined;
  if (latest && latest.snapshot_json === snapshot) {
    return ok({ revision: null, skipped: true });
  }

  const isInitial = latest === undefined;
  const newVersion = isInitial ? capsuleRow.version : capsuleRow.version + 1;
  const revision: CapsuleRevision = {
    id: newId(),
    capsuleId,
    version: newVersion,
    snapshotJson: snapshot,
    reason,
    createdAt: nowIso(),
  };

  const tx = db.transaction(() => {
    db.prepare(
      'INSERT INTO capsule_revisions (id, capsule_id, version, snapshot_json, reason, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(
      revision.id,
      revision.capsuleId,
      revision.version,
      revision.snapshotJson,
      revision.reason,
      revision.createdAt,
    );
    if (!isInitial) {
      db.prepare('UPDATE capsules SET version = ?, updated_at = ? WHERE id = ?').run(
        newVersion,
        revision.createdAt,
        capsuleId,
      );
    }
    db.prepare(
      `DELETE FROM capsule_revisions
       WHERE capsule_id = ?
         AND id NOT IN (
           SELECT id FROM capsule_revisions
           WHERE capsule_id = ?
           ORDER BY version DESC, created_at DESC
           LIMIT ?
         )`,
    ).run(capsuleId, capsuleId, MAX_REVISIONS);
  });
  tx();

  return ok({ revision, skipped: false });
}

export function getCapsuleById(db: Database, capsuleId: string): AppResult<Capsule> {
  const row = db
    .prepare(
      `SELECT id, project_id, title, type, status, summary, goal, current_task,
              completed_work, changed_files, commands_run, verification_results,
              known_issues, next_task, rules_constraints, architecture_notes, notes,
              content_markdown, git_head, git_branch, git_snapshot, token_estimate,
              source, imported_original_id, version, parent_capsule_id,
              created_at, updated_at, archived_at, deleted_at
       FROM capsules WHERE id = ?`,
    )
    .get(capsuleId) as
    | {
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
    | undefined;
  if (!row) {
    return err('NOT_FOUND', `Capsule not found: ${capsuleId}`);
  }
  const snapshot = parseJsonSnapshot(row.git_snapshot);
  return ok({
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
    gitSnapshot: (snapshot as GitSnapshotInfo | null) ?? null,
    tokenEstimate: row.token_estimate,
    source: row.source === 'imported' ? 'imported' : 'manual',
    importedOriginalId: row.imported_original_id,
    version: row.version,
    parentCapsuleId: row.parent_capsule_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    archivedAt: row.archived_at,
    deletedAt: row.deleted_at,
  });
}
