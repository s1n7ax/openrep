/**
 * Verifications "Backup round trip" and "Bad backup": an exported backup
 * restores everything exactly on a fresh install; invalid or corrupted files
 * are rejected and change nothing.
 */
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import type { Backup } from '../src/lib/schema/backup.ts';
import { clearStorage, openApp, readStoredUserData, waitForApp } from './support/app.ts';
import { expect, test } from './support/fixtures.ts';
import { seedUserData } from './support/seed.ts';

/** Exports a backup from Settings; returns the file name and its text. */
async function exportBackup(page: Page): Promise<{ name: string; text: string }> {
  await page.getByTestId('tab-settings').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('backup-export').click(),
  ]);
  const file = await download.path();
  await expect(page.getByTestId('backup-message')).toBeVisible();
  return { name: download.suggestedFilename(), text: await readFile(file, 'utf8') };
}

/** Chooses a file in Settings → Import backup. */
async function chooseBackupFile(page: Page, name: string, text: string): Promise<void> {
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('backup-file-input').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
}

test('export, then import on a fresh install, restores everything exactly', async ({ page }) => {
  await openApp(page);
  await seedUserData(page);
  const before = await readStoredUserData(page);
  expect(before?.plans).toHaveLength(1);
  expect(before?.customExercises).toHaveLength(1);
  expect(before?.sessions).toHaveLength(1);
  expect(before?.settings.unit).toBe('lb');

  const exported = await exportBackup(page);
  expect(exported.name).toMatch(/^openrep-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const backup = JSON.parse(exported.text) as Backup;
  expect(backup).toMatchObject({ app: 'openrep', kind: 'backup', formatVersion: 1 });
  expect(backup.data).toEqual(before);

  // A fresh install: nothing stored.
  await clearStorage(page);
  await page.reload();
  await waitForApp(page);
  await page.getByTestId('tab-plans').click();
  await expect(page.getByTestId('plans-empty')).toBeVisible();
  expect((await readStoredUserData(page))?.plans ?? []).toEqual([]);

  await chooseBackupFile(page, exported.name, exported.text);
  const confirm = page.getByTestId('confirm-dialog');
  await expect(confirm).toContainText('Replace all current data?');
  await expect(confirm).toContainText('1 plan');
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('backup-message')).toContainText('Backup restored');

  expect(await readStoredUserData(page)).toEqual(before);
  await expect(page.getByTestId('unit-lb')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('tab-plans').click();
  await expect(page.getByTestId('plan-link')).toContainText('Beginner Full Body');
  await page.getByTestId('tab-history').click();
  await expect(page.getByTestId('history-row')).toHaveCount(1);
  await page.getByTestId('tab-exercises').click();
  await expect(page.getByTestId('custom-row')).toContainText('Landmine Press');

  // And it is saved: still there after reopening.
  await page.reload();
  await waitForApp(page);
  expect(await readStoredUserData(page)).toEqual(before);
});

test('invalid and corrupted backups are rejected and change nothing', async ({ page }) => {
  await openApp(page);
  await seedUserData(page);
  const before = await readStoredUserData(page);
  const valid = await exportBackup(page);

  const badFiles = [
    { name: 'notes.json', text: 'These are my gym notes, not a backup.' },
    {
      name: 'wrong-schema.json',
      text: JSON.stringify({
        app: 'openrep',
        kind: 'backup',
        formatVersion: 1,
        exportedAt: new Date().toISOString(),
        data: { plans: 'not a list' },
      }),
    },
    { name: 'truncated.json', text: valid.text.slice(0, Math.floor(valid.text.length / 2)) },
  ];
  for (const file of badFiles) {
    await chooseBackupFile(page, file.name, file.text);
    await expect(page.getByTestId('backup-error'), file.name).toBeVisible();
    await expect(page.getByTestId('confirm-dialog')).toBeHidden();
    expect(await readStoredUserData(page), file.name).toEqual(before);
  }

  await page.getByTestId('tab-plans').click();
  await expect(page.getByTestId('plan-link')).toContainText('Beginner Full Body');
});
