import type { Database } from 'better-sqlite3';
import { z } from 'zod';
import {
  capsuleStatusSchema,
  capsuleTypeSchema,
  exportDocumentSchema,
  formatZodIssues,
} from '../schemas';
import { createCapsule } from '../repo/capsules';
import { err, ok, type AppResult, type Capsule } from '../types';
import type { CapsuleInput } from '../schemas';
import type { JsonExportDocument } from './export';
import { parseFrontMatter } from './frontMatter';

export interface NormalizedImport {
  sourceId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  input: CapsuleInput;
  kind: 'json' | 'markdown-structured' | 'markdown-plain';
  message?: string;
}

export function parseJsonImport(text: string): AppResult<JsonExportDocument> {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid JSON';
    return err('VALIDATION', 'File is not valid JSON.', [{ field: '(root)', message }]);
  }
  const parsed = exportDocumentSchema.safeParse(raw);
  if (!parsed.success) {
    return err('VALIDATION', 'Export document failed validation.', formatZodIssues(parsed.error));
  }
  return ok(parsed.data);
}

export function normalizeJsonImport(doc: JsonExportDocument): NormalizedImport {
  const c = doc.capsule;
  return {
    sourceId: c.id,
    createdAt: c.created_at,
    updatedAt: c.updated_at,
    kind: 'json',
    input: {
      title: c.title,
      type: c.type,
      status: c.status,
      summary: c.summary,
      goal: c.goal,
      currentTask: c.current_task,
      completedWork: c.completed_work,
      changedFiles: c.changed_files,
      commandsRun: c.commands_run,
      verificationResults: c.verification_results,
      knownIssues: c.known_issues,
      nextTask: c.next_task,
      rulesConstraints: c.rules_constraints,
      architectureNotes: c.architecture_notes,
      notes: c.notes,
      gitHead: c.git_head,
      gitBranch: c.git_branch,
      gitSnapshot: (c.git_snapshot as CapsuleInput['gitSnapshot']) ?? null,
      tags: doc.tags,
    },
  };
}

const NOT_PROVIDED = '_Not provided._';

function parseGitSnapshotField(raw: string): CapsuleInput['gitSnapshot'] {
  if (raw.trim().length === 0) {
    return null;
  }
  try {
    const value: unknown = JSON.parse(raw);
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      return value as CapsuleInput['gitSnapshot'];
    }
  } catch {
    // corrupt snapshot in an otherwise valid file: import without it
  }
  return null;
}

function sectionText(value: string): string {
  const trimmed = value.trim();
  if (trimmed === NOT_PROVIDED || trimmed.length === 0) {
    return '';
  }
  return trimmed;
}

function stripMasterContextBlock(value: string): string {
  const marker = '\n*Master Context —';
  const index = value.indexOf(marker);
  if (index === -1) {
    return value;
  }
  return value.slice(0, index);
}

function bulletsOf(value: string): string[] {
  const text = sectionText(value);
  if (text.length === 0) {
    return [];
  }
  return text
    .split('\n')
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2));
}

function splitSections(body: string): Map<string, string> {
  const sections = new Map<string, string>();
  const lines = body.replace(/\r\n/g, '\n').split('\n');
  let current: string | null = null;
  let buffer: string[] = [];
  const flush = () => {
    if (current !== null) {
      sections.set(current, buffer.join('\n').trim());
    }
    buffer = [];
  };
  for (const line of lines) {
    if (line.startsWith('## ')) {
      flush();
      current = line.slice(3).trim();
    } else if (current !== null) {
      buffer.push(line);
    }
  }
  flush();
  return sections;
}

const markdownFrontMatterSchema = z.object({
  id: z.string().min(1),
  title: z.string().min(1),
  type: capsuleTypeSchema,
  status: capsuleStatusSchema,
  tags: z.array(z.string()),
  project: z.string().default(''),
  created: z.string().default(''),
  updated: z.string().default(''),
  git_head: z.string().default(''),
  git_branch: z.string().default(''),
  git_snapshot: z.string().default(''),
});

export type MarkdownImportResult =
  | { kind: 'structured'; normalized: NormalizedImport }
  | { kind: 'plain'; normalized: NormalizedImport };

export function parseMarkdownImport(text: string): AppResult<MarkdownImportResult> {
  const front = parseFrontMatter(text);
  if (!front.present || String(front.fields['contextbridge']) !== '1') {
    const titleGuess =
      text
        .split('\n')
        .map((l) => l.trim())
        .find((l) => l.length > 0)
        ?.slice(0, 80) ?? 'Imported notes';
    return ok({
      kind: 'plain',
      normalized: {
        sourceId: null,
        createdAt: null,
        updatedAt: null,
        kind: 'markdown-plain',
        message: 'No ContextBridge structure was detected; imported as plain notes.',
        input: {
          title: titleGuess,
          type: 'Other',
          status: 'Draft',
          notes: text,
          tags: [],
        },
      },
    });
  }

  const raw = {
    id: String(front.fields['id'] ?? ''),
    title: String(front.fields['title'] ?? ''),
    type: String(front.fields['type'] ?? ''),
    status: String(front.fields['status'] ?? ''),
    tags: Array.isArray(front.fields['tags'])
      ? front.fields['tags'].map(String)
      : typeof front.fields['tags'] === 'string' && front.fields['tags'].length > 0
        ? String(front.fields['tags']).split(',')
        : [],
    project: String(front.fields['project'] ?? ''),
    created: String(front.fields['created'] ?? ''),
    updated: String(front.fields['updated'] ?? ''),
    git_head: String(front.fields['git_head'] ?? ''),
    git_branch: String(front.fields['git_branch'] ?? ''),
    git_snapshot: String(front.fields['git_snapshot'] ?? ''),
  };

  const validated = markdownFrontMatterSchema.safeParse(raw);
  if (!validated.success) {
    return err(
      'VALIDATION',
      'Markdown front matter failed validation.',
      formatZodIssues(validated.error),
    );
  }

  const sections = splitSections(front.body);
  const get = (title: string): string => sectionText(sections.get(title) ?? '');

  const normalized: NormalizedImport = {
    sourceId: validated.data.id,
    createdAt: validated.data.created.length > 0 ? validated.data.created : null,
    updatedAt: validated.data.updated.length > 0 ? validated.data.updated : null,
    kind: 'markdown-structured',
    input: {
      title: validated.data.title,
      type: validated.data.type,
      status: validated.data.status,
      summary: '',
      goal: sectionText(get('Product Goal')),
      currentTask: sectionText(get('Current Task')),
      completedWork: sectionText(get('Completed Work')),
      changedFiles: bulletsOf(sections.get('Files Changed') ?? ''),
      commandsRun: bulletsOf(sections.get('Commands Run') ?? ''),
      verificationResults: sectionText(get('Verification')),
      knownIssues: sectionText(get('Known Issues / Blockers')),
      nextTask: sectionText(get('Next Exact Task')),
      rulesConstraints: stripMasterContextBlock(get('Rules and Constraints')).trim(),
      architectureNotes: stripMasterContextBlock(get('Architecture / Technical Notes')).trim(),
      notes: '',
      gitHead: validated.data.git_head,
      gitBranch: validated.data.git_branch,
      gitSnapshot: parseGitSnapshotField(validated.data.git_snapshot),
      tags: validated.data.tags,
    },
  };

  return ok({ kind: 'structured', normalized });
}

/**
 * Writes an import into the database under `projectId`.
 * On ID collision a new local id is generated and the source id is preserved
 * in `imported_original_id`. Never overwrites an existing capsule.
 */
export function importNormalized(
  db: Database,
  projectId: string,
  normalized: NormalizedImport,
): AppResult<Capsule> {
  let preserveId: string | undefined;
  let importedOriginalId: string | null = null;

  if (normalized.sourceId !== null) {
    const collision = db.prepare('SELECT 1 FROM capsules WHERE id = ?').get(normalized.sourceId);
    if (collision) {
      preserveId = undefined;
      importedOriginalId = normalized.sourceId;
    } else {
      preserveId = normalized.sourceId;
      importedOriginalId = null;
    }
  }

  return createCapsule(db, projectId, normalized.input, {
    revisionReason: 'import',
    source: 'imported',
    preserveId,
    importedOriginalId,
    createdAt: normalized.createdAt ?? undefined,
    updatedAt: normalized.updatedAt ?? undefined,
  });
}
