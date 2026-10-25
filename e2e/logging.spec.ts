/**
 * Verification "Logging": a logged workout shows up in the exercise's
 * history (⋯ → History) the next time the day is started and in the History
 * tab; switching to lb shows 60 kg as 132.3 lb in both.
 */
import { goTo, openApp } from './support/app.ts';
import { expect, test } from './support/fixtures.ts';
import { copySchedule, openPlan, startDay } from './support/plans.ts';
import {
  changeAmounts,
  closeHistory,
  openHistory,
  setCircle,
  tickSet,
  typeWeight,
  waitForPictures,
} from './support/workout.ts';

test(
  "a logged workout shows in the exercise's history and in the History tab, in kg and lb",
  { tag: '@smoke' },
  async ({ page }) => {
    test.setTimeout(120_000);
    await openApp(page);
    await copySchedule(page, 'beginner-full-body');
    await startDay(page, 0);

    // Goblet squat: two sets of 60 kg × 8.
    const first = page.getByTestId('workout-exercise').first();
    await expect(first.getByTestId('workout-exercise-name')).toHaveText('Goblet Squat');
    let history = await openHistory(first);
    await expect(history.getByTestId('no-past-workouts')).toHaveText('No history yet');
    await expect(history.getByTestId('past-workout')).toHaveCount(0);
    await closeHistory(history);
    // 10-12 reps and no history: the circles show the low end.
    await expect(setCircle(first, 0).getByTestId('set-amount')).toHaveText('10');
    // The weight of the first set carries to the sets after it.
    await typeWeight(first, 0, '60');
    await changeAmounts(first, { 0: '8', 1: '8' });
    for (const index of [0, 1]) await tickSet(first, index);
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

    // Next time: the exercise's history shows what was logged, and when.
    await openPlan(page, 'Beginner Full Body');
    await startDay(page, 0);
    const again = page.getByTestId('workout-exercise').first();
    history = await openHistory(again);
    await expect(history.getByTestId('past-workout')).toHaveCount(1);
    await expect(history.getByTestId('past-workout-date')).toHaveText(
      /^[A-Z][a-z]{2}, [A-Z][a-z]{2} \d{1,2}, \d{4}$/,
    );
    await expect(history.getByTestId('past-workout-sets')).toHaveText('60 kg × 8, 60 kg × 8');
    await closeHistory(history);
    await typeWeight(again, 0, '60');

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
    await expect(resumed.getByTestId('set-weight')).toHaveValue('132.3');
    await expect(resumed.getByTestId('set-weight-caption').first()).toHaveText('132.3 lb');
    history = await openHistory(resumed);
    await expect(history.getByTestId('past-workout-sets')).toHaveText('132.3 lb × 8, 132.3 lb × 8');
  },
);
