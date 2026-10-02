import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';

const ROOT = process.cwd();
const DESKTOP_DIR = path.join(ROOT, 'apps', 'desktop');
const EVIDENCE_DIR = path.join(ROOT, 'evidence', 'S0');
const requireFromRoot = createRequire(path.join(ROOT, 'package.json'));
const electronPath = requireFromRoot('electron') as unknown as string;

async function assertStartupChecks(page: import('playwright').Page): Promise<void> {
  await expect(page.locator('h1')).toHaveText('ContextBridge');
  await expect(page.locator('[data-check="ipc"][data-status="ok"]')).toBeVisible();
  await expect(page.locator('[data-check="sqlite"][data-status="ok"]')).toBeVisible();
  await expect(page.locator('[data-check="fts5"][data-status="ok"]')).toBeVisible();
  await expect(page.locator('[data-check="security"][data-status="ok"]')).toBeVisible();
  await expect(page.getByTestId('overall-status')).toContainText('All startup checks passed');
}

test.describe('S0 Electron launch proof', () => {
  test('development mode: loads from Vite dev server with all checks passing', async () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const env = { ...process.env, CONTEXTBRIDGE_DEV_SERVER: 'http://localhost:5173' };
    const app = await electron.launch({
      executablePath: electronPath,
      args: [DESKTOP_DIR],
      env,
    });
    try {
      const page = await app.firstWindow();
      await assertStartupChecks(page);
      await page.screenshot({ path: path.join(EVIDENCE_DIR, 'dev-launch.png') });
    } finally {
      await app.close();
    }
  });

  test('production content loading: loads file:// renderer with all checks passing', async () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const env: Record<string, string> = { ...process.env } as Record<string, string>;
    delete env.CONTEXTBRIDGE_DEV_SERVER;
    const app = await electron.launch({
      executablePath: electronPath,
      args: [DESKTOP_DIR],
      env,
    });
    try {
      const page = await app.firstWindow();
      await assertStartupChecks(page);
      await page.screenshot({ path: path.join(EVIDENCE_DIR, 'prod-launch.png') });
    } finally {
      await app.close();
    }
  });

  test('packaged Windows app: window launches from win-unpacked with all checks passing', async () => {
    const packagedExe = path.join(
      DESKTOP_DIR,
      'release',
      'win-unpacked',
      'ContextBridge.exe',
    );
    test.skip(!existsSync(packagedExe), 'packaged build not present (run npm run package:dir)');
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const env: Record<string, string> = { ...process.env } as Record<string, string>;
    delete env.CONTEXTBRIDGE_DEV_SERVER;
    const app = await electron.launch({
      executablePath: packagedExe,
      args: [],
      env,
    });
    try {
      const page = await app.firstWindow();
      await assertStartupChecks(page);
      await page.screenshot({ path: path.join(EVIDENCE_DIR, 'packaged-launch.png') });
    } finally {
      await app.close();
    }
  });
});
