import { expect, test } from '@playwright/test';
import { _electron as electron } from 'playwright';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { DESKTOP_DIR, assertStartupChecks, electronPath, freshEnv } from './helpers';

const EVIDENCE_DIR = path.join(process.cwd(), 'evidence', 'S4');

test.describe('S4 usability', () => {
  test('first handoff in 6 interactions under 60 seconds, active handoff surfaced', async () => {
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

      const started = Date.now();
      let interactions = 0;

      await page.getByTestId('project-name').fill('Usability Project');
      interactions += 1;
      await page.getByTestId('create-project').click();
      interactions += 1;
      await expect(page.getByTestId('project-name')).toHaveText('Usability Project');

      await page.getByTestId('new-capsule').click();
      interactions += 1;
      await expect(page.getByTestId('capsule-title')).toBeVisible();
      await page.getByTestId('capsule-title').fill('First Handoff Capsule');
      interactions += 1;
      await page.getByTestId('field-goal').fill('Ship the first handoff');
      interactions += 1;

      await page.getByTestId('copy-handoff').click();
      interactions += 1;
      await expect(page.getByTestId('toast')).toContainText(
        'Handoff markdown copied to clipboard',
        { timeout: 15_000 },
      );
      const elapsedMs = Date.now() - started;

      expect(interactions).toBeLessThanOrEqual(6);
      expect(elapsedMs).toBeLessThan(60_000);

      await page.getByTestId('save-capsule').click();
      await expect(page.getByTestId('toast')).toContainText('Capsule saved');

      await page.getByTestId('set-active').click();
      await expect(page.getByTestId('toast')).toContainText('Marked as active handoff');

      await page.getByTestId('new-capsule').click();
      await expect(page.getByTestId('active-handoff-chip')).toBeVisible();
      await page.screenshot({
        path: path.join(EVIDENCE_DIR, 'active-chip.png'),
      });

      await page.getByTestId('active-handoff-chip').click();
      await expect(page.getByTestId('capsule-title')).toHaveValue('First Handoff Capsule');
      await expect(page.getByTestId('set-active')).toBeHidden();
    } finally {
      await app.close();
    }
  });
});
