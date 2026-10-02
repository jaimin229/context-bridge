import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { checkFts5, openDatabase, probeSqlite } from '../src/index';

const tempDir = mkdtempSync(join(tmpdir(), 'contextbridge-core-'));
const dbPath = join(tempDir, 'test.db');

afterAll(() => {
  rmSync(tempDir, { recursive: true, force: true });
});

describe('database layer (real temporary SQLite file)', () => {
  it('opens a database with WAL, foreign keys, and busy timeout pragmas', () => {
    const db = openDatabase({ databasePath: dbPath });
    try {
      expect(db.pragma('journal_mode', { simple: true })).toBe('wal');
      expect(db.pragma('foreign_keys', { simple: true })).toBe(1);
      expect(db.pragma('busy_timeout', { simple: true })).toBe(5000);
    } finally {
      db.close();
    }
  });

  it('persists data across close/reopen (restart persistence primitive)', () => {
    const db = openDatabase({ databasePath: dbPath });
    db.exec('CREATE TABLE IF NOT EXISTS t (id INTEGER PRIMARY KEY, v TEXT)');
    db.prepare('INSERT INTO t (v) VALUES (?)').run('persisted');
    db.close();

    const reopened = openDatabase({ databasePath: dbPath });
    try {
      const row = reopened.prepare('SELECT v FROM t ORDER BY id DESC LIMIT 1').get() as { v: string };
      expect(row.v).toBe('persisted');
    } finally {
      reopened.close();
    }
  });

  it('supports FTS5 tables and MATCH queries', () => {
    const db = openDatabase({ databasePath: dbPath });
    try {
      const result = checkFts5(db);
      expect(result.available).toBe(true);
      expect(result.queryWorked).toBe(true);
    } finally {
      db.close();
    }
  });

  it('probeSqlite reports the SQLite version and working FTS5', () => {
    const result = probeSqlite({ databasePath: join(tempDir, 'probe.db') });
    expect(result.sqliteVersion).toMatch(/^\d+\.\d+\.\d+$/);
    expect(result.fts5Available).toBe(true);
    expect(result.fts5QueryWorked).toBe(true);
  });
});
