import { test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';
import { DESKTOP_DIR, assertStartupChecks, electronPath, freshEnv } from './helpers';

const EVIDENCE_DIR = path.join(process.cwd(), 'evidence', 'S0');

test.describe('S0 Electron launch proof', () => {
  test('development mode: loads from Vite dev server with all checks passing', async () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const env = freshEnv({ devServer: 'http://localhost:5173' });
    const app = await electron.launch({
      executablePath: electronPath,
      args: [DESKTOP_DIR],
      env,
    });
    try {
      const page = await app.firstWindow();
      await assertStartupChecks(page);
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, 'dev-launch.png'),
      });
    } finally {
      await app.close();
    }
  });

  test('production content loading: loads file:// renderer with all checks passing', async () => {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const env = freshEnv();
    const app = await electron.launch({
      executablePath: electronPath,
      args: [DESKTOP_DIR],
      env,
    });
    try {
      const page = await app.firstWindow();
      await assertStartupChecks(page);
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, 'prod-launch.png'),
      });
    } finally {
      await app.close();
    }
  });

  test('packaged Windows app: window launches from win-unpacked with all checks passing', async () => {
    const packagedExe = path.join(DESKTOP_DIR, 'release', 'win-unpacked', 'ContextBridge.exe');
    test.skip(!existsSync(packagedExe), 'packaged build not present (run npm run package:dir)');
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const env = freshEnv();
    const app = await electron.launch({
      executablePath: packagedExe,
      args: [],
      env,
    });
    try {
      const page = await app.firstWindow();
      await assertStartupChecks(page);
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, 'packaged-launch.png'),
      });
    } finally {
      await app.close();
    }
  });
});
