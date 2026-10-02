import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { openDatabase, runMigrations } from '../src/index';
import { MIGRATIONS_DIR, createTestDb, type TestContext } from './helpers';

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

describe('migrations', () => {
  it('applies numbered migrations and records them in schema_migrations', () => {
    const c = ctx('migrations');
    const rows = c.db
      .prepare('SELECT version, name FROM schema_migrations ORDER BY version')
      .all() as Array<{ version: number; name: string }>;
    expect(rows.length).toBeGreaterThanOrEqual(1);
    expect(rows[0].version).toBe(1);
    expect(rows[0].name).toBe('001_initial.sql');
  });

  it('creates a database backup before applying migrations', () => {
    const c = ctx('backup');
    const backupDir = join(c.dir, 'backups');
    expect(existsSync(backupDir)).toBe(true);
    const backups = readdirSync(backupDir);
    expect(backups.length).toBeGreaterThanOrEqual(1);
    expect(backups[0]).toContain('.backup-v0-');
  });

  it('is idempotent: a second run applies nothing and creates no extra backup', () => {
    const c = ctx('idempotent');
    const result = runMigrations(c.db, MIGRATIONS_DIR, c.dbPath);
    expect(result.applied).toEqual([]);
    expect(result.backups).toEqual([]);
  });

  it('creates all expected tables, indices, FTS table, and triggers', () => {
    const c = ctx('schema');
    const tables = (
      c.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{
        name: string;
      }>
    ).map((r) => r.name);
    for (const expected of [
      'projects',
      'capsules',
      'tags',
      'capsule_tags',
      'capsule_revisions',
      'app_settings',
      'schema_migrations',
      'capsules_fts',
    ]) {
      expect(tables).toContain(expected);
    }

    const triggers = (
      c.db.prepare("SELECT name FROM sqlite_master WHERE type='trigger'").all() as Array<{
        name: string;
      }>
    ).map((r) => r.name);
    expect(triggers).toContain('capsules_fts_ai');
    expect(triggers).toContain('capsules_fts_ad');
    expect(triggers).toContain('capsules_fts_au');
  });

  it('enables foreign keys and WAL mode', () => {
    const c = ctx('pragmas');
    expect(c.db.pragma('foreign_keys', { simple: true })).toBe(1);
    expect(c.db.pragma('journal_mode', { simple: true })).toBe('wal');
  });

  it('rejects malformed migration file names in a directory', () => {
    const c = ctx('badname');
    const badDir = join(c.dir, 'bad-migrations');
    mkdirSync(badDir, { recursive: true });
    writeFileSync(join(badDir, 'init.sql'), 'SELECT 1;');
    expect(() => runMigrations(c.db, badDir, c.dbPath)).toThrow(/must start with a number/);
  });

  it('rolls back a failing migration and reports the file name', () => {
    const c = ctx('fail');
    const failDir = join(c.dir, 'fail-migrations');
    mkdirSync(failDir, { recursive: true });
    writeFileSync(join(failDir, '101_ok.sql'), 'CREATE TABLE ok_table (id TEXT);');
    writeFileSync(join(failDir, '102_bad.sql'), 'THIS IS NOT SQL;');
    expect(() => runMigrations(c.db, failDir, c.dbPath)).toThrow(/102_bad\.sql failed/);
    const tables = (
      c.db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{
        name: string;
      }>
    ).map((r) => r.name);
    expect(tables).toContain('ok_table');
    expect(tables).not.toContain('bad_table');
    const applied = c.db.prepare('SELECT version FROM schema_migrations').all() as Array<{
      version: number;
    }>;
    expect(applied.map((r) => r.version)).toEqual([1, 101]);
  });
});

describe('openDatabase', () => {
  it('opens read-only databases without WAL switch', () => {
    const c = ctx('readonly');
    c.db.close();
    const ro = openDatabase({ databasePath: c.dbPath, readOnly: true });
    try {
      const count = ro.prepare('SELECT count(*) AS c FROM projects').get() as { c: number };
      expect(count.c).toBe(0);
    } finally {
      ro.close();
    }
  });
});
