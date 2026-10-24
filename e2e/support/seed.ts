/** Filling the app with some of everything through the UI. */
import type { Page } from '@playwright/test';
import { expect } from './fixtures.ts';
import { copySchedule, startDay } from './plans.ts';
import { changeAmounts, tickSet, typeWeight } from './workout.ts';

/**
 * A copied plan, a custom exercise, a finished workout, the unit set to lb
 * and a default rest of 120 s: something in every part of the user data.
 */
export async function seedUserData(page: Page): Promise<void> {
  await copySchedule(page, 'beginner-full-body');
  await startDay(page, 0);
  const exercise = page.getByTestId('workout-exercise').first();
  await typeWeight(exercise, 0, '60');
  await changeAmounts(exercise, { 0: '8' });
  await tickSet(exercise, 0);
  await page.getByTestId('workout-finish').click();
  await expect(page.getByTestId('history-set').first()).toContainText('60 kg × 8');

  await page.getByTestId('tab-exercises').click();
  await page.getByTestId('new-custom-exercise').click();
  await page.getByTestId('custom-name').fill('Landmine Press');
  await page.getByTestId('custom-notes').fill('Bar in the corner, one arm.');
  await page.getByTestId('custom-primary-shoulders').click();
  await page.getByTestId('custom-step-input').first().fill('Press the bar up and forward.');
  await page.getByTestId('custom-save').click();
  await expect(page.getByTestId('custom-title')).toHaveText('Landmine Press');

  await page.getByTestId('tab-settings').click();
  await page.getByTestId('unit-lb').click();
  await expect(page.getByTestId('unit-lb')).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('default-rest').fill('120');
}
