export const CAPSULE_TYPES = [
  'Master Context',
  'Architecture',
  'Decision',
  'Current Task',
  'Session Handoff',
  'Bug Report',
  'Research',
  'Prompt Template',
  'Release Notes',
  'Other',
] as const;
export type CapsuleType = (typeof CAPSULE_TYPES)[number];

export const CAPSULE_STATUSES = ['Draft', 'Active', 'Verified', 'Deprecated', 'Archived'] as const;
export type CapsuleStatus = (typeof CAPSULE_STATUSES)[number];

export interface GitSnapshotInfo {
  repositoryRoot?: string;
  head?: string;
  branch?: string;
  detached?: boolean;
  workingTreeClean?: boolean;
  changedFiles?: string[];
  capturedAt?: string;
}

export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string;
  repositoryPath: string;
  activeCapsuleId: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
}

export interface Capsule {
  id: string;
  projectId: string;
  title: string;
  type: CapsuleType;
  status: CapsuleStatus;
  summary: string;
  goal: string;
  currentTask: string;
  completedWork: string;
  changedFiles: string[];
  commandsRun: string[];
  verificationResults: string;
  knownIssues: string;
  nextTask: string;
  rulesConstraints: string;
  architectureNotes: string;
  notes: string;
  contentMarkdown: string;
  gitHead: string;
  gitBranch: string;
  gitSnapshot: GitSnapshotInfo | null;
  tokenEstimate: number;
  source: 'manual' | 'imported';
  importedOriginalId: string | null;
  version: number;
  parentCapsuleId: string | null;
  createdAt: string;
  updatedAt: string;
  archivedAt: string | null;
  deletedAt: string | null;
}

export interface Tag {
  id: string;
  name: string;
  createdAt: string;
}

export type RevisionReason =
  'create' | 'manual-save' | 'copy-handoff' | 'import' | 'status-change' | 'duplicate';

export interface CapsuleRevision {
  id: string;
  capsuleId: string;
  version: number;
  snapshotJson: string;
  reason: RevisionReason | string;
  createdAt: string;
}

export type AppErrorCode =
  'NOT_FOUND' | 'VALIDATION' | 'CONFLICT' | 'INVALID_STATE' | 'GIT_UNAVAILABLE' | 'INTERNAL';

export interface AppError {
  code: AppErrorCode;
  message: string;
  details?: Array<{ field: string; message: string }>;
}

export type AppResult<T> = { ok: true; value: T } | { ok: false; error: AppError };

export function ok<T>(value: T): AppResult<T> {
  return { ok: true, value };
}

export function err<T>(
  code: AppErrorCode,
  message: string,
  details?: Array<{ field: string; message: string }>,
): AppResult<T> {
  return details
    ? { ok: false, error: { code, message, details } }
    : { ok: false, error: { code, message } };
}
