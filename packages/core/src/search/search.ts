import type { Database } from 'better-sqlite3';
import { err, ok, type AppResult, type CapsuleStatus, type CapsuleType } from '../types';
import { normalizeTagName } from '../repo/tags';

const MAX_QUERY_LENGTH = 1000;
const MAX_TERMS = 32;
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export const SNIPPET_OPEN = '\u0002';
export const SNIPPET_CLOSE = '\u0003';

export interface SearchFilter {
  projectId?: string;
  types?: CapsuleType[];
  statuses?: CapsuleStatus[];
  tagNames?: string[];
  includeArchived?: boolean;
  includeDeleted?: boolean;
  limit?: number;
  offset?: number;
}

export interface SearchHit {
  id: string;
  projectId: string;
  title: string;
  type: CapsuleType;
  status: CapsuleStatus;
  updatedAt: string;
  archivedAt: string | null;
  snippet: string;
  rank: number;
}

export interface SearchOutcome {
  query: string;
  normalizedQuery: string;
  hits: SearchHit[];
  total: number;
}

function quoteTerm(term: string): string {
  return `"${term}"`;
}

/**
 * Converts raw user input into a safe FTS5 MATCH expression.
 *
 * Every user term is wrapped in double quotes, so FTS5 operators
 * (`*`, `-`, `NEAR`, `OR`, `(`, `:` …) are always literal text and can never
 * change the query structure. Phrases inside explicit quotes are kept
 * together. A trailing prefix `*` is added to the final term so search works
 * while typing. Returns null when the input contains no searchable terms.
 */
export function buildMatchQuery(rawQuery: string): string | null {
  const raw = rawQuery.trim();
  if (raw.length === 0) {
    return null;
  }
  const terms: string[] = [];

  const phrasePattern = /"([^"]+)"/g;
  let match: RegExpExecArray | null;
  const consumed: string[] = [];
  while ((match = phrasePattern.exec(raw)) !== null) {
    consumed.push(match[0]);
    const phrase = match[1].replace(/\s+/g, ' ').trim();
    if (phrase.length > 0) {
      terms.push(quoteTerm(phrase));
    }
  }
  let rest = raw;
  for (const part of consumed) {
    rest = rest.replace(part, ' ');
  }
  for (const word of rest.split(/\s+/)) {
    const cleaned = word.replace(/"/g, '').trim();
    if (cleaned.length > 0) {
      terms.push(quoteTerm(cleaned));
    }
  }

  if (terms.length === 0) {
    return null;
  }
  const capped = terms.slice(0, MAX_TERMS);
  const last = capped.length - 1;
  capped[last] = `${capped[last]}*`;
  return capped.join(' AND ');
}

function placeholders(count: number): string {
  return new Array(count).fill('?').join(', ');
}

interface HitRow {
  id: string;
  project_id: string;
  title: string;
  type: CapsuleType;
  status: CapsuleStatus;
  updated_at: string;
  archived_at: string | null;
  snip_content: string;
  snip_title: string;
  rank: number;
}

function pickSnippet(row: HitRow): string {
  if (row.snip_content.includes(SNIPPET_OPEN)) {
    return row.snip_content;
  }
  return row.snip_title;
}

export function searchCapsules(
  db: Database,
  query: string,
  filter: SearchFilter = {},
): AppResult<SearchOutcome> {
  const raw = (query ?? '').trim();
  if (raw.length === 0) {
    return err('VALIDATION', 'Search query is required.');
  }
  if (raw.length > MAX_QUERY_LENGTH) {
    return err('VALIDATION', `Search query must be at most ${MAX_QUERY_LENGTH} characters.`);
  }

  const match = buildMatchQuery(raw);
  if (match === null) {
    return ok({ query: raw, normalizedQuery: '', hits: [], total: 0 });
  }

  const where: string[] = ['capsules_fts MATCH ?'];
  const params: unknown[] = [match];

  if (filter.projectId !== undefined && filter.projectId.length > 0) {
    where.push('c.project_id = ?');
    params.push(filter.projectId);
  }
  if (filter.types !== undefined && filter.types.length > 0) {
    where.push(`c.type IN (${placeholders(filter.types.length)})`);
    params.push(...filter.types);
  }
  if (filter.statuses !== undefined && filter.statuses.length > 0) {
    where.push(`c.status IN (${placeholders(filter.statuses.length)})`);
    params.push(...filter.statuses);
  }
  if (filter.tagNames !== undefined && filter.tagNames.length > 0) {
    const names = filter.tagNames.map(normalizeTagName);
    where.push(
      `EXISTS (SELECT 1 FROM capsule_tags ct JOIN tags t ON t.id = ct.tag_id
        WHERE ct.capsule_id = c.id AND t.name IN (${placeholders(names.length)}))`,
    );
    params.push(...names);
  }
  if (!filter.includeDeleted) {
    where.push('c.deleted_at IS NULL');
  }
  if (!filter.includeArchived) {
    where.push('c.archived_at IS NULL');
  }

  const whereSql = where.join(' AND ');
  const limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(filter.limit ?? DEFAULT_LIMIT)));
  const offset = Math.max(0, Math.floor(filter.offset ?? 0));

  try {
    const totalRow = db
      .prepare(
        `SELECT count(*) AS n
         FROM capsules_fts
         JOIN capsules c ON c.rowid = capsules_fts.rowid
         WHERE ${whereSql}`,
      )
      .get(...params) as { n: number };

    const rows = db
      .prepare(
        `SELECT c.id, c.project_id, c.title, c.type, c.status, c.updated_at, c.archived_at,
                snippet(capsules_fts, 10, char(2), char(3), '…', 14) AS snip_content,
                snippet(capsules_fts, 0, char(2), char(3), '…', 10) AS snip_title,
                rank
         FROM capsules_fts
         JOIN capsules c ON c.rowid = capsules_fts.rowid
         WHERE ${whereSql}
         ORDER BY rank, c.updated_at DESC
         LIMIT ? OFFSET ?`,
      )
      .all(...params, limit, offset) as HitRow[];

    return ok({
      query: raw,
      normalizedQuery: match,
      total: totalRow.n,
      hits: rows.map((row) => ({
        id: row.id,
        projectId: row.project_id,
        title: row.title,
        type: row.type,
        status: row.status,
        updatedAt: row.updated_at,
        archivedAt: row.archived_at,
        snippet: pickSnippet(row),
        rank: row.rank,
      })),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return err('VALIDATION', `Search query could not be processed: ${message}`);
  }
}
