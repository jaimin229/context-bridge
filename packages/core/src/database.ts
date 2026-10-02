import Database from 'better-sqlite3';

export interface OpenDatabaseOptions {
  /** Absolute path to the SQLite file. Parent directories are created. */
  databasePath: string;
  /** Open in read-only mode. Defaults to false. */
  readOnly?: boolean;
  /** Busy timeout in milliseconds. Defaults to 5000. */
  busyTimeoutMs?: number;
}

export interface Fts5CheckResult {
  available: boolean;
  queryWorked: boolean;
}

/**
 * Opens a SQLite database with ContextBridge pragmas applied:
 * foreign keys ON, WAL journal mode, busy timeout.
 */
export function openDatabase(options: OpenDatabaseOptions): Database.Database {
  const db = new Database(options.databasePath, {
    readonly: options.readOnly ?? false,
  });
  db.pragma('foreign_keys = ON');
  if (!options.readOnly) {
    db.pragma('journal_mode = WAL');
  }
  db.pragma(`busy_timeout = ${options.busyTimeoutMs ?? 5000}`);
  return db;
}

/**
 * Verifies that the SQLite build supports FTS5 and that MATCH queries work.
 */
export function checkFts5(db: Database.Database): Fts5CheckResult {
  try {
    db.exec('CREATE VIRTUAL TABLE IF NOT EXISTS fts5_probe USING fts5(content)');
    db.exec("INSERT INTO fts5_probe(content) VALUES ('contextbridge fts5 probe row')");
    const row = db
      .prepare("SELECT count(*) AS c FROM fts5_probe WHERE fts5_probe MATCH 'contextbridge'")
      .get() as { c: number };
    db.exec('DELETE FROM fts5_probe');
    return { available: true, queryWorked: row.c === 1 };
  } catch {
    return { available: false, queryWorked: false };
  }
}

export interface SqliteProbeResult {
  sqliteVersion: string;
  fts5Available: boolean;
  fts5QueryWorked: boolean;
}

/**
 * One-shot probe used by tests and the Electron main process ping handler.
 */
export function probeSqlite(options: OpenDatabaseOptions): SqliteProbeResult {
  const db = openDatabase(options);
  try {
    const versionRow = db.prepare('SELECT sqlite_version() AS v').get() as {
      v: string;
    };
    const fts = checkFts5(db);
    return {
      sqliteVersion: versionRow.v,
      fts5Available: fts.available,
      fts5QueryWorked: fts.queryWorked,
    };
  } finally {
    db.close();
  }
}
