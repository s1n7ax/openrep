/**
 * Verification "Timed-set countdown" (issue #27): tapping a set held for
 * seconds counts them down at the bottom of the workout screen instead of
 * ticking it; at zero it ticks itself off with its seconds and the rest
 * countdown starts; Done ticks it at once with the seconds held; Cancel, or
 * tapping its circle again, stops it and leaves the set not done.
 */
import type { Page } from '@playwright/test';
import { openApp, readStoredUserData } from './support/app.ts';
import { expect, test } from './support/fixtures.ts';
import { addExercise, createPlan, startDay } from './support/plans.ts';
import { setCircle, tickSet, workoutPage } from './support/workout.ts';

test.use({ hasTouch: true });
// The page starts a 3D view, which takes seconds with software WebGL.
test.describe.configure({ timeout: 120_000 });

const PLANK = { id: 'plank', query: 'plank' };

/** Starts a workout of plan `name` with Plank alone: 3 sets held for 30 s. */
async function startPlank(page: Page, name: string): Promise<void> {
  await page.clock.install();
  await openApp(page);
  await createPlan(page, name);
  await addExercise(page, 0, PLANK.query, PLANK.id);
  await page.getByTestId('editor-done').click();
  await startDay(page, 0);
}

/** The seconds logged for each set of the workout's first exercise. */
async function loggedSeconds(page: Page): Promise<(number | null)[]> {
  const stored = await readStoredUserData(page);
  return stored?.sessions[0]?.exercises[0]?.sets.map((set) => set.durationSec) ?? [];
}

test(
  'a timed set counts down when tapped and ticks itself off at zero, then rest starts',
  { tag: '@smoke' },
  async ({ page }) => {
    await startPlank(page, 'Plank countdown');
    const plank = workoutPage(page, 0);
    const timer = page.getByTestId('set-timer');
    const circle = setCircle(plank, 0);

    await circle.click();
    await expect(timer).toHaveAttribute('data-seconds', '30');
    await expect(timer.getByTestId('set-timer-time')).toHaveText(/^0:(30|29)$/);
    await expect(circle).toHaveAttribute('data-state', 'running');
    await expect(circle).toHaveAttribute('aria-pressed', 'false');
    await expect(page.getByTestId('workout-progress')).toHaveAttribute('data-done', '0');

    await page.clock.fastForward(10_000);
    await expect(timer.getByTestId('set-timer-time')).toHaveText(/^0:(20|19)$/);

    await page.clock.fastForward(20_000);
    await expect(circle).toHaveAttribute('aria-pressed', 'true');
    await expect(timer).toHaveCount(0);
    await expect(page.getByTestId('rest-timer')).toHaveAttribute('data-seconds', '90');
    expect(await loggedSeconds(page)).toEqual([30, null, null]);
  },
);

test('Done ticks the set at once with the seconds held; Cancel leaves it not done', async ({
  page,
}) => {
  await startPlank(page, 'Plank done early');
  const plank = workoutPage(page, 0);
  const timer = page.getByTestId('set-timer');

  // Starting a countdown ends the rest.
  await setCircle(plank, 0).click();
  await page.clock.fastForward(30_000);
  await expect(page.getByTestId('rest-timer')).toBeVisible();
  await setCircle(plank, 1).click();
  await expect(page.getByTestId('rest-timer')).toHaveCount(0);
  await expect(timer).toBeVisible();

  await page.clock.fastForward(12_500);
  await timer.getByTestId('set-timer-done').click();
  await expect(setCircle(plank, 1)).toHaveAttribute('aria-pressed', 'true');
  await expect(timer).toHaveCount(0);
  expect(await loggedSeconds(page)).toEqual([30, 12, null]);

  // Cancel stops it; so does tapping the running circle again.
  const last = setCircle(plank, 2);
  await last.click();
  await timer.getByTestId('set-timer-cancel').click();
  await expect(timer).toHaveCount(0);
  await expect(last).toHaveAttribute('aria-pressed', 'false');
  await last.click();
  await expect(last).toHaveAttribute('data-state', 'running');
  await last.click();
  await expect(timer).toHaveCount(0);
  await expect(last).toHaveAttribute('aria-pressed', 'false');

  // A countdown stopped early never ticks the set.
  await page.clock.fastForward(60_000);
  await expect(last).toHaveAttribute('aria-pressed', 'false');

  // A done timed set still un-ticks on tap.
  await tickSet(plank, 1, false);
  expect(await loggedSeconds(page)).toEqual([30, 12, null]);
});
