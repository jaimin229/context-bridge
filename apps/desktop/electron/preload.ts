import { contextBridge, ipcRenderer } from 'electron';

/**
 * Sandboxed preload. Only fixed, typed methods are exposed.
 * There is deliberately no generic `invoke(channel, payload)` passthrough.
 * Payload validation happens in the main process (see electron/ipc.ts).
 */
const api = {
  ping: (payload?: { nonce?: string }): Promise<unknown> =>
    ipcRenderer.invoke('contextbridge:ping', payload ?? {}),
};

contextBridge.exposeInMainWorld('contextBridgeApi', api);
