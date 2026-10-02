import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  IPC_CHANNELS,
  handlePing,
  pingRequestSchema,
  type PingDeps,
} from '../apps/desktop/electron/ipc';

const deps: PingDeps = {
  appVersion: '0.1.0',
  platform: 'win32',
  security: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  probe: () => ({
    sqliteVersion: '3.50.0',
    fts5Available: true,
    fts5QueryWorked: true,
  }),
};

describe('ping IPC payload validation (Zod in main process)', () => {
  it('accepts an empty payload', () => {
    const result = handlePing({}, deps);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.appVersion).toBe('0.1.0');
      expect(result.value.probe.fts5QueryWorked).toBe(true);
      expect(result.value.security.sandbox).toBe(true);
    }
  });

  it('accepts a valid payload with a nonce', () => {
    const result = handlePing({ nonce: 'abc-123' }, deps);
    expect(result.ok).toBe(true);
  });

  it('rejects a payload with a nonce longer than 64 characters', () => {
    const result = handlePing({ nonce: 'x'.repeat(65) }, deps);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INVALID_PAYLOAD');
    }
  });

  it('rejects wrong-typed payloads', () => {
    for (const bad of ['string', 42, null, undefined, [1, 2, 3], { nonce: 7 }]) {
      const result = handlePing(bad, deps);
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.code).toBe('INVALID_PAYLOAD');
      }
    }
  });

  it('returns INTERNAL without leaking details when the probe throws', () => {
    const failing: PingDeps = {
      ...deps,
      probe: () => {
        throw new Error('sensitive internal path C:\\Users\\secret\\db.sqlite');
      },
    };
    const result = handlePing({}, failing);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('INTERNAL');
      expect(result.error.message).not.toContain('sensitive');
      expect(result.error.message).not.toContain('C:\\');
    }
  });

  it('pingRequestSchema is the validation entry point', () => {
    expect(pingRequestSchema.safeParse({ nonce: 'ok' }).success).toBe(true);
    expect(pingRequestSchema.safeParse({ nonce: 1 }).success).toBe(false);
  });
});

describe('preload allowlist', () => {
  const preloadSource = readFileSync(
    path.join(process.cwd(), 'apps', 'desktop', 'electron', 'preload.ts'),
    'utf8',
  );

  it('uses the allowlisted ping channel literal', () => {
    expect(preloadSource).toContain(IPC_CHANNELS.ping);
  });

  it('has exactly one ipcRenderer.invoke call (no generic passthrough)', () => {
    const code = preloadSource
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/^\s*\/\/.*$/gm, '');
    const matches = code.match(/ipcRenderer\.invoke/g) ?? [];
    expect(matches).toHaveLength(1);
    expect(code).not.toMatch(/invoke\s*\(\s*channel/);
    expect(code).not.toMatch(/invoke:\s*/);
  });
});
