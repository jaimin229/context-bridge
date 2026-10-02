export {
  openDatabase,
  checkFts5,
  probeSqlite,
  type OpenDatabaseOptions,
  type Fts5CheckResult,
  type SqliteProbeResult,
} from './database';

export { runMigrations, type MigrationRunResult } from './migrate';

export {
  CAPSULE_TYPES,
  CAPSULE_STATUSES,
  type CapsuleType,
  type CapsuleStatus,
  type GitSnapshotInfo,
  type Project,
  type Capsule,
  type Tag,
  type RevisionReason,
  type CapsuleRevision,
  type AppError,
  type AppErrorCode,
  type AppResult,
  ok,
  err,
} from './types';

export {
  capsuleInputSchema,
  capsulePatchSchema,
  capsuleListFilterSchema,
  capsuleStatusSchema,
  capsuleTypeSchema,
  exportDocumentSchema,
  formatZodIssues,
  projectInputSchema,
  projectPatchSchema,
  type CapsuleInput,
  type CapsulePatch,
  type CapsuleListFilter,
  type ExportDocument,
  type ProjectInput,
  type ProjectPatch,
} from './schemas';

export {
  createProject,
  getProject,
  getProjectBySlug,
  listProjects,
  setProjectArchived,
  updateProject,
} from './repo/projects';

export {
  createCapsule,
  duplicateCapsule,
  getActiveHandoff,
  getCapsule,
  listCapsules,
  loadMasterContext,
  restoreCapsule,
  setActiveHandoff,
  setCapsuleArchived,
  softDeleteCapsule,
  updateCapsule,
  type CreateCapsuleOptions,
  type UpdateCapsuleOptions,
} from './repo/capsules';

export {
  createTag,
  deleteTag,
  getTagsForCapsule,
  listTags,
  normalizeTagName,
  setCapsuleTags,
} from './repo/tags';

export { addRevision, capsuleSnapshot, getRevision, listRevisions } from './repo/revisions';

export { getSetting, listSettings, setSetting } from './repo/settings';

export { DEFAULT_TOKEN_BUDGET, estimateTokens } from './handoff/tokens';

export {
  generateHandoff,
  type GenerateHandoffOptions,
  type HandoffDriftInfo,
  type MasterContextInfo,
} from './handoff/generator';

export {
  FRONT_MATTER_FENCE,
  FRONT_MATTER_KEYS,
  buildFrontMatter,
  parseFrontMatter,
} from './io/frontMatter';

export {
  toJsonExport,
  toJsonExportString,
  toMarkdownExport,
  type JsonExportDocument,
} from './io/export';

export {
  importNormalized,
  normalizeJsonImport,
  parseJsonImport,
  parseMarkdownImport,
  type MarkdownImportResult,
  type NormalizedImport,
} from './io/import';

export { newId, nowIso, slugify } from './util';

export { captureGitSnapshot, parsePorcelainStatus } from './git/capture';

export { detectDrift, type DriftReason, type DriftReport } from './git/drift';

export {
  SNIPPET_CLOSE,
  SNIPPET_OPEN,
  buildMatchQuery,
  searchCapsules,
  type SearchFilter,
  type SearchHit,
  type SearchOutcome,
} from './search/search';

export {
  SECRET_RULES,
  redactMatch,
  scanSecrets,
  type SecretFinding,
  type SecretRule,
  type SecretSeverity,
} from './secrets/scan';
