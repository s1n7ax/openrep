/**
 * Verification "Logging": a logged workout shows up as "last time" the next
 * time the day is started and in the history; switching to lb shows 60 kg as
 * 132.3 lb in both.
 */
import { goTo, openApp } from './support/app.ts';
import { expect, test } from './support/fixtures.ts';
import { copySchedule, openPlan, startDay } from './support/plans.ts';
import { waitForPictures } from './support/workout.ts';

test(
  'a logged workout shows as last time and in history, in kg and lb',
  { tag: '@smoke' },
  async ({ page }) => {
    test.setTimeout(120_000);
    await openApp(page);
    await copySchedule(page, 'beginner-full-body');
    await startDay(page, 0);

    // Goblet squat: two sets of 60 kg × 8.
    const first = page.getByTestId('workout-exercise').first();
    await expect(first.getByTestId('workout-exercise-name')).toHaveText('Goblet Squat');
    await expect(first.getByTestId('last-time')).toHaveCount(0);
    const sets = first.getByTestId('set-row');
    for (const index of [0, 1]) {
      await sets.nth(index).getByTestId('set-weight').fill('60');
      await sets.nth(index).getByTestId('set-reps').fill('8');
      await sets.nth(index).getByTestId('set-done').check();
    }
    await expect(page.getByTestId('workout-progress')).toHaveAttribute('data-done', '2');
    await page.getByTestId('workout-finish').click();

    // The finished workout opens in history.
    await expect(page.getByTestId('history-sets')).toContainText('2 of');
    await expect(page.getByTestId('history-set').first()).toContainText('60 kg × 8');

    await page.getByTestId('tab-history').click();
    const rows = page.getByTestId('history-row');
    await expect(rows).toHaveCount(1);
    await expect(rows).toContainText('Day A');
    await expect(rows).toContainText('Beginner Full Body');
    await expect(rows).toContainText('2 sets');

    // Next time: "Last time" shows what was logged.
    await openPlan(page, 'Beginner Full Body');
    await startDay(page, 0);
    const again = page.getByTestId('workout-exercise').first();
    await expect(again.getByTestId('last-time')).toContainText('Last time');
    await expect(again.getByTestId('last-time')).toContainText('60 kg × 8, 60 kg × 8');
    await again.getByTestId('set-row').first().getByTestId('set-weight').fill('60');

    // Switch to lb (the workout is full screen, without the tab bar).
    await goTo(page, '#/settings');
    await page.getByTestId('unit-lb').click();
    await expect(page.getByTestId('unit-lb')).toHaveAttribute('aria-pressed', 'true');

    await page.getByTestId('tab-history').click();
    await page.getByTestId('history-row').click();
    await expect(page.getByTestId('history-set').first()).toContainText('132.3 lb × 8');

    await page.getByTestId('tab-plans').click();
    await page.getByTestId('resume-workout').click();
    await waitForPictures(page);
    const resumed = page.getByTestId('workout-exercise').first();
    await expect(resumed.getByTestId('last-time')).toContainText('132.3 lb × 8, 132.3 lb × 8');
    await expect(resumed.getByTestId('set-row').first().getByTestId('set-weight')).toHaveValue(
      '132.3',
    );
  },
);
