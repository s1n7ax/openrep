/**
 * Verification "Submit": Submit on a plan or a custom exercise copies the
 * data file to the clipboard and opens GitHub's new-file page pre-filled with
 * it; a plan too large for the URL leaves the content out and asks to paste.
 *
 * That GitHub then pre-fills the editor needs a signed-in GitHub session and
 * is not checked here.
 */
import type { Page } from '@playwright/test';
import { exerciseSchema } from '../src/lib/schema/exercise.ts';
import { scheduleSchema } from '../src/lib/schema/schedule.ts';
import { openApp } from './support/app.ts';
import { expect, test } from './support/fixtures.ts';
import { copySchedule } from './support/plans.ts';
import { openedUrl, recordOpenedWindows } from './support/external.ts';

const NEW_FILE_PAGE = 'https://github.com/s1n7ax/openrep/new/main';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test.beforeEach(async ({ page }) => {
  await recordOpenedWindows(page);
});

async function clipboardText(page: Page): Promise<string> {
  return page.evaluate(() => navigator.clipboard.readText());
}

function expectNewFilePage(url: URL, directory: 'schedules' | 'exercises'): string {
  expect(`${url.origin}${url.pathname}`).toBe(NEW_FILE_PAGE);
  const filename = url.searchParams.get('filename') ?? '';
  expect(filename).toMatch(new RegExp(`^data/${directory}/[a-z0-9]+(-[a-z0-9]+)*\\.json$`));
  expect(url.searchParams.get('message')).toBeTruthy();
  return filename;
}

test('Submit on a plan opens GitHub with the schedule file filled in', async ({ page }) => {
  await openApp(page);
  await copySchedule(page, 'beginner-full-body');
  await page.getByTestId('plan-submit').click();
  await expect(page.getByTestId('submit-dialog')).toBeVisible();

  const url = await openedUrl(page);
  const filename = expectNewFilePage(url, 'schedules');
  const value = url.searchParams.get('value');
  expect(value).not.toBeNull();
  expect(url.href.length).toBeLessThanOrEqual(6000);
  const schedule = scheduleSchema.parse(JSON.parse(value!));
  expect(filename).toBe(`data/schedules/${schedule.id}.json`);
  expect(schedule.days.map((day) => day.name)).toEqual(['Day A', 'Day B']);
  expect(await clipboardText(page)).toBe(value);
  await expect(page.getByTestId('submit-paste-hint')).toHaveCount(0);
});

test('Submit on a custom exercise opens GitHub with the exercise file filled in', async ({
  page,
}) => {
  await openApp(page, '#/exercises');
  await page.getByTestId('new-custom-exercise').click();
  await page.getByTestId('custom-name').fill('Landmine Press');
  await page.getByTestId('custom-primary-shoulders').click();
  await page.getByTestId('custom-secondary-triceps').click();
  await page.getByTestId('custom-step-input').first().fill('Hold the end of the bar at the chest.');
  await page.getByTestId('custom-add-step').click();
  await page.getByTestId('custom-step-input').nth(1).fill('Press it up and forward.');
  await page.getByTestId('custom-save').click();

  await page.getByTestId('custom-submit').click();
  await expect(page.getByTestId('submit-dialog')).toBeVisible();

  const url = await openedUrl(page);
  const filename = expectNewFilePage(url, 'exercises');
  const value = url.searchParams.get('value');
  expect(value).not.toBeNull();
  const exercise = exerciseSchema.parse(JSON.parse(value!));
  expect(filename).toBe(`data/exercises/${exercise.id}.json`);
  expect(exercise).toMatchObject({
    name: 'Landmine Press',
    primaryMuscles: ['shoulders'],
    secondaryMuscles: ['triceps'],
    instructions: ['Hold the end of the bar at the chest.', 'Press it up and forward.'],
    source: { name: 'community' },
  });
  expect(await clipboardText(page)).toBe(value);
});

test('a plan too large for the URL is left out of it and copied to paste', async ({ page }) => {
  await openApp(page);
  await copySchedule(page, 'upper-lower');
  await page.getByTestId('plan-submit').click();
  await expect(page.getByTestId('submit-paste-hint')).toContainText('Paste the copied content');

  const url = await openedUrl(page);
  const filename = expectNewFilePage(url, 'schedules');
  expect(url.searchParams.has('value')).toBe(false);
  const schedule = scheduleSchema.parse(JSON.parse(await clipboardText(page)));
  expect(filename).toBe(`data/schedules/${schedule.id}.json`);
  expect(schedule.days).toHaveLength(4);
});
