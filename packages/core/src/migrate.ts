import type { Database } from 'better-sqlite3';
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';

export interface MigrationRunResult {
  applied: Array<{ version: number; name: string }>;
  backups: string[];
}

function versionOf(fileName: string): number {
  const match = /^(\d+)/.exec(fileName);
  if (!match) {
    throw new Error(`Migration file name must start with a number: ${fileName}`);
  }
  return Number.parseInt(match[1], 10);
}

function sanitizeTimestamp(iso: string): string {
  return iso.replace(/[:.]/g, '-');
}

/**
 * Applies pending numbered SQL migrations from `migrationsDir`.
 * - Records applied versions in `schema_migrations`.
 * - Backs up the database (VACUUM INTO) before applying any pending migration.
 * - Each migration runs inside a transaction; failures roll back and rethrow.
 */
export function runMigrations(
  db: Database,
  migrationsDir: string,
  databasePath: string,
): MigrationRunResult {
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const files = readdirSync(migrationsDir).filter((f) => f.toLowerCase().endsWith('.sql'));
  const versions = new Map(files.map((f) => [f, versionOf(f)]));
  files.sort((a, b) => (versions.get(a) as number) - (versions.get(b) as number));

  const appliedRows = db.prepare('SELECT version FROM schema_migrations').all() as Array<{
    version: number;
  }>;
  const appliedSet = new Set(appliedRows.map((r) => r.version));
  const pending = files.filter((f) => !appliedSet.has(versionOf(f)));

  const backups: string[] = [];
  if (pending.length > 0 && existsSync(databasePath)) {
    const backupDir = join(dirname(databasePath), 'backups');
    mkdirSync(backupDir, { recursive: true });
    const stamp = sanitizeTimestamp(new Date().toISOString());
    const lastApplied = appliedRows.length > 0 ? Math.max(...appliedRows.map((r) => r.version)) : 0;
    const backupPath = join(
      backupDir,
      `${basename(databasePath)}.backup-v${lastApplied}-${stamp}.sqlite`,
    );
    db.prepare('VACUUM INTO ?').run(backupPath);
    backups.push(backupPath);
  }

  const insert = db.prepare(
    'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
  );
  const applied: Array<{ version: number; name: string }> = [];

  for (const file of pending) {
    const version = versionOf(file);
    const sql = readFileSync(join(migrationsDir, file), 'utf8');
    try {
      db.exec('BEGIN');
      db.exec(sql);
      insert.run(version, file, new Date().toISOString());
      db.exec('COMMIT');
      applied.push({ version, name: file });
    } catch (error) {
      try {
        db.exec('ROLLBACK');
      } catch {
        // transaction may already be rolled back by SQLite
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Migration ${file} failed: ${message}`, { cause: error });
    }
  }

  return { applied, backups };
}
