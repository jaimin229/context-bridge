import type { Database } from 'better-sqlite3';
import { err, ok, type AppResult } from '../types';
import { nowIso } from '../util';

interface SettingRow {
  key: string;
  value_json: string;
  updated_at: string;
}

export function getSetting<T>(db: Database, key: string, fallback: T): T {
  const row = db
    .prepare('SELECT key, value_json, updated_at FROM app_settings WHERE key = ?')
    .get(key) as SettingRow | undefined;
  if (!row) {
    return fallback;
  }
  try {
    return JSON.parse(row.value_json) as T;
  } catch {
    return fallback;
  }
}

export function setSetting(db: Database, key: string, value: unknown): AppResult<void> {
  if (key.length === 0 || key.length > 100) {
    return err('VALIDATION', 'Setting key must be 1-100 characters.');
  }
  let json: string;
  try {
    json = JSON.stringify(value ?? null);
  } catch {
    return err('VALIDATION', 'Setting value is not JSON-serializable.');
  }
  db.prepare(
    `INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
  ).run(key, json, nowIso());
  return ok(undefined);
}

export function listSettings(db: Database): Record<string, unknown> {
  const rows = db
    .prepare('SELECT key, value_json, updated_at FROM app_settings ORDER BY key ASC')
    .all() as SettingRow[];
  const out: Record<string, unknown> = {};
  for (const row of rows) {
    try {
      out[row.key] = JSON.parse(row.value_json);
    } catch {
      out[row.key] = null;
    }
  }
  return out;
}
