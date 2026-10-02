/// <reference types="vite/client" />

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

  type ResultLike<T> =
    | { ok: true; value: T }
    | { ok: false; error: { code: string; message: string } };

  interface ContextBridgeApi {
    ping(payload?: { nonce?: string }): Promise<ResultLike<PingValueLike>>;
  }

  interface Window {
    contextBridgeApi: ContextBridgeApi;
  }
}
