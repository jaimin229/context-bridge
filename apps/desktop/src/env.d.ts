/// <reference types="vite/client" />

import type {
  Capsule,
  CapsuleInput,
  CapsulePatch,
  CapsuleRevision,
  DriftReport,
  Project,
  ProjectInput,
  ProjectPatch,
  SearchOutcome,
  SecretFinding,
  Tag,
} from '@contextbridge/core';

export {};

declare global {
  interface PingProbeLike {
    sqliteVersion: string;
    fts5Available: boolean;
    fts5QueryWorked: boolean;
  }

  interface PingValueLike {
    appVersion: string;
    platform: string;
    probe: PingProbeLike;
    security: {
      contextIsolation: boolean;
      nodeIntegration: boolean;
      sandbox: boolean;
    };
  }

  interface AppErrorLike {
    code: string;
    message: string;
    details?: Array<{ field: string; message: string }>;
  }

  type ResultLike<T> =
    | { ok: true; value: T }
    | { ok: false; error: AppErrorLike };

  interface HandoffPreviewLike {
    markdown: string;
    tokenEstimate: number;
  }

  interface CapsuleListFilterLike {
    projectId?: string;
    types?: Capsule['type'][];
    statuses?: Capsule['status'][];
    tagNames?: string[];
    updatedFrom?: string;
    updatedTo?: string;
    includeArchived?: boolean;
    includeDeleted?: boolean;
    limit?: number;
    offset?: number;
    sort?: 'updated-desc' | 'updated-asc' | 'title-asc';
  }

  interface SearchQueryPayload {
    query: string;
    filter?: CapsuleListFilterLike;
  }

  interface ImportOutcomeLike {
    capsule: Capsule;
    kind: 'structured' | 'plain';
    message: string | null;
  }

  interface ContextBridgeApi {
    ping(payload?: { nonce?: string }): Promise<ResultLike<PingValueLike>>;

    projects: {
      list(payload?: { includeArchived?: boolean }): Promise<ResultLike<Project[]>>;
      create(input: ProjectInput): Promise<ResultLike<Project>>;
      update(payload: { id: string; patch: ProjectPatch }): Promise<ResultLike<Project>>;
      setArchived(payload: {
        id: string;
        archived: boolean;
      }): Promise<ResultLike<Project>>;
    };

    capsules: {
      list(filter?: CapsuleListFilterLike): Promise<ResultLike<Capsule[]>>;
      get(payload: { id: string }): Promise<ResultLike<Capsule>>;
      create(payload: {
        projectId: string;
        input: CapsuleInput;
        parentCapsuleId?: string;
      }): Promise<ResultLike<Capsule>>;
      update(payload: {
        id: string;
        patch: CapsulePatch;
        reason?: 'manual-save' | 'copy-handoff' | null;
      }): Promise<ResultLike<Capsule>>;
      softDelete(payload: { id: string }): Promise<ResultLike<Capsule>>;
      restore(payload: { id: string }): Promise<ResultLike<Capsule>>;
      setArchived(payload: {
        id: string;
        archived: boolean;
      }): Promise<ResultLike<Capsule>>;
      duplicate(payload: { id: string }): Promise<ResultLike<Capsule>>;
      setActiveHandoff(payload: { capsuleId: string }): Promise<ResultLike<Project>>;
      getActiveHandoff(payload: {
        projectId: string;
      }): Promise<ResultLike<Capsule | null>>;
    };

    tags: {
      list(): Promise<ResultLike<Tag[]>>;
      listForCapsule(payload: { capsuleId: string }): Promise<ResultLike<Tag[]>>;
      create(payload: { name: string }): Promise<ResultLike<Tag>>;
    };

    revisions: {
      list(payload: { capsuleId: string }): Promise<ResultLike<CapsuleRevision[]>>;
    };

    search: {
      query(payload: SearchQueryPayload): Promise<ResultLike<SearchOutcome>>;
    };

    handoff: {
      draft(payload: {
        projectId: string;
        input: CapsuleInput;
        compact?: boolean;
        tokenBudget?: number;
      }): Promise<ResultLike<HandoffPreviewLike>>;
      render(payload: {
        capsuleId: string;
        compact?: boolean;
        tokenBudget?: number;
      }): Promise<ResultLike<HandoffPreviewLike>>;
    };

    git: {
      capture(payload: {
        repositoryPath: string;
      }): Promise<ResultLike<import('@contextbridge/core').GitSnapshotInfo>>;
      drift(payload: { capsuleId: string }): Promise<ResultLike<DriftReport>>;
    };

    secrets: {
      scan(payload: { text: string }): Promise<ResultLike<SecretFinding[]>>;
    };

    settings: {
      list(): Promise<ResultLike<Record<string, unknown>>>;
      get(payload: {
        key: string;
        fallback?: unknown;
      }): Promise<ResultLike<unknown>>;
      set(payload: { key: string; value: unknown }): Promise<ResultLike<null>>;
    };

    export: {
      json(payload: { capsuleId: string }): Promise<ResultLike<string>>;
      markdown(payload: { capsuleId: string }): Promise<ResultLike<string>>;
    };

    import: {
      json(payload: {
        text: string;
        projectId: string;
      }): Promise<ResultLike<Capsule>>;
      markdown(payload: {
        text: string;
        projectId: string;
      }): Promise<ResultLike<ImportOutcomeLike>>;
    };

    clipboard: {
      write(payload: { text: string }): Promise<ResultLike<null>>;
    };
  }

  interface Window {
    contextBridgeApi: ContextBridgeApi;
  }
}
