import type { Database } from 'better-sqlite3';
import { z } from 'zod';
import {
  DEFAULT_TOKEN_BUDGET,
  capsuleInputSchema,
  capsuleStatusSchema,
  capsuleTypeSchema,
  captureGitSnapshot,
  createCapsule,
  createProject,
  createTag,
  detectDrift,
  duplicateCapsule,
  estimateTokens,
  formatZodIssues,
  generateHandoff,
  getActiveHandoff,
  getCapsule,
  getProject,
  getSetting,
  getTagsForCapsule,
  importNormalized,
  listCapsules,
  listProjects,
  listRevisions,
  listSettings,
  listTags,
  loadMasterContext,
  normalizeJsonImport,
  parseJsonImport,
  parseMarkdownImport,
  restoreCapsule,
  scanSecrets,
  searchCapsules,
  setActiveHandoff,
  setCapsuleArchived,
  setSetting,
  setProjectArchived,
  softDeleteCapsule,
  toJsonExportString,
  toMarkdownExport,
  updateCapsule,
  updateProject,
  type AppResult,
  type CapsuleInput,
  type GitSnapshotInfo,
} from '@contextbridge/core';

export const IPC_CHANNELS = {
  ping: 'contextbridge:ping',
  projectsList: 'contextbridge:projects.list',
  projectsCreate: 'contextbridge:projects.create',
  projectsUpdate: 'contextbridge:projects.update',
  projectsSetArchived: 'contextbridge:projects.setArchived',
  capsulesList: 'contextbridge:capsules.list',
  capsulesGet: 'contextbridge:capsules.get',
  capsulesCreate: 'contextbridge:capsules.create',
  capsulesUpdate: 'contextbridge:capsules.update',
  capsulesSoftDelete: 'contextbridge:capsules.softDelete',
  capsulesRestore: 'contextbridge:capsules.restore',
  capsulesSetArchived: 'contextbridge:capsules.setArchived',
  capsulesDuplicate: 'contextbridge:capsules.duplicate',
  capsulesSetActiveHandoff: 'contextbridge:capsules.setActiveHandoff',
  capsulesGetActiveHandoff: 'contextbridge:capsules.getActiveHandoff',
  tagsList: 'contextbridge:tags.list',
  tagsListForCapsule: 'contextbridge:tags.listForCapsule',
  tagsCreate: 'contextbridge:tags.create',
  revisionsList: 'contextbridge:revisions.list',
  searchQuery: 'contextbridge:search.query',
  handoffDraft: 'contextbridge:handoff.draft',
  handoffRender: 'contextbridge:handoff.render',
  gitCapture: 'contextbridge:git.capture',
  gitDrift: 'contextbridge:git.drift',
  secretsScan: 'contextbridge:secrets.scan',
  settingsList: 'contextbridge:settings.list',
  settingsGet: 'contextbridge:settings.get',
  settingsSet: 'contextbridge:settings.set',
  exportJson: 'contextbridge:export.json',
  exportMarkdown: 'contextbridge:export.markdown',
  importJson: 'contextbridge:import.json',
  importMarkdown: 'contextbridge:import.markdown',
  clipboardWrite: 'contextbridge:clipboard.write',
} as const;

export const pingRequestSchema = z.object({
  nonce: z.string().max(64).optional(),
});

export type PingRequest = z.infer<typeof pingRequestSchema>;

export interface PingProbe {
  sqliteVersion: string;
  fts5Available: boolean;
  fts5QueryWorked: boolean;
}

export interface PingSecurity {
  contextIsolation: boolean;
  nodeIntegration: boolean;
  sandbox: boolean;
}

export interface PingDeps {
  appVersion: string;
  platform: string;
  security: PingSecurity;
  probe: () => PingProbe;
}

export interface PingValue {
  appVersion: string;
  platform: string;
  probe: PingProbe;
  security: PingSecurity;
}

export type AppErrorCode =
  | 'INVALID_PAYLOAD'
  | 'INVALID_CHANNEL'
  | 'FORBIDDEN_SENDER'
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'CONFLICT'
  | 'INVALID_STATE'
  | 'GIT_UNAVAILABLE'
  | 'INTERNAL';

export interface AppErrorLike {
  code: AppErrorCode;
  message: string;
  details?: Array<{ field: string; message: string }>;
}

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: AppErrorLike };

/**
 * Validates the ping payload with Zod and returns a typed Result.
 * Internal error details are never leaked to the renderer.
 */
export function handlePing(payload: unknown, deps: PingDeps): Result<PingValue> {
  const parsed = pingRequestSchema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: { code: 'INVALID_PAYLOAD', message: 'Invalid ping payload.' },
    };
  }
  try {
    const probe = deps.probe();
    return {
      ok: true,
      value: {
        appVersion: deps.appVersion,
        platform: deps.platform,
        probe,
        security: deps.security,
      },
    };
  } catch {
    return {
      ok: false,
      error: { code: 'INTERNAL', message: 'Local database probe failed.' },
    };
  }
}

export interface IpcDeps {
  db: Database;
  ping(payload: unknown): Result<PingValue>;
  copyText(text: string): void;
}

function toResult<T>(result: AppResult<T>): Result<T> {
  if (result.ok) {
    return { ok: true, value: result.value };
  }
  return {
    ok: false,
    error: {
      code: result.error.code,
      message: result.error.message,
      ...(result.error.details ? { details: result.error.details } : {}),
    },
  };
}

const idField = z.string().min(1).max(128);
const textPayload = z.string().max(10_000_000);

const searchFilterSchema = z.object({
  projectId: z.string().max(128).optional(),
  types: z.array(capsuleTypeSchema).optional(),
  statuses: z.array(capsuleStatusSchema).optional(),
  tagNames: z.array(z.string().max(60)).optional(),
  includeArchived: z.boolean().optional(),
  includeDeleted: z.boolean().optional(),
  limit: z.number().int().min(1).max(100).optional(),
  offset: z.number().int().min(0).optional(),
});

const revisionReasonSchema = z.enum(['manual-save', 'copy-handoff']).nullish();

interface HandoffPreview {
  markdown: string;
  tokenEstimate: number;
}

function previewOptions(
  deps: IpcDeps,
  compact: boolean | undefined,
  tokenBudget: number | undefined,
): { compact: boolean; tokenBudget: number } {
  const settingBudget = getSetting<number>(deps.db, 'handoff.tokenBudget', DEFAULT_TOKEN_BUDGET);
  return {
    compact: compact ?? getSetting<boolean>(deps.db, 'handoff.compact', false),
    tokenBudget: tokenBudget ?? settingBudget,
  };
}

type HandoffCapsuleFields = Parameters<typeof generateHandoff>[0];

function toHandoffCapsule(input: CapsuleInput): HandoffCapsuleFields {
  return {
    type: input.type ?? 'Session Handoff',
    goal: input.goal ?? '',
    currentTask: input.currentTask ?? '',
    completedWork: input.completedWork ?? '',
    changedFiles: input.changedFiles ?? [],
    commandsRun: input.commandsRun ?? [],
    verificationResults: input.verificationResults ?? '',
    knownIssues: input.knownIssues ?? '',
    architectureNotes: input.architectureNotes ?? '',
    rulesConstraints: input.rulesConstraints ?? '',
    nextTask: input.nextTask ?? '',
    gitHead: input.gitHead ?? '',
    gitBranch: input.gitBranch ?? '',
    gitSnapshot: input.gitSnapshot ?? null,
  };
}

type Handler<I, O> = (deps: IpcDeps, input: I) => Result<O> | Promise<Result<O>>;

interface ChannelSpec {
  schema: z.ZodType<unknown>;
  handler: Handler<unknown, unknown>;
}

function defineChannel<I, O>(schema: z.ZodType<I>, handler: Handler<I, O>): ChannelSpec {
  return {
    schema: schema as z.ZodType<unknown>,
    handler: handler as Handler<unknown, unknown>,
  };
}

const CHANNELS: Record<string, ChannelSpec> = {
  [IPC_CHANNELS.ping]: defineChannel(pingRequestSchema, (deps, payload) =>
    deps.ping(payload),
  ),

  [IPC_CHANNELS.projectsList]: defineChannel(
    z.object({ includeArchived: z.boolean().optional() }).default({}),
    (deps, input) => okValue(listProjects(deps.db, input)),
  ),
  [IPC_CHANNELS.projectsCreate]: defineChannel(z.unknown(), (deps, input) =>
    toResult(createProject(deps.db, input)),
  ),
  [IPC_CHANNELS.projectsUpdate]: defineChannel(
    z.object({ id: idField, patch: z.unknown() }),
    (deps, input) => toResult(updateProject(deps.db, input.id, input.patch)),
  ),
  [IPC_CHANNELS.projectsSetArchived]: defineChannel(
    z.object({ id: idField, archived: z.boolean() }),
    (deps, input) => toResult(setProjectArchived(deps.db, input.id, input.archived)),
  ),

  [IPC_CHANNELS.capsulesList]: defineChannel(z.unknown(), (deps, input) =>
    toResult(listCapsules(deps.db, input)),
  ),
  [IPC_CHANNELS.capsulesGet]: defineChannel(z.object({ id: idField }), (deps, input) =>
    toResult(getCapsule(deps.db, input.id)),
  ),
  [IPC_CHANNELS.capsulesCreate]: defineChannel(
    z.object({
      projectId: idField,
      input: z.unknown(),
      parentCapsuleId: idField.optional(),
    }),
    (deps, input) =>
      toResult(
        createCapsule(deps.db, input.projectId, input.input, {
          parentCapsuleId: input.parentCapsuleId ?? null,
        }),
      ),
  ),
  [IPC_CHANNELS.capsulesUpdate]: defineChannel(
    z.object({ id: idField, patch: z.unknown(), reason: revisionReasonSchema }),
    (deps, input) =>
      toResult(updateCapsule(deps.db, input.id, input.patch, { reason: input.reason })),
  ),
  [IPC_CHANNELS.capsulesSoftDelete]: defineChannel(
    z.object({ id: idField }),
    (deps, input) => toResult(softDeleteCapsule(deps.db, input.id)),
  ),
  [IPC_CHANNELS.capsulesRestore]: defineChannel(z.object({ id: idField }), (deps, input) =>
    toResult(restoreCapsule(deps.db, input.id)),
  ),
  [IPC_CHANNELS.capsulesSetArchived]: defineChannel(
    z.object({ id: idField, archived: z.boolean() }),
    (deps, input) => toResult(setCapsuleArchived(deps.db, input.id, input.archived)),
  ),
  [IPC_CHANNELS.capsulesDuplicate]: defineChannel(z.object({ id: idField }), (deps, input) =>
    toResult(duplicateCapsule(deps.db, input.id)),
  ),
  [IPC_CHANNELS.capsulesSetActiveHandoff]: defineChannel(
    z.object({ capsuleId: idField }),
    (deps, input) => toResult(setActiveHandoff(deps.db, input.capsuleId)),
  ),
  [IPC_CHANNELS.capsulesGetActiveHandoff]: defineChannel(
    z.object({ projectId: idField }),
    (deps, input) => toResult(getActiveHandoff(deps.db, input.projectId)),
  ),

  [IPC_CHANNELS.tagsList]: defineChannel(z.unknown(), (deps) => okValue(listTags(deps.db))),
  [IPC_CHANNELS.tagsListForCapsule]: defineChannel(
    z.object({ capsuleId: idField }),
    (deps, input) => okValue(getTagsForCapsule(deps.db, input.capsuleId)),
  ),
  [IPC_CHANNELS.tagsCreate]: defineChannel(
    z.object({ name: z.string().trim().min(1).max(60) }),
    (deps, input) => toResult(createTag(deps.db, input.name)),
  ),

  [IPC_CHANNELS.revisionsList]: defineChannel(
    z.object({ capsuleId: idField }),
    (deps, input) => okValue(listRevisions(deps.db, input.capsuleId)),
  ),

  [IPC_CHANNELS.searchQuery]: defineChannel(
    z.object({ query: z.string().max(1000), filter: searchFilterSchema.optional() }),
    (deps, input) => toResult(searchCapsules(deps.db, input.query, input.filter)),
  ),

  [IPC_CHANNELS.handoffDraft]: defineChannel(
    z.object({
      projectId: idField,
      input: z.unknown(),
      compact: z.boolean().optional(),
      tokenBudget: z.number().int().min(200).max(100_000).optional(),
    }),
    (deps, input): Result<HandoffPreview> => {
      const project = getProject(deps.db, input.projectId);
      if (!project.ok) return project;
      const parsed = capsuleInputSchema.safeParse(input.input);
      if (!parsed.success) {
        return {
          ok: false,
          error: {
            code: 'VALIDATION',
            message: 'Invalid capsule input.',
            details: formatZodIssues(parsed.error),
          },
        };
      }
      const master = loadMasterContext(deps.db, input.projectId);
      const options = previewOptions(deps, input.compact, input.tokenBudget);
      const markdown = generateHandoff(
        toHandoffCapsule(parsed.data),
        project.value,
        master,
        options,
      );
      return okValue({ markdown, tokenEstimate: estimateTokens(markdown) });
    },
  ),
  [IPC_CHANNELS.handoffRender]: defineChannel(
    z.object({
      capsuleId: idField,
      compact: z.boolean().optional(),
      tokenBudget: z.number().int().min(200).max(100_000).optional(),
    }),
    (deps, input): Result<HandoffPreview> => {
      const capsule = getCapsule(deps.db, input.capsuleId);
      if (!capsule.ok) return capsule;
      const project = getProject(deps.db, capsule.value.projectId);
      if (!project.ok) return project;
      const master = loadMasterContext(deps.db, capsule.value.projectId);
      const options = previewOptions(deps, input.compact, input.tokenBudget);
      const markdown = generateHandoff(capsule.value, project.value, master, options);
      return okValue({ markdown, tokenEstimate: estimateTokens(markdown) });
    },
  ),

  [IPC_CHANNELS.gitCapture]: defineChannel(
    z.object({ repositoryPath: z.string().min(1).max(4096) }),
    async (deps, input) => toResult(await captureGitSnapshot(input.repositoryPath)),
  ),
  [IPC_CHANNELS.gitDrift]: defineChannel(z.object({ capsuleId: idField }), async (deps, input) => {
    const capsule = getCapsule(deps.db, input.capsuleId);
    if (!capsule.ok) return capsule;
    const project = getProject(deps.db, capsule.value.projectId);
    if (!project.ok) return project;
    const repositoryPath = project.value.repositoryPath.trim();
    let current: GitSnapshotInfo | null = null;
    if (repositoryPath.length > 0) {
      const captured = await captureGitSnapshot(repositoryPath);
      current = captured.ok ? captured.value : null;
    }
    return okValue(detectDrift(capsule.value.gitSnapshot, current));
  }),

  [IPC_CHANNELS.secretsScan]: defineChannel(
    z.object({ text: z.string().max(5_000_000) }),
    (deps, input) => okValue(scanSecrets(input.text)),
  ),

  [IPC_CHANNELS.settingsList]: defineChannel(z.unknown(), (deps) =>
    okValue(listSettings(deps.db)),
  ),
  [IPC_CHANNELS.settingsGet]: defineChannel(
    z.object({ key: z.string().min(1).max(100), fallback: z.unknown().optional() }),
    (deps, input) => okValue(getSetting(deps.db, input.key, input.fallback ?? null)),
  ),
  [IPC_CHANNELS.settingsSet]: defineChannel(
    z.object({ key: z.string().min(1).max(100), value: z.unknown() }),
    (deps, input) => toResult(setSetting(deps.db, input.key, input.value)),
  ),

  [IPC_CHANNELS.exportJson]: defineChannel(z.object({ capsuleId: idField }), (deps, input) => {
    const capsule = getCapsule(deps.db, input.capsuleId);
    if (!capsule.ok) return capsule;
    const project = getProject(deps.db, capsule.value.projectId);
    if (!project.ok) return project;
    return okValue(toJsonExportString(capsule.value, project.value, getTagsForCapsule(deps.db, capsule.value.id)));
  }),
  [IPC_CHANNELS.exportMarkdown]: defineChannel(
    z.object({ capsuleId: idField }),
    (deps, input) => {
      const capsule = getCapsule(deps.db, input.capsuleId);
      if (!capsule.ok) return capsule;
      const project = getProject(deps.db, capsule.value.projectId);
      if (!project.ok) return project;
      return okValue(
        toMarkdownExport(capsule.value, project.value, getTagsForCapsule(deps.db, capsule.value.id)),
      );
    },
  ),

  [IPC_CHANNELS.importJson]: defineChannel(
    z.object({ text: textPayload, projectId: idField }),
    (deps, input) => {
      const parsed = parseJsonImport(input.text);
      if (!parsed.ok) return parsed;
      return toResult(importNormalized(deps.db, input.projectId, normalizeJsonImport(parsed.value)));
    },
  ),
  [IPC_CHANNELS.importMarkdown]: defineChannel(
    z.object({ text: textPayload, projectId: idField }),
    (deps, input) => {
      const parsed = parseMarkdownImport(input.text);
      if (!parsed.ok) return parsed;
      const imported = importNormalized(deps.db, input.projectId, parsed.value.normalized);
      if (!imported.ok) return imported;
      return okValue({
        capsule: imported.value,
        kind: parsed.value.kind,
        message: parsed.value.normalized.message ?? null,
      });
    },
  ),

  [IPC_CHANNELS.clipboardWrite]: defineChannel(
    z.object({ text: z.string().max(5_000_000) }),
    (deps, input) => {
      deps.copyText(input.text);
      return okValue(null);
    },
  ),
};

function okValue<T>(value: T): Result<T> {
  return { ok: true, value };
}

/**
 * Routes one renderer invocation: channel lookup, Zod payload validation,
 * handler execution, and error containment. Handlers never throw to callers;
 * unexpected failures become a generic INTERNAL result.
 */
export async function routeIpc(
  deps: IpcDeps,
  channel: string,
  payload: unknown,
): Promise<Result<unknown>> {
  const spec = CHANNELS[channel];
  if (!spec) {
    return {
      ok: false,
      error: { code: 'INVALID_CHANNEL', message: `Unknown IPC channel: ${channel}` },
    };
  }
  const parsed = spec.schema.safeParse(payload);
  if (!parsed.success) {
    return {
      ok: false,
      error: {
        code: 'INVALID_PAYLOAD',
        message: 'Invalid IPC payload.',
        details: formatZodIssues(parsed.error),
      },
    };
  }
  try {
    return await spec.handler(deps, parsed.data);
  } catch {
    return {
      ok: false,
      error: { code: 'INTERNAL', message: 'Internal IPC failure.' },
    };
  }
}

export const IPC_CHANNEL_NAMES: readonly string[] = Object.values(IPC_CHANNELS);
