import { z } from 'zod';
import { CAPSULE_STATUSES, CAPSULE_TYPES } from './types';

export const capsuleTypeSchema = z.enum(CAPSULE_TYPES);
export const capsuleStatusSchema = z.enum(CAPSULE_STATUSES);

const text = z.string();

export const projectInputSchema = z.object({
  name: z.string().trim().min(1, 'Project name is required').max(200),
  description: z.string().max(5000).optional(),
  repositoryPath: z.string().max(4096).optional(),
});
export type ProjectInput = z.infer<typeof projectInputSchema>;

export const projectPatchSchema = z
  .object({
    name: z.string().trim().min(1).max(200),
    description: z.string().max(5000),
    repositoryPath: z.string().max(4096),
  })
  .partial();
export type ProjectPatch = z.infer<typeof projectPatchSchema>;

export const capsuleInputSchema = z.object({
  title: z.string().trim().max(300).optional(),
  type: capsuleTypeSchema.optional(),
  status: capsuleStatusSchema.optional(),
  summary: text.max(20000).optional(),
  goal: text.max(100000).optional(),
  currentTask: text.max(100000).optional(),
  completedWork: text.max(100000).optional(),
  changedFiles: z.array(z.string().max(1024)).max(2000).optional(),
  commandsRun: z.array(z.string().max(2000)).max(1000).optional(),
  verificationResults: text.max(100000).optional(),
  knownIssues: text.max(100000).optional(),
  nextTask: text.max(100000).optional(),
  rulesConstraints: text.max(100000).optional(),
  architectureNotes: text.max(100000).optional(),
  notes: text.max(200000).optional(),
  gitHead: z.string().max(128).optional(),
  gitBranch: z.string().max(256).optional(),
  gitSnapshot: z
    .object({
      repositoryRoot: z.string().optional(),
      head: z.string().optional(),
      branch: z.string().optional(),
      detached: z.boolean().optional(),
      workingTreeClean: z.boolean().optional(),
      changedFiles: z.array(z.string()).optional(),
      capturedAt: z.string().optional(),
    })
    .nullable()
    .optional(),
  tags: z.array(z.string().trim().min(1).max(60)).max(50).optional(),
});
export type CapsuleInput = z.infer<typeof capsuleInputSchema>;

export const capsulePatchSchema = capsuleInputSchema.partial();
export type CapsulePatch = z.infer<typeof capsulePatchSchema>;

export const capsuleListFilterSchema = z.object({
  projectId: z.string().optional(),
  types: z.array(capsuleTypeSchema).optional(),
  statuses: z.array(capsuleStatusSchema).optional(),
  tagNames: z.array(z.string()).optional(),
  updatedFrom: z.string().optional(),
  updatedTo: z.string().optional(),
  includeDeleted: z.boolean().optional(),
  includeArchived: z.boolean().optional(),
  limit: z.number().int().min(1).max(500).optional(),
  offset: z.number().int().min(0).optional(),
  sort: z.enum(['updated-desc', 'updated-asc', 'title-asc']).optional(),
});
export type CapsuleListFilter = z.infer<typeof capsuleListFilterSchema>;

export const exportDocumentSchema = z.object({
  schemaVersion: z.literal(1),
  exportedAt: z.string(),
  app: z.literal('ContextBridge'),
  project: z.object({ name: z.string().min(1) }),
  capsule: z.object({
    id: z.string().min(1),
    title: z.string().min(1),
    type: capsuleTypeSchema,
    status: capsuleStatusSchema,
    summary: z.string(),
    goal: z.string(),
    current_task: z.string(),
    completed_work: z.string(),
    changed_files: z.array(z.string()),
    commands_run: z.array(z.string()),
    verification_results: z.string(),
    known_issues: z.string(),
    next_task: z.string(),
    rules_constraints: z.string(),
    architecture_notes: z.string(),
    notes: z.string(),
    git_head: z.string(),
    git_branch: z.string(),
    git_snapshot: z.unknown().nullable(),
    token_estimate: z.number().int().nonnegative(),
    created_at: z.string(),
    updated_at: z.string(),
  }),
  tags: z.array(z.string()),
});
export type ExportDocument = z.infer<typeof exportDocumentSchema>;

export function formatZodIssues(
  error: z.ZodError,
): Array<{ field: string; message: string }> {
  return error.issues.map((issue) => ({
    field: issue.path.length > 0 ? issue.path.join('.') : '(root)',
    message: issue.message,
  }));
}
