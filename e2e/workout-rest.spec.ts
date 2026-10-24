/**
 * Verification "Autofill, rest timer and celebration": a started workout is
 * filled with what was done last time; ticking a set starts a rest
 * countdown for the plan's rest (else the default rest from Settings) that
 * stays on every page, rests after a superset's round only, and ends with
 * "Start your next set"; finishing an exercise or a superset plays a
 * celebration once; the default rest survives reopening the app.
 */
import type { Locator, Page } from '@playwright/test';
import { goTo, openApp, readStoredUserData, reopen } from './support/app.ts';
import { expect, test } from './support/fixtures.ts';
import { addExercise, copySchedule, createPlan, openPlan, startDay } from './support/plans.ts';
import { expectOnPage, scrollWorkout, workoutPage } from './support/workout.ts';

test.use({ hasTouch: true });
// Every page change starts 3D views, which takes seconds with software WebGL.
test.describe.configure({ timeout: 120_000 });

const BENCH = { id: 'barbell-bench-press-medium-grip', query: 'barbell bench press medium grip' };
const FLYES = { id: 'dumbbell-flyes', query: 'dumbbell flyes' };
const PUSHDOWN = { id: 'triceps-pushdown', query: 'triceps pushdown' };

/** Creates plan `name` with the exercises `exercises` on its first day; ends in the editor. */
async function createPlanWith(
  page: Page,
  name: string,
  exercises: { id: string; query: string }[],
): Promise<void> {
  await createPlan(page, name);
  for (const exercise of exercises) await addExercise(page, 0, exercise.query, exercise.id);
}

/** Expects the weight and reps fields of `row` to hold `weight` and `reps` ('' for empty). */
async function expectValues(row: Locator, weight: string, reps: string): Promise<void> {
  await expect(row.getByTestId('set-weight')).toHaveValue(weight);
  await expect(row.getByTestId('set-reps')).toHaveValue(reps);
}

/** Names of the CSS animations (not transitions) running in `locator` and its descendants. */
function animationNames(locator: Locator): Promise<string[]> {
  return locator.evaluate((element) =>
    element
      .getAnimations({ subtree: true })
      .filter((animation) => animation instanceof CSSAnimation)
      .map((animation) => animation.animationName),
  );
}

test(
  'ticking a set starts a rest countdown shown on every page; Skip hides it',
  { tag: '@smoke' },
  async ({ page }) => {
    await openApp(page);
    await copySchedule(page, 'beginner-full-body');
    await startDay(page, 0);

    // Goblet Squat rests 90 s in the schedule.
    const rest = page.getByTestId('rest-timer');
    await expect(rest).toHaveCount(0);
    await workoutPage(page, 0).getByTestId('set-row').first().getByTestId('set-done').check();
    await expect(rest).toHaveAttribute('data-seconds', '90');
    await expect(rest.getByTestId('rest-time')).toHaveText(/^1:(30|2\d)$/);

    await scrollWorkout(page, 1 / 3);
    await expectOnPage(page, 1);
    await expect(rest).toBeInViewport({ ratio: 1 });
    await rest.getByTestId('rest-skip').click();
    await expect(rest).toHaveCount(0);
  },
);

test('a workout starts with what was done last time', async ({ page }) => {
  await openApp(page);
  await createPlanWith(page, 'Push', [BENCH, FLYES]);
  await page.getByTestId('edit-exercise').nth(1).getByTestId('target-weight').fill('14');
  await page.getByTestId('editor-done').click();

  // First time: Bench 60 kg × 8, then 62.5 kg × 6.
  await startDay(page, 0);
  let bench = workoutPage(page, 0).getByTestId('set-row');
  await expectValues(bench.nth(0), '', '');
  for (const [index, [weight, reps]] of [
    ['60', '8'],
    ['62.5', '6'],
  ].entries()) {
    await bench.nth(index).getByTestId('set-weight').fill(weight!);
    await bench.nth(index).getByTestId('set-reps').fill(reps!);
    await bench.nth(index).getByTestId('set-done').check();
  }
  await page.getByTestId('workout-finish').click();
  await expect(page.getByTestId('history-sets')).toHaveText('2 of 6');

  // Next time: the sets are filled in, the third from last time's final set.
  await openPlan(page, 'Push');
  await startDay(page, 0);
  bench = workoutPage(page, 0).getByTestId('set-row');
  await expect(bench).toHaveCount(3);
  await expectValues(bench.nth(0), '60', '8');
  await expectValues(bench.nth(1), '62.5', '6');
  await expectValues(bench.nth(2), '62.5', '6');
  await expect(workoutPage(page, 0).getByTestId('last-time')).toContainText(
    '60 kg × 8, 62.5 kg × 6',
  );
  // Never done before: the plan's weight and empty reps.
  const flyes = workoutPage(page, 1).getByTestId('set-row');
  await expectValues(flyes.nth(0), '14', '');
  await expect(workoutPage(page, 1).getByTestId('last-time')).toHaveCount(0);

  // Filled in is not entered: back discards without asking.
  await page.getByTestId('back-button').click();
  await expect(page.getByTestId('plan-day').first()).toBeVisible();
  await expect(page.getByTestId('confirm-dialog')).not.toBeVisible();

  // Add set copies last time's final set; ticked sets log what was filled in.
  await startDay(page, 0);
  await workoutPage(page, 0).getByTestId('set-add').click();
  await expect(bench).toHaveCount(4);
  await expectValues(bench.nth(3), '62.5', '6');
  await bench.nth(0).getByTestId('set-done').check();
  await bench.nth(3).getByTestId('set-done').check();
  await page.getByTestId('workout-finish').click();
  await expect(page.getByTestId('history-set').nth(0)).toContainText('60 kg × 8');
  await expect(page.getByTestId('history-set').nth(3)).toContainText('62.5 kg × 6');
});

test('back compares with what the workout was filled in with, even after that session is deleted', async ({
  page,
}) => {
  await openApp(page);
  await createPlanWith(page, 'Push', [BENCH]);
  await page.getByTestId('editor-done').click();
  // Bench 50 kg × 10, then 60 kg × 8.
  for (const [weight, reps] of [
    ['50', '10'],
    ['60', '8'],
  ]) {
    await startDay(page, 0);
    const row = workoutPage(page, 0).getByTestId('set-row').first();
    await row.getByTestId('set-weight').fill(weight!);
    await row.getByTestId('set-reps').fill(reps!);
    await row.getByTestId('set-done').check();
    await page.getByTestId('workout-finish').click();
    await expect(page.getByTestId('history-sets')).toHaveText('1 of 3');
    await openPlan(page, 'Push');
  }
  await startDay(page, 0);
  const rows = workoutPage(page, 0).getByTestId('set-row');
  await expectValues(rows.nth(0), '60', '8');

  // The session it was filled in from is deleted: "Last time" is now the one before.
  await goTo(page, '#/history');
  await page.getByTestId('history-row').first().click();
  await page.getByTestId('history-delete').click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('history-row')).toHaveCount(1);
  await page.getByTestId('tab-plans').click();
  await page.getByTestId('resume-workout').click();
  await expect(workoutPage(page, 0).getByTestId('last-time')).toContainText('50 kg × 10');
  for (const index of [0, 1, 2]) await expectValues(rows.nth(index), '60', '8');

  /** Types `weight` and `reps` into every row. */
  async function fillRows(weight: string, reps: string): Promise<void> {
    for (const index of [0, 1, 2]) {
      await rows.nth(index).getByTestId('set-weight').fill(weight);
      await rows.nth(index).getByTestId('set-reps').fill(reps);
    }
  }

  // The values of the session before were typed in: back asks.
  await fillRows('50', '10');
  await page.getByTestId('back-button').click();
  await expect(page.getByTestId('confirm-dialog')).toBeVisible();
  await page.getByTestId('confirm-cancel').click();

  // As filled in: back discards without asking.
  await fillRows('60', '8');
  await page.getByTestId('back-button').click();
  await expect(page.getByTestId('workout')).toHaveCount(0);
  await expect(page.getByTestId('confirm-dialog')).not.toBeVisible();
  await expect(page.getByTestId('resume-workout')).toHaveCount(0);
});

test("the countdown runs for the plan's rest, else the default rest from Settings", async ({
  page,
}) => {
  await openApp(page);
  await createPlanWith(page, 'Rests', [BENCH, FLYES]);
  await page.getByTestId('edit-exercise').first().getByTestId('target-rest').fill('60');
  await page.getByTestId('editor-done').click();
  await startDay(page, 0);

  // Bench rests 60 s; the countdown stays on the next page.
  const rest = page.getByTestId('rest-timer');
  await workoutPage(page, 0).getByTestId('set-row').first().getByTestId('set-done').check();
  await expect(rest).toHaveAttribute('data-seconds', '60');
  await expect(rest.getByTestId('rest-time')).toHaveText(/^(1:00|0:5\d)$/);
  await scrollWorkout(page, 1 / 3);
  await expectOnPage(page, 1);
  await expect(rest).toBeInViewport({ ratio: 1 });

  // Flyes has no rest: the default, 90 s. Un-ticking that set stops it.
  const flyes = workoutPage(page, 1).getByTestId('set-row');
  await flyes.nth(0).getByTestId('set-done').check();
  await expect(rest).toHaveAttribute('data-seconds', '90');
  await expect(rest.getByTestId('rest-time')).toHaveText(/^1:(30|2\d)$/);
  await flyes.nth(0).getByTestId('set-done').uncheck();
  await expect(rest).toHaveCount(0);

  // Default rest 120 s, still set after reopening the app; invalid entries are not saved.
  await goTo(page, '#/settings');
  const field = page.getByTestId('default-rest');
  await expect(field).toHaveValue('90');
  await field.fill('120');
  await reopen(page);
  await goTo(page, '#/settings');
  await expect(field).toHaveValue('120');
  await field.fill('5000');
  await expect(page.getByTestId('default-rest-error')).toBeVisible();
  expect((await readStoredUserData(page))?.settings.defaultRestSec).toBe(120);
  await field.fill('120');
  await expect(page.getByTestId('default-rest-error')).toHaveCount(0);

  await page.getByTestId('tab-plans').click();
  await page.getByTestId('resume-workout').click();
  await expectOnPage(page, 0);
  await scrollWorkout(page, 1 / 3);
  await expectOnPage(page, 1);
  await flyes.nth(1).getByTestId('set-done').check();
  await expect(rest).toHaveAttribute('data-seconds', '120');
  await expect(rest.getByTestId('rest-time')).toHaveText(/^(2:00|1:5\d)$/);

  // The workout's last set starts none, and ends the running one.
  await flyes.nth(2).getByTestId('set-done').check();
  await expect(rest).toHaveCount(0);
});

test('at zero the countdown signals "start your next set" until dismissed', async ({ page }) => {
  await openApp(page);
  await createPlanWith(page, 'Short rest', [BENCH]);
  await page.getByTestId('edit-exercise').first().getByTestId('target-rest').fill('2');
  await page.getByTestId('editor-done').click();
  await startDay(page, 0);
  const rows = workoutPage(page, 0).getByTestId('set-row');
  const rest = page.getByTestId('rest-timer');

  await rows.nth(0).getByTestId('set-done').check();
  await expect(rest).toHaveAttribute('data-state', 'running');
  await expect(rest).toHaveAttribute('data-state', 'over');
  await expect(rest.getByTestId('rest-over')).toHaveText('Start your next set');
  expect((await animationNames(rest)).some((name) => name.includes('pulse'))).toBe(true);
  await rest.getByTestId('rest-dismiss').click();
  await expect(rest).toHaveCount(0);

  // With reduced motion, the same signal without the pulse.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await rows.nth(1).getByTestId('set-done').check();
  await expect(rest).toHaveAttribute('data-state', 'over');
  await expect(rest.getByTestId('rest-over')).toBeVisible();
  expect(await animationNames(rest)).toEqual([]);
});

test('a superset rests after each round and celebrates once, when all its rounds are done', async ({
  page,
}) => {
  await openApp(page);
  await createPlanWith(page, 'Superset', [BENCH, FLYES, PUSHDOWN]);
  await page.getByTestId('edit-exercise').first().getByTestId('exercise-superset-next').click();
  const superset = page.getByTestId('edit-superset');
  await superset.getByTestId('superset-rounds-dec').click();
  await expect(superset.getByTestId('superset-rounds')).toHaveText('2');
  await superset.getByTestId('superset-rest').fill('45');
  await page.getByTestId('editor-done').click();
  await startDay(page, 0);

  const rest = page.getByTestId('rest-timer');
  const celebration = page.getByTestId('celebration');
  const round = (n: number) =>
    workoutPage(page, 0)
      .locator(`[data-testid="workout-round"][data-round="${n}"]`)
      .getByTestId('set-row');
  for (const n of [1, 2]) {
    // A1: no rest within a round (and the rest after the last round is over).
    await round(n).nth(0).getByTestId('set-done').check();
    await expect(rest).toHaveCount(0);
    await expect(celebration).toHaveCount(0);
    // A2 ends the round: the superset's rest.
    await round(n).nth(1).getByTestId('set-done').check();
    await expect(rest).toHaveAttribute('data-seconds', '45');
  }
  // Round 2's A2 finished the superset: one celebration.
  await expect(celebration).toHaveCount(1);
  await expect(celebration).toContainText('Superset A done');
  expect((await animationNames(celebration)).some((name) => name.includes('fly'))).toBe(true);
  await expect(celebration).toHaveCount(0);

  // The last exercise: its last set celebrates, with reduced motion without confetti.
  await scrollWorkout(page, 1 / 3);
  await expectOnPage(page, 1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const pushdown = workoutPage(page, 1).getByTestId('set-row');
  for (const index of [0, 1]) await pushdown.nth(index).getByTestId('set-done').check();
  await expect(celebration).toHaveCount(0);
  await pushdown.nth(2).getByTestId('set-done').check();
  await expect(celebration).toContainText('Triceps Pushdown done');
  expect((await animationNames(celebration)).some((name) => name.includes('fly'))).toBe(false);
  await expect(celebration).toHaveCount(0);
  await expect(rest).toHaveCount(0);
});
