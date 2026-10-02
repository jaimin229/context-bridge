import { expect } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const requireFromRoot = createRequire(path.join(ROOT, 'package.json'));

export const DESKTOP_DIR = path.join(ROOT, 'apps', 'desktop');
export const electronPath = requireFromRoot('electron') as unknown as string;

/** Launch env with an isolated, freshly created data directory so every test
 *  starts from a brand new local database (onboarding screen, no projects). */
export function freshEnv(options: { devServer?: string } = {}): Record<string, string> {
  const env = { ...process.env } as Record<string, string>;
  if (options.devServer) {
    env.CONTEXTBRIDGE_DEV_SERVER = options.devServer;
  } else {
    delete env.CONTEXTBRIDGE_DEV_SERVER;
  }
  env.CONTEXTBRIDGE_DATA_DIR = mkdtempSync(path.join(tmpdir(), 'contextbridge-e2e-'));
  return env;
}

export async function assertStartupChecks(page: import('playwright').Page): Promise<void> {
  await expect(page.locator('h1')).toHaveText('ContextBridge');
  await expect(page.locator('[data-check="ipc"][data-status="ok"]')).toBeVisible();
  await expect(page.locator('[data-check="sqlite"][data-status="ok"]')).toBeVisible();
  await expect(page.locator('[data-check="fts5"][data-status="ok"]')).toBeVisible();
  await expect(page.locator('[data-check="security"][data-status="ok"]')).toBeVisible();
  await expect(page.getByTestId('overall-status')).toContainText('All startup checks passed');
}
