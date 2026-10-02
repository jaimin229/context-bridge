import { contextBridge, ipcRenderer } from 'electron';

/**
 * Sandboxed preload. Only fixed, typed methods are exposed.
 * There is deliberately no generic `invoke(channel, payload)` passthrough.
 * Payload validation happens in the main process (see electron/ipc.ts);
 * tests/ipc-contract.test.ts asserts these strings match IPC_CHANNELS.
 */
const api = {
  ping: (payload?: { nonce?: string }): Promise<unknown> =>
    ipcRenderer.invoke('contextbridge:ping', payload ?? {}),

  projects: {
    list: (payload?: { includeArchived?: boolean }): Promise<unknown> =>
      ipcRenderer.invoke('contextbridge:projects.list', payload ?? {}),
    create: (payload: unknown): Promise<unknown> =>
      ipcRenderer.invoke('contextbridge:projects.create', payload),
    update: (payload: { id: string; patch: unknown }): Promise<unknown> =>
      ipcRenderer.invoke('contextbridge:projects.update', payload),
    setArchived: (payload: { id: string; archived: boolean }): Promise<unknown> =>
      ipcRenderer.invoke('contextbridge:projects.setArchived', payload),
  },

  capsules: {
    list: (payload?: unknown): Promise<unknown> =>
      ipcRenderer.invoke('contextbridge:capsules.list', payload ?? {}),
    get: (payload: { id: string }): Promise<unknown> =>
      ipcRenderer.invoke('contextbridge:capsules.get', payload),
    create: (payload: {
      projectId: string;
      input: unknown;
      parentCapsuleId?: string;
    }): Promise<unknown> => ipcRenderer.invoke('contextbridge:capsules.create', payload),
    update: (payload: {
      id: string;
      patch: unknown;
      reason?: 'manual-save' | 'copy-handoff' | null;
    }): Promise<unknown> => ipcRenderer.invoke('contextbridge:capsules.update', payload),
    softDelete: (payload: { id: string }): Promise<unknown> =>
      ipcRenderer.invoke('contextbridge:capsules.softDelete', payload),
    restore: (payload: { id: string }): Promise<unknown> =>
      ipcRenderer.invoke('contextbridge:capsules.restore', payload),
    setArchived: (payload: { id: string; archived: boolean }): Promise<unknown> =>
      ipcRenderer.invoke('contextbridge:capsules.setArchived', payload),
    duplicate: (payload: { id: string }): Promise<unknown> =>
      ipcRenderer.invoke('contextbridge:capsules.duplicate', payload),
    setActiveHandoff: (payload: { capsuleId: string }): Promise<unknown> =>
      ipcRenderer.invoke('contextbridge:capsules.setActiveHandoff', payload),
    getActiveHandoff: (payload: { projectId: string }): Promise<unknown> =>
      ipcRenderer.invoke('contextbridge:capsules.getActiveHandoff', payload),
  },

  tags: {
    list: (): Promise<unknown> => ipcRenderer.invoke('contextbridge:tags.list', {}),
    listForCapsule: (payload: { capsuleId: string }): Promise<unknown> =>
      ipcRenderer.invoke('contextbridge:tags.listForCapsule', payload),
    create: (payload: { name: string }): Promise<unknown> =>
      ipcRenderer.invoke('contextbridge:tags.create', payload),
  },

  revisions: {
    list: (payload: { capsuleId: string }): Promise<unknown> =>
      ipcRenderer.invoke('contextbridge:revisions.list', payload),
  },

  search: {
    query: (payload: { query: string; filter?: unknown }): Promise<unknown> =>
      ipcRenderer.invoke('contextbridge:search.query', payload),
  },

  handoff: {
    draft: (payload: {
      projectId: string;
      input: unknown;
      compact?: boolean;
      tokenBudget?: number;
    }): Promise<unknown> => ipcRenderer.invoke('contextbridge:handoff.draft', payload),
    render: (payload: {
      capsuleId: string;
      compact?: boolean;
      tokenBudget?: number;
    }): Promise<unknown> => ipcRenderer.invoke('contextbridge:handoff.render', payload),
  },

  git: {
    capture: (payload: { repositoryPath: string }): Promise<unknown> =>
      ipcRenderer.invoke('contextbridge:git.capture', payload),
    drift: (payload: { capsuleId: string }): Promise<unknown> =>
      ipcRenderer.invoke('contextbridge:git.drift', payload),
  },

  secrets: {
    scan: (payload: { text: string }): Promise<unknown> =>
      ipcRenderer.invoke('contextbridge:secrets.scan', payload),
  },

  settings: {
    list: (): Promise<unknown> => ipcRenderer.invoke('contextbridge:settings.list', {}),
    get: (payload: { key: string; fallback?: unknown }): Promise<unknown> =>
      ipcRenderer.invoke('contextbridge:settings.get', payload),
    set: (payload: { key: string; value: unknown }): Promise<unknown> =>
      ipcRenderer.invoke('contextbridge:settings.set', payload),
  },

  export: {
    json: (payload: { capsuleId: string }): Promise<unknown> =>
      ipcRenderer.invoke('contextbridge:export.json', payload),
    markdown: (payload: { capsuleId: string }): Promise<unknown> =>
      ipcRenderer.invoke('contextbridge:export.markdown', payload),
  },

  import: {
    json: (payload: { text: string; projectId: string }): Promise<unknown> =>
      ipcRenderer.invoke('contextbridge:import.json', payload),
    markdown: (payload: { text: string; projectId: string }): Promise<unknown> =>
      ipcRenderer.invoke('contextbridge:import.markdown', payload),
  },

  clipboard: {
    write: (payload: { text: string }): Promise<unknown> =>
      ipcRenderer.invoke('contextbridge:clipboard.write', payload),
  },
};

contextBridge.exposeInMainWorld('contextBridgeApi', api);
