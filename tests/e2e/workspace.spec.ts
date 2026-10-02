import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { DESKTOP_DIR, assertStartupChecks, electronPath, freshEnv } from './helpers';

const EVIDENCE_DIR = path.join(process.cwd(), 'evidence', 'S3');

function git(args: string[], cwd: string): void {
  execFileSync('git', args, { cwd, windowsHide: true });
}

function makeTempRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'contextbridge-e2e-repo-'));
  git(['init', '-b', 'main'], dir);
  git(['config', 'user.email', 'e2e@contextbridge.local'], dir);
  git(['config', 'user.name', 'ContextBridge E2E'], dir);
  writeFileSync(path.join(dir, 'main.ts'), 'export const app = 1;\n');
  git(['add', '.'], dir);
  git(['commit', '-m', 'initial'], dir);
  return dir;
}

test.describe('S3 workspace and workflows', () => {
  test('project → capsule → live preview → save → search → export → settings → import → delete/undo', async () => {
    test.setTimeout(240_000);
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

      await page.getByTestId('project-name').fill('E2E Workspace Project');
      await page.getByTestId('project-description').fill('Created by the S3 end-to-end test');
      await page.getByTestId('create-project').click();
      await expect(page.getByTestId('project-name')).toHaveText('E2E Workspace Project');

      await page.getByTestId('new-capsule').click();
      await expect(page.getByTestId('capsule-title')).toBeVisible();
      await page.getByTestId('capsule-title').fill('Login Bug Handoff');
      await page.getByTestId('field-goal').fill('Investigate the login redirect bug');
      await expect(page.getByTestId('dirty-indicator')).toBeVisible();

      await expect(page.getByTestId('handoff-preview')).toContainText('login redirect bug', {
        timeout: 15_000,
      });
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, 'editor-live-preview.png'),
      });

      await page.getByTestId('save-capsule').click();
      await expect(page.getByTestId('toast')).toContainText('Capsule saved');
      await expect(page.getByTestId('dirty-indicator')).toBeHidden();

      await page.getByTestId('open-search').click();
      await page.getByTestId('search-input').fill('login redirect');
      await expect(page.getByTestId('search-hit').first()).toBeVisible({
        timeout: 10_000,
      });
      await page.getByTestId('search-hit').first().click();
      await expect(page.getByTestId('capsule-title')).toHaveValue('Login Bug Handoff');

      await page.getByTestId('copy-handoff').click();
      await expect(page.getByTestId('toast')).toContainText('Handoff markdown copied to clipboard');

      await page.getByTestId('export-markdown').click();
      await expect(page.getByTestId('dialog-text')).toContainText('# Project Handoff');
      await page.getByTestId('dialog-copy').click();
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, 'export-dialog.png'),
      });
      await page.getByLabel('Close dialog').click();

      await page.getByTestId('export-json').click();
      await expect(page.getByTestId('dialog-text')).toContainText('"schemaVersion": 1');
      await page.getByLabel('Close dialog').click();

      await page.getByTestId('open-settings').click();
      await expect(page.getByTestId('settings-budget')).toBeVisible();
      await expect(page.locator('[data-check="fts5"][data-status="ok"]')).toBeVisible();
      await page.getByTestId('close-settings').click();

      await page.getByTestId('open-import').click();
      await page.getByTestId('import-text').fill('# Imported Scratch\n\nImported notes body\n');
      await page.getByTestId('import-submit').click();
      await expect(page.getByTestId('toast')).toContainText('imported as plain notes');
      await expect(page.getByTestId('capsule-title')).toHaveValue('# Imported Scratch');
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, 'workspace-after-import.png'),
      });

      await expect(page.getByTestId('capsule-list-item')).toHaveCount(2);
      await page.getByTestId('delete-capsule').click();
      await expect(page.getByTestId('confirm-delete')).toBeVisible();
      await page.getByTestId('confirm-delete').click();
      await expect(page.getByTestId('toast-action')).toBeVisible();
      await expect(page.getByTestId('capsule-list-item')).toHaveCount(1);
      await page.getByTestId('toast-action').click();
      await expect(page.getByTestId('toast')).toContainText('Capsule restored');
      await expect(page.getByTestId('capsule-list-item')).toHaveCount(2);
    } finally {
      await app.close();
    }
  });

  test('git capture and drift detection on a real repository', async () => {
    test.setTimeout(240_000);
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    const repoDir = makeTempRepo();
    const env = freshEnv({ devServer: 'http://localhost:5173' });
    const app = await electron.launch({
      executablePath: electronPath,
      args: [DESKTOP_DIR],
      env,
    });
    try {
      const page = await app.firstWindow();

      await page.getByTestId('project-name').fill('Git Drift Project');
      await page.getByTestId('project-repo').fill(repoDir);
      await page.getByTestId('create-project').click();
      await expect(page.getByTestId('project-name')).toHaveText('Git Drift Project');

      await page.getByTestId('new-capsule').click();
      await expect(page.getByTestId('capsule-title')).toBeVisible();

      await page.getByTestId('capture-git').click();
      await expect(page.getByTestId('toast')).toContainText('Git state captured');
      await page.getByTestId('save-capsule').click();
      await expect(page.getByTestId('toast')).toContainText('Capsule saved');

      await expect(page.getByTestId('drift-banner')).toContainText('No drift', {
        timeout: 20_000,
      });

      writeFileSync(path.join(repoDir, 'main.ts'), 'export const app = 2;\n');
      git(['add', '.'], repoDir);
      git(['commit', '-m', 'advance'], repoDir);

      await page.getByTestId('check-drift').click();
      await expect(page.getByTestId('drift-banner')).toContainText('Drift detected', {
        timeout: 20_000,
      });
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, 'drift-banner.png'),
      });
    } finally {
      await app.close();
      rmSync(repoDir, { recursive: true, force: true });
    }
  });
});
