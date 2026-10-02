import { z } from 'zod';

export const IPC_CHANNELS = {
  ping: 'contextbridge:ping',
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

export type AppErrorCode = 'INVALID_PAYLOAD' | 'FORBIDDEN_SENDER' | 'INTERNAL';

export type Result<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: AppErrorCode; message: string } };

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
