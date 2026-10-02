import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { Database } from 'better-sqlite3';
import { openDatabase, runMigrations } from '../src/index';

export const MIGRATIONS_DIR = join(process.cwd(), 'packages', 'core', 'migrations');

export interface TestContext {
  db: Database;
  dir: string;
  dbPath: string;
  cleanup: () => void;
}

export function createTestDb(label = 'db'): TestContext {
  const dir = mkdtempSync(join(tmpdir(), `contextbridge-${label}-`));
  const dbPath = join(dir, 'contextbridge.db');
  const db = openDatabase({ databasePath: dbPath });
  runMigrations(db, MIGRATIONS_DIR, dbPath);
  return {
    db,
    dir,
    dbPath,
    cleanup: () => {
      try {
        db.close();
      } catch {
        // already closed
      }
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
