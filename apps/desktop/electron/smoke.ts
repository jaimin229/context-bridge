import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';

export interface ProbeResult {
  sqliteVersion: string;
  fts5Available: boolean;
  fts5QueryWorked: boolean;
}

/**
 * Opens a real SQLite database at the given path and verifies FTS5 support.
 * Used by the `ping` IPC handler and by the packaged `--smoke-test` mode.
 */
export function runSqliteProbe(databasePath: string): ProbeResult {
  mkdirSync(dirname(databasePath), { recursive: true });
  const db = new Database(databasePath);
  try {
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');

    const versionRow = db.prepare('SELECT sqlite_version() AS v').get() as {
      v: string;
    };

    let fts5Available = false;
    let fts5QueryWorked = false;
    try {
      db.exec('CREATE VIRTUAL TABLE IF NOT EXISTS probe_fts USING fts5(content)');
      db.exec('DELETE FROM probe_fts');
      db.exec("INSERT INTO probe_fts(content) VALUES ('contextbridge probe row')");
      const row = db
        .prepare("SELECT count(*) AS c FROM probe_fts WHERE probe_fts MATCH 'contextbridge'")
        .get() as { c: number };
      fts5Available = true;
      fts5QueryWorked = row.c === 1;
    } catch {
      fts5Available = false;
      fts5QueryWorked = false;
    }

    return {
      sqliteVersion: versionRow.v,
      fts5Available,
      fts5QueryWorked,
    };
  } finally {
    db.close();
  }
}
