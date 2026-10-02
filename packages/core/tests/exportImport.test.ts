import { afterEach, describe, expect, it } from 'vitest';
import {
  createCapsule,
  createProject,
  getCapsule,
  importNormalized,
  normalizeJsonImport,
  parseJsonImport,
  parseMarkdownImport,
  toJsonExportString,
  toMarkdownExport,
  type Capsule,
} from '../src/index';
import { createTestDb, type TestContext } from './helpers';

const contexts: TestContext[] = [];
function ctx(label: string): TestContext {
  const c = createTestDb(label);
  contexts.push(c);
  return c;
}
afterEach(() => {
  while (contexts.length > 0) {
    contexts.pop()?.cleanup();
  }
});

const input = {
  title: 'Exportable capsule',
  type: 'Session Handoff' as const,
  status: 'Verified' as const,
  summary: 'A summary with: colons and "quotes"',
  goal: 'Round trip everything',
  currentTask: 'Testing export',
  completedWork: 'Wrote export code',
  changedFiles: ['src/export.ts', 'tests/export.test.ts'],
  commandsRun: ['npm test', 'npm run lint'],
  verificationResults: 'all green',
  knownIssues: 'none',
  nextTask: 'import preview UI',
  rulesConstraints: 'never lose data',
  architectureNotes: 'io module in core',
  notes: 'free-form notes stay in notes',
  gitHead: 'feedbeef12345678feedbeef12345678feedbeef',
  gitBranch: 'feature/export',
  gitSnapshot: {
    head: 'feedbeef12345678feedbeef12345678feedbeef',
    branch: 'feature/export',
    workingTreeClean: true,
    capturedAt: '2026-10-02T11:00:00.000Z',
  },
  tags: ['export', 'round-trip'],
};

function createSourceCapsule(c: TestContext): {
  capsule: Capsule;
  projectId: string;
} {
  const p = createProject(c.db, {
    name: 'Bridge API',
    repositoryPath: 'C:\\dev\\bridge',
  });
  if (!p.ok) throw new Error('setup failed');
  const cap = createCapsule(c.db, p.value.id, input);
  if (!cap.ok) throw new Error('setup failed');
  return { capsule: cap.value, projectId: p.value.id };
}

function createTargetProject(c: TestContext): string {
  const p = createProject(c.db, {
    name: 'Bridge API',
    repositoryPath: 'C:\\dev\\bridge',
  });
  if (!p.ok) throw new Error('setup failed');
  return p.value.id;
}

function expectStructuredFieldsEqual(a: Capsule, b: Capsule): void {
  expect(b.title).toBe(a.title);
  expect(b.type).toBe(a.type);
  expect(b.status).toBe(a.status);
  expect(b.summary).toBe(a.summary);
  expect(b.goal).toBe(a.goal);
  expect(b.currentTask).toBe(a.currentTask);
  expect(b.completedWork).toBe(a.completedWork);
  expect(b.changedFiles).toEqual(a.changedFiles);
  expect(b.commandsRun).toEqual(a.commandsRun);
  expect(b.verificationResults).toBe(a.verificationResults);
  expect(b.knownIssues).toBe(a.knownIssues);
  expect(b.nextTask).toBe(a.nextTask);
  expect(b.rulesConstraints).toBe(a.rulesConstraints);
  expect(b.architectureNotes).toBe(a.architectureNotes);
  expect(b.notes).toBe(a.notes);
  expect(b.gitHead).toBe(a.gitHead);
  expect(b.gitBranch).toBe(a.gitBranch);
  expect(b.gitSnapshot).toEqual(a.gitSnapshot);
  expect(b.tokenEstimate).toBe(a.tokenEstimate);
  expect(b.createdAt).toBe(a.createdAt);
  expect(b.updatedAt).toBe(a.updatedAt);
  expect(b.contentMarkdown).toBe(a.contentMarkdown);
}

describe('JSON export / import', () => {
  it('export document has the required envelope shape', () => {
    const c = ctx('json-shape');
    const { capsule } = createSourceCapsule(c);
    const p = createProject(c.db, { name: 'Bridge API' });
    if (!p.ok) throw new Error('setup failed');
    const text = toJsonExportString(capsule, { ...p.value, repositoryPath: 'C:\\dev\\bridge' }, [
      { id: 't1', name: 'export', createdAt: capsule.createdAt },
    ]);
    const doc = JSON.parse(text) as Record<string, unknown>;
    expect(doc.schemaVersion).toBe(1);
    expect(doc.app).toBe('ContextBridge');
    expect(typeof doc.exportedAt).toBe('string');
    expect((doc.project as { name: string }).name).toBe('Bridge API');
    expect((doc.capsule as { id: string }).id).toBe(capsule.id);
    expect(Array.isArray(doc.tags)).toBe(true);
    const parsed = parseJsonImport(text);
    expect(parsed.ok).toBe(true);
  });

  it('round trips identical structured fields into a fresh database', () => {
    const source = ctx('json-src');
    const { capsule } = createSourceCapsule(source);

    const target = ctx('json-dst');
    const targetProjectId = createTargetProject(target);

    const text = toJsonExportString(
      capsule,
      {
        id: 'p',
        name: 'Bridge API',
        slug: 'bridge-api',
        description: '',
        repositoryPath: 'C:\\dev\\bridge',
        activeCapsuleId: null,
        createdAt: capsule.createdAt,
        updatedAt: capsule.updatedAt,
        archivedAt: null,
      },
      [
        { id: 't1', name: 'export', createdAt: capsule.createdAt },
        { id: 't2', name: 'round-trip', createdAt: capsule.createdAt },
      ],
    );

    const parsed = parseJsonImport(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;

    const normalized = normalizeJsonImport(parsed.value);
    const imported = importNormalized(target.db, targetProjectId, normalized);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;

    expect(imported.value.id).toBe(capsule.id);
    expect(imported.value.importedOriginalId).toBeNull();
    expect(imported.value.source).toBe('imported');
    expectStructuredFieldsEqual(capsule, imported.value);
    const tags = target.db
      .prepare(
        'SELECT t.name FROM tags t JOIN capsule_tags ct ON ct.tag_id = t.id WHERE ct.capsule_id = ? ORDER BY t.name',
      )
      .all(imported.value.id) as Array<{ name: string }>;
    expect(tags.map((t) => t.name)).toEqual(['export', 'round-trip']);
  });

  it('creates a new local id on collision and preserves the source id', () => {
    const src = ctx('json-collision-src');
    const { capsule } = createSourceCapsule(src);
    const dst = ctx('json-collision-dst');
    const targetProjectId = createTargetProject(dst);

    const text = toJsonExportString(
      capsule,
      {
        id: 'p',
        name: 'Bridge API',
        slug: 'bridge-api',
        description: '',
        repositoryPath: '',
        activeCapsuleId: null,
        createdAt: capsule.createdAt,
        updatedAt: capsule.updatedAt,
        archivedAt: null,
      },
      [],
    );

    const parsed = parseJsonImport(text);
    if (!parsed.ok) throw new Error('parse failed');
    const first = importNormalized(dst.db, targetProjectId, normalizeJsonImport(parsed.value));
    expect(first.ok).toBe(true);
    expect(first.ok && first.value.id).toBe(capsule.id);

    const second = importNormalized(dst.db, targetProjectId, normalizeJsonImport(parsed.value));
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.value.id).not.toBe(capsule.id);
    expect(second.value.importedOriginalId).toBe(capsule.id);
  });

  it('reports invalid JSON with a field name', () => {
    const c = ctx('json-invalid');
    void c;
    const result = parseJsonImport('{ not json');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
      expect(result.error.details?.[0]?.field).toBe('(root)');
    }
  });

  it('reports schema violations with dotted field names', () => {
    const missingVersion = parseJsonImport('{"app":"ContextBridge"}');
    expect(missingVersion.ok).toBe(false);
    if (!missingVersion.ok) {
      expect(missingVersion.error.details?.some((d) => d.field === 'schemaVersion')).toBe(true);
    }

    const c = ctx('json-badtype');
    const { capsule } = createSourceCapsule(c);
    const doc = JSON.parse(
      toJsonExportString(
        capsule,
        {
          id: 'p',
          name: 'Bridge API',
          slug: 'bridge-api',
          description: '',
          repositoryPath: '',
          activeCapsuleId: null,
          createdAt: capsule.createdAt,
          updatedAt: capsule.updatedAt,
          archivedAt: null,
        },
        [],
      ),
    ) as { capsule: { type: string } };
    doc.capsule.type = 'NotARealType';
    const result = parseJsonImport(JSON.stringify(doc));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.details?.some((d) => d.field === 'capsule.type')).toBe(true);
    }
  });
});

describe('Markdown export / import', () => {
  it('exports deterministic *** front matter followed by the handoff body', () => {
    const c = ctx('md-export');
    const { capsule } = createSourceCapsule(c);
    const project = {
      id: 'p',
      name: 'Bridge API',
      slug: 'bridge-api',
      description: '',
      repositoryPath: 'C:\\dev\\bridge',
      activeCapsuleId: null,
      createdAt: capsule.createdAt,
      updatedAt: capsule.updatedAt,
      archivedAt: null,
    };
    const text = toMarkdownExport(capsule, project, [
      { id: 't1', name: 'export', createdAt: capsule.createdAt },
      { id: 't2', name: 'round-trip', createdAt: capsule.createdAt },
    ]);
    expect(text.startsWith('***\n')).toBe(true);
    expect(text).toContain('contextbridge: 1');
    expect(text).toContain(`id: "${capsule.id}"`);
    expect(text).toContain('type: Session Handoff');
    expect(text).toContain('status: Verified');
    expect(text).toContain('project: Bridge API');
    expect(text).toContain('# Project Handoff');
    expect(text).toContain('## Current Task');
    const parsed = parseMarkdownImport(text);
    expect(parsed.ok).toBe(true);
    if (parsed.ok) {
      expect(parsed.value.kind).toBe('structured');
    }
  });

  it('round trips structured fields through Markdown', () => {
    const source = ctx('md-src');
    const { capsule } = createSourceCapsule(source);
    const project = {
      id: 'p',
      name: 'Bridge API',
      slug: 'bridge-api',
      description: '',
      repositoryPath: 'C:\\dev\\bridge',
      activeCapsuleId: null,
      createdAt: capsule.createdAt,
      updatedAt: capsule.updatedAt,
      archivedAt: null,
    };
    const text = toMarkdownExport(capsule, project, [
      { id: 't1', name: 'export', createdAt: capsule.createdAt },
      { id: 't2', name: 'round-trip', createdAt: capsule.createdAt },
    ]);

    const target = ctx('md-dst');
    const targetProjectId = createTargetProject(target);
    const parsed = parseMarkdownImport(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.kind).toBe('structured');

    const imported = importNormalized(target.db, targetProjectId, parsed.value.normalized);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    const got = imported.value;

    expect(got.id).toBe(capsule.id);
    expect(got.title).toBe(capsule.title);
    expect(got.type).toBe(capsule.type);
    expect(got.status).toBe(capsule.status);
    expect(got.goal).toBe(capsule.goal);
    expect(got.currentTask).toBe(capsule.currentTask);
    expect(got.completedWork).toBe(capsule.completedWork);
    expect(got.changedFiles).toEqual(capsule.changedFiles);
    expect(got.commandsRun).toEqual(capsule.commandsRun);
    expect(got.verificationResults).toBe(capsule.verificationResults);
    expect(got.knownIssues).toBe(capsule.knownIssues);
    expect(got.nextTask).toBe(capsule.nextTask);
    expect(got.rulesConstraints).toBe(capsule.rulesConstraints);
    expect(got.architectureNotes).toBe(capsule.architectureNotes);
    expect(got.gitHead).toBe(capsule.gitHead);
    expect(got.gitBranch).toBe(capsule.gitBranch);
    const tags = target.db
      .prepare(
        'SELECT t.name FROM tags t JOIN capsule_tags ct ON ct.tag_id = t.id WHERE ct.capsule_id = ? ORDER BY t.name',
      )
      .all(got.id) as Array<{ name: string }>;
    expect(tags.map((t) => t.name)).toEqual(['export', 'round-trip']);
    expect(got.source).toBe('imported');
    // summary and notes are not part of the handoff body or front matter schema
    expect(got.summary).toBe('');
    expect(got.notes).toBe('');
    expect(got.contentMarkdown).toBe(capsule.contentMarkdown);
  });

  it('imports Markdown without front matter as plain notes', () => {
    const c = ctx('md-plain');
    const projectId = createTargetProject(c);
    const raw = '# Scratch thoughts\nJust some free-form text\nwith two lines.';
    const parsed = parseMarkdownImport(raw);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.kind).toBe('plain');
    expect(parsed.value.normalized.kind).toBe('markdown-plain');
    expect(parsed.value.normalized.message).toBe(
      'No ContextBridge structure was detected; imported as plain notes.',
    );

    const imported = importNormalized(c.db, projectId, parsed.value.normalized);
    expect(imported.ok).toBe(true);
    if (!imported.ok) return;
    expect(imported.value.type).toBe('Other');
    expect(imported.value.status).toBe('Draft');
    expect(imported.value.notes).toBe(raw);
    expect(imported.value.title).toBe('# Scratch thoughts');
  });

  it('rejects front matter with an invalid type and names the field', () => {
    const c = ctx('md-badtype');
    void c;
    const text = [
      '***',
      'contextbridge: 1',
      'id: some-id',
      'title: Bad capsule',
      'type: NotAType',
      'status: Draft',
      'tags: []',
      'project: P',
      '***',
      '# Project Handoff',
      '',
      '## Project',
      'P',
    ].join('\n');
    const parsed = parseMarkdownImport(text);
    expect(parsed.ok).toBe(false);
    if (!parsed.ok) {
      expect(parsed.error.code).toBe('VALIDATION');
      expect(parsed.error.details?.some((d) => d.field === 'type')).toBe(true);
    }
  });

  it('accepts standard --- front matter as well', () => {
    const text = [
      '---',
      'contextbridge: 1',
      'id: dash-id',
      'title: Dash capsule',
      'type: Other',
      'status: Draft',
      'tags: [alpha]',
      'project: P',
      '---',
      '# Project Handoff',
      '',
      '## Project',
      'P',
      '',
      '## Current Task',
      'do the thing',
    ].join('\n');
    const parsed = parseMarkdownImport(text);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.value.kind).toBe('structured');
    expect(parsed.value.normalized.input.currentTask).toBe('do the thing');
    expect(parsed.value.normalized.input.tags).toEqual(['alpha']);
  });
});

describe('import never overwrites existing data', () => {
  it('leaves the original capsule untouched after a colliding import', () => {
    const c = ctx('no-overwrite');
    const { capsule } = createSourceCapsule(c);
    const targetProjectId = createTargetProject(c);

    const text = toJsonExportString(
      capsule,
      {
        id: 'p',
        name: 'Bridge API',
        slug: 'bridge-api',
        description: '',
        repositoryPath: '',
        activeCapsuleId: null,
        createdAt: capsule.createdAt,
        updatedAt: capsule.updatedAt,
        archivedAt: null,
      },
      [],
    );
    const parsed = parseJsonImport(text);
    if (!parsed.ok) throw new Error('parse failed');
    const imported = importNormalized(c.db, targetProjectId, normalizeJsonImport(parsed.value));
    expect(imported.ok).toBe(true);

    const original = getCapsule(c.db, capsule.id);
    expect(original.ok).toBe(true);
    if (original.ok) {
      expect(original.value.currentTask).toBe(capsule.currentTask);
      expect(original.value.source).toBe('manual');
    }
  });
});
