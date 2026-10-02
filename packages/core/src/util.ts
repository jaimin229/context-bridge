import type { Database } from 'better-sqlite3';
import { randomUUID } from 'node:crypto';

export function newId(): string {
  return randomUUID();
}

export function nowIso(): string {
  return new Date().toISOString();
}

export function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return base.length > 0 ? base : 'project';
}

export function uniqueSlug(db: Database, desired: string): string {
  const check = db.prepare('SELECT 1 FROM projects WHERE slug = ?');
  let candidate = desired;
  let counter = 2;
  while (check.get(candidate) !== undefined) {
    candidate = `${desired}-${counter}`;
    counter += 1;
  }
  return candidate;
}

export function parseJsonArray(value: string): string[] {
  try {
    const parsed: unknown = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.filter((v): v is string => typeof v === 'string');
    }
  } catch {
    // fall through
  }
  return [];
}

export function parseJsonSnapshot(value: string | null): unknown {
  if (value === null) {
    return null;
  }
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
