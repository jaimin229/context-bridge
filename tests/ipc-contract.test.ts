import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CAPSULE_STATUSES,
  CAPSULE_TYPES,
  SNIPPET_CLOSE,
  SNIPPET_OPEN,
} from '../packages/core/src/index';
import { IPC_CHANNELS } from '../apps/desktop/electron/ipc';

const ROOT = process.cwd();

function read(relative: string): string {
  return readFileSync(path.join(ROOT, relative), 'utf8');
}

function extractArray(source: string, constName: string): string[] {
  const match = new RegExp(`const ${constName} = \\[([\\s\\S]*?)\\][^;]*;`).exec(source);
  if (!match) {
    throw new Error(`const ${constName} not found`);
  }
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
}

function extractEscapedString(source: string, constName: string): string {
  const match = new RegExp(`const ${constName} = '([^']*)'`).exec(source);
  if (!match) {
    throw new Error(`const ${constName} not found`);
  }
  return JSON.parse(`"${match[1]}"`) as string;
}

describe('renderer/core contract parity', () => {
  it('MarkdownView snippet markers match the core search constants', () => {
    const source = read('apps/desktop/src/components/MarkdownView.tsx');
    expect(extractEscapedString(source, 'SNIPPET_OPEN')).toBe(SNIPPET_OPEN);
    expect(extractEscapedString(source, 'SNIPPET_CLOSE')).toBe(SNIPPET_CLOSE);
  });

  it('CapsuleEditor option lists match core CAPSULE_TYPES and CAPSULE_STATUSES', () => {
    const source = read('apps/desktop/src/components/CapsuleEditor.tsx');
    expect(extractArray(source, 'CAPSULE_TYPES')).toEqual([...CAPSULE_TYPES]);
    expect(extractArray(source, 'CAPSULE_STATUSES')).toEqual([...CAPSULE_STATUSES]);
  });

  it('SearchPanel filter options match core capsule types and statuses', () => {
    const source = read('apps/desktop/src/components/SearchPanel.tsx');
    expect(extractArray(source, 'TYPE_OPTIONS')).toEqual([...CAPSULE_TYPES]);
    expect(extractArray(source, 'STATUS_OPTIONS')).toEqual([...CAPSULE_STATUSES]);
  });

  it('env.d.ts exposes every IPC channel as a typed API surface', async () => {
    const envTypes = read('apps/desktop/src/env.d.ts');
    const preload = read('apps/desktop/electron/preload.ts');
    const renderer = [
      'apps/desktop/src/App.tsx',
      'apps/desktop/src/components/CapsuleEditor.tsx',
      'apps/desktop/src/components/SearchPanel.tsx',
      'apps/desktop/src/components/SettingsDialog.tsx',
      'apps/desktop/src/components/ImportDialog.tsx',
      'apps/desktop/src/components/StartupChecks.tsx',
      'apps/desktop/src/components/HandoffPreview.tsx',
      'apps/desktop/src/components/TextDialog.tsx',
      'apps/desktop/src/components/Onboarding.tsx',
    ]
      .map(read)
      .join('\n');

    expect(envTypes).toContain('interface ContextBridgeApi');
    for (const channel of Object.values(IPC_CHANNELS)) {
      expect(preload).toContain(channel);
    }
    // Every IPC method group used by the renderer must exist on the declared API.
    for (const group of [
      'projects:',
      'capsules:',
      'tags:',
      'revisions:',
      'search:',
      'handoff:',
      'git:',
      'secrets:',
      'settings:',
      'export:',
      'import:',
      'clipboard:',
    ]) {
      expect(envTypes).toContain(group);
      expect(renderer).toContain(group.slice(0, -1) + '.');
    }
  });
});
