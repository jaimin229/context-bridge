import { afterEach, describe, expect, it } from 'vitest';
import { getSetting, listSettings, setSetting } from '../src/index';
import { createTestDb, type TestContext } from './helpers';

const contexts: TestContext[] = [];
function ctx(): TestContext {
  const c = createTestDb('settings');
  contexts.push(c);
  return c;
}
afterEach(() => {
  while (contexts.length > 0) {
    contexts.pop()?.cleanup();
  }
});

describe('app settings', () => {
  it('returns the fallback for missing settings', () => {
    const c = ctx();
    expect(getSetting(c.db, 'appearance', 'dark')).toBe('dark');
    expect(getSetting(c.db, 'tokenBudget', 8000)).toBe(8000);
    expect(getSetting(c.db, 'missing', null)).toBeNull();
  });

  it('stores and reads back JSON values', () => {
    const c = ctx();
    expect(setSetting(c.db, 'appearance', 'light').ok).toBe(true);
    expect(getSetting(c.db, 'appearance', 'dark')).toBe('light');

    expect(setSetting(c.db, 'tokenBudget', 12000).ok).toBe(true);
    expect(getSetting(c.db, 'tokenBudget', 8000)).toBe(12000);

    expect(setSetting(c.db, 'filters', { types: ['Bug Report'], tags: ['x'] }).ok).toBe(true);
    expect(getSetting(c.db, 'filters', null)).toEqual({
      types: ['Bug Report'],
      tags: ['x'],
    });
  });

  it('overwrites existing keys', () => {
    const c = ctx();
    setSetting(c.db, 'appearance', 'dark');
    setSetting(c.db, 'appearance', 'light');
    expect(getSetting(c.db, 'appearance', '')).toBe('light');
    const rows = c.db.prepare('SELECT count(*) AS c FROM app_settings').get() as { c: number };
    expect(rows.c).toBe(1);
  });

  it('rejects invalid keys', () => {
    const c = ctx();
    const result = setSetting(c.db, '', 'x');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('VALIDATION');
    }
  });

  it('lists all settings', () => {
    const c = ctx();
    setSetting(c.db, 'a', 1);
    setSetting(c.db, 'b', 'two');
    const all = listSettings(c.db);
    expect(all).toEqual({ a: 1, b: 'two' });
  });

  it('recovers from stored invalid JSON', () => {
    const c = ctx();
    c.db
      .prepare('INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)')
      .run('broken', 'not-json', new Date().toISOString());
    expect(getSetting(c.db, 'broken', 'fallback')).toBe('fallback');
  });
});
