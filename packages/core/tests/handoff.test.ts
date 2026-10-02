import { describe, expect, it } from 'vitest';
import {
  DEFAULT_TOKEN_BUDGET,
  estimateTokens,
  generateHandoff,
  type Capsule,
  type MasterContextInfo,
} from '../src/index';

const project = { name: 'Bridge API', repositoryPath: 'C:\\dev\\bridge-api' };

function baseCapsule(overrides: Partial<Capsule> = {}): Capsule {
  return {
    id: 'cap-1',
    projectId: 'proj-1',
    title: 'Session',
    type: 'Session Handoff',
    status: 'Active',
    summary: '',
    goal: '',
    currentTask: '',
    completedWork: '',
    changedFiles: [],
    commandsRun: [],
    verificationResults: '',
    knownIssues: '',
    nextTask: '',
    rulesConstraints: '',
    architectureNotes: '',
    notes: '',
    contentMarkdown: '',
    gitHead: '',
    gitBranch: '',
    gitSnapshot: null,
    tokenEstimate: 0,
    source: 'manual',
    importedOriginalId: null,
    version: 1,
    parentCapsuleId: null,
    createdAt: '2026-10-02T00:00:00.000Z',
    updatedAt: '2026-10-02T00:00:00.000Z',
    archivedAt: null,
    deletedAt: null,
    ...overrides,
  };
}

const fullCapsule = baseCapsule({
  goal: 'Ship context handoffs',
  currentTask: 'Implement generator',
  completedWork: 'Schema + migrations',
  changedFiles: ['packages/core/src/generator.ts'],
  commandsRun: ['npm test'],
  verificationResults: '15 tests passed',
  knownIssues: 'None right now',
  nextTask: 'Wire UI preview',
  rulesConstraints: 'Keep Windows paths working',
  architectureNotes: 'Generator is a pure function',
  gitHead: '1234567890abcdef1234567890abcdef12345678',
  gitBranch: 'feature/handoff',
  gitSnapshot: {
    repositoryRoot: 'C:\\dev\\bridge-api',
    head: '1234567890abcdef1234567890abcdef12345678',
    branch: 'feature/handoff',
    workingTreeClean: true,
    changedFiles: ['packages/core/src/generator.ts'],
    capturedAt: '2026-10-02T09:30:00.000Z',
  },
});

const EXPECTED_HEADINGS = [
  'Project',
  'Product Goal',
  'Repository',
  'Current Task',
  'Completed Work',
  'Files Changed',
  'Commands Run',
  'Verification',
  'Known Issues / Blockers',
  'Architecture / Technical Notes',
  'Rules and Constraints',
  'Next Exact Task',
  'Instructions for the Next AI',
];

function headingsOf(markdown: string): string[] {
  return markdown
    .split('\n')
    .filter((line) => line.startsWith('## '))
    .map((line) => line.slice(3).trim());
}

describe('handoff generator', () => {
  it('produces the exact heading structure in the exact order', () => {
    const output = generateHandoff(fullCapsule, project, null);
    expect(output.startsWith('# Project Handoff')).toBe(true);
    expect(headingsOf(output)).toEqual(EXPECTED_HEADINGS);
  });

  it('renders all fields for a fully populated capsule', () => {
    const output = generateHandoff(fullCapsule, project, null);
    expect(output).toContain('## Project\nBridge API');
    expect(output).toContain('## Product Goal\nShip context handoffs');
    expect(output).toContain('- Repository path: C:\\dev\\bridge-api');
    expect(output).toContain('- Branch: feature/handoff');
    expect(output).toContain('- Commit: 1234567');
    expect(output).toContain('- Working tree: clean');
    expect(output).toContain('- Captured: 2026-10-02T09:30:00.000Z');
    expect(output).toContain('## Current Task\nImplement generator');
    expect(output).toContain('## Completed Work\nSchema + migrations');
    expect(output).toContain('- packages/core/src/generator.ts');
    expect(output).toContain('- npm test');
    expect(output).toContain('## Verification\n15 tests passed');
    expect(output).toContain('## Known Issues / Blockers\nNone right now');
    expect(output).toContain('## Architecture / Technical Notes\nGenerator is a pure function');
    expect(output).toContain('## Rules and Constraints\nKeep Windows paths working');
    expect(output).toContain('## Next Exact Task\nWire UI preview');
    expect(output).not.toContain('_Not provided._');
  });

  it('renders _Not provided._ for every empty structured field', () => {
    const output = generateHandoff(baseCapsule(), project, null);
    for (const heading of [
      'Product Goal',
      'Current Task',
      'Completed Work',
      'Files Changed',
      'Commands Run',
      'Verification',
      'Known Issues / Blockers',
      'Architecture / Technical Notes',
      'Rules and Constraints',
      'Next Exact Task',
    ]) {
      const section = output.split(`## ${heading}\n`)[1]?.split('\n\n')[0];
      expect(section).toBe('_Not provided._');
    }
    expect(output).toContain('- Repository path: C:\\dev\\bridge-api');
    expect(output).toContain(`- Branch: _Not provided._`);
    expect(output).toContain(`- Commit: _Not provided._`);
    expect(output).toContain(`- Working tree: _Not provided._`);
  });

  it('shows "Not configured" when no repository path exists', () => {
    const output = generateHandoff(baseCapsule(), { name: 'P', repositoryPath: '' }, null);
    expect(output).toContain('- Repository path: Not configured');
  });

  it('includes the exact seven instructions for the next AI', () => {
    const output = generateHandoff(baseCapsule(), project, null);
    const instructions = output.split('## Instructions for the Next AI\n')[1];
    expect(instructions).toContain('1. First inspect the actual repository and current Git status.');
    expect(instructions).toContain('2. Treat the repository as the source of truth.');
    expect(instructions).toContain(
      '3. Do not assume this handoff is fully current if the code contradicts it.',
    );
    expect(instructions).toContain('4. Make small, focused changes.');
    expect(instructions).toContain('5. Run relevant tests or builds after changes.');
    expect(instructions).toContain(
      '6. Do not claim a feature works unless it was actually verified.',
    );
    expect(instructions).toContain(
      '7. Do not expose, request, or store secrets in project documentation.',
    );
  });

  it('includes a drift note when drift is reported', () => {
    const output = generateHandoff(fullCapsule, project, null, {
      drift: { hasDrift: true, currentHead: 'abcdef1' },
    });
    expect(output).toContain('- Drift warning:');
    expect(output).toContain(
      'This handoff was captured from an older repository state.',
    );
    expect(output).toContain('Inspect Git status before continuing.');

    const noDrift = generateHandoff(fullCapsule, project, null, {
      drift: { hasDrift: false },
    });
    expect(noDrift).not.toContain('Drift warning');
  });

  it('marks working tree dirty when the snapshot says so', () => {
    const dirty = generateHandoff(
      baseCapsule({
        gitSnapshot: { workingTreeClean: false, capturedAt: '2026-10-02T00:00:00.000Z' },
      }),
      project,
      null,
    );
    expect(dirty).toContain('- Working tree: dirty');
  });

  it('embeds compact Master Context under Architecture and Rules', () => {
    const master: MasterContextInfo = {
      goal: 'Long-lived project goal',
      architectureNotes: 'Monorepo with core and desktop packages.',
      rulesConstraints: 'Never break the Windows build.',
    };
    const output = generateHandoff(fullCapsule, project, master);
    expect(output).toContain('*Master Context — Architecture:*');
    expect(output).toContain('Monorepo with core and desktop packages.');
    expect(output).toContain('*Master Context — Rules:*');
    expect(output).toContain('Never break the Windows build.');
    expect(headingsOf(output)).toEqual(EXPECTED_HEADINGS);
  });

  it('does not embed Master Context into a Master Context capsule itself', () => {
    const master: MasterContextInfo = {
      goal: 'goal',
      architectureNotes: 'arch notes unique-to-master',
      rulesConstraints: 'rule notes unique-to-master',
    };
    const output = generateHandoff(baseCapsule({ type: 'Master Context' }), project, master);
    expect(output).not.toContain('unique-to-master');
    expect(headingsOf(output)).toEqual(EXPECTED_HEADINGS);
  });

  it('truncates oversized content in compact mode with explicit markers', () => {
    const big = 'lorem ipsum dolor sit amet '.repeat(2000);
    const capsule = baseCapsule({ currentTask: big, completedWork: big, goal: big });
    const output = generateHandoff(capsule, project, null, {
      compact: true,
      tokenBudget: 2000,
    });
    expect(output).toContain('[truncated]');
    expect(estimateTokens(output)).toBeLessThanOrEqual(2000);
    expect(headingsOf(output)).toEqual(EXPECTED_HEADINGS);
  });

  it('does not truncate in normal mode', () => {
    const big = 'lorem ipsum dolor sit amet '.repeat(500).trimEnd();
    const output = generateHandoff(baseCapsule({ currentTask: big }), project, null);
    expect(output).not.toContain('[truncated]');
    expect(output).toContain(big);
  });

  it('keeps every heading even when the budget cannot be met', () => {
    const big = 'x'.repeat(50000);
    const output = generateHandoff(baseCapsule({ goal: big }), project, null, {
      compact: true,
      tokenBudget: 10,
    });
    expect(headingsOf(output)).toEqual(EXPECTED_HEADINGS);
    expect(output).toContain('[truncated]');
  });

  it('is deterministic: identical inputs produce identical output', () => {
    const a = generateHandoff(fullCapsule, project, null, { compact: true });
    const b = generateHandoff(fullCapsule, project, null, { compact: true });
    expect(a).toBe(b);
  });

  it('uses a default budget of 8000 tokens', () => {
    expect(DEFAULT_TOKEN_BUDGET).toBe(8000);
  });
});

describe('token estimation', () => {
  it('uses the documented characters/4 heuristic', () => {
    expect(estimateTokens('')).toBe(0);
    expect(estimateTokens('abcd')).toBe(1);
    expect(estimateTokens('abcdefgh')).toBe(2);
    expect(estimateTokens('abcde')).toBe(2);
    expect(estimateTokens('a'.repeat(4000))).toBe(1000);
  });
});
