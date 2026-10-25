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
import {
  amountFields,
  changeAmounts,
  expectOffScreen,
  expectOnPage,
  expectSet,
  pickOption,
  scrollWorkout,
  tickSet,
  typeWeight,
  workoutPage,
} from './support/workout.ts';

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
    await tickSet(workoutPage(page, 0), 0);
    await expect(rest).toHaveAttribute('data-seconds', '90');
    await expect(rest.getByTestId('rest-time')).toHaveText(/^1:(30|2\d)$/);

    await scrollWorkout(page, 1 / 3);
    await expectOnPage(page, 1);
    await expect(rest).toBeInViewport({ ratio: 1 });
    await rest.getByTestId('rest-skip').click();
    await expect(rest).toHaveCount(0);
  },
);

test('a field focused while resting is kept above the countdown when the keyboard opens', async ({
  page,
}) => {
  await openApp(page);
  await copySchedule(page, 'beginner-full-body');
  await startDay(page, 0);
  const rest = page.getByTestId('rest-timer');
  await tickSet(workoutPage(page, 0), 0);
  await expect(rest).toBeVisible();

  // The keyboard takes the bottom of the screen, which would put the weight
  // field under the countdown: the page scrolls it above, and stays.
  const field = workoutPage(page, 0).getByTestId('set-weight');
  await field.tap();
  await page.setViewportSize({ width: 412, height: 400 });
  const pages = page.getByTestId('workout-pages');
  await expect.poll(() => pages.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  const fieldBox = (await field.boundingBox())!;
  expect(fieldBox.y + fieldBox.height).toBeLessThanOrEqual((await rest.boundingBox())!.y);
  await expect(field).toBeFocused();
  await expectOnPage(page, 0);
});

test('a workout starts with what was done last time', async ({ page }) => {
  await openApp(page);
  await createPlanWith(page, 'Push', [BENCH, FLYES]);
  await page.getByTestId('edit-exercise').nth(1).getByTestId('target-weight').fill('14');
  await page.getByTestId('editor-done').click();

  // First time: Bench 60 kg × 8, then 62.5 kg × 6.
  await startDay(page, 0);
  const bench = workoutPage(page, 0);
  // Nothing entered: no weight, and the planned reps.
  await expectSet(bench, 0, '—', '10');
  for (const [index, [weight, reps]] of [
    ['60', '8'],
    ['62.5', '6'],
  ].entries()) {
    await typeWeight(bench, index, weight!);
    await changeAmounts(bench, { [index]: reps! });
    await tickSet(bench, index);
  }
  await page.getByTestId('workout-finish').click();
  await expect(page.getByTestId('history-sets')).toHaveText('2 of 6');

  // Next time: the sets are filled in, the third from last time's final set.
  await openPlan(page, 'Push');
  await startDay(page, 0);
  await expect(bench.getByTestId('set-circle')).toHaveCount(3);
  await expectSet(bench, 0, '60 kg', '8');
  await expectSet(bench, 1, '62.5 kg', '6');
  await expectSet(bench, 2, '62.5 kg', '6');
  await expect(workoutPage(page, 0).getByTestId('last-time')).toContainText(
    '60 kg × 8, 62.5 kg × 6',
  );
  // Never done before: the plan's weight and no reps entered (the planned ones show).
  const flyes = workoutPage(page, 1);
  await expectSet(flyes, 0, '14 kg', '10');
  await expect(flyes.getByTestId('last-time')).toHaveCount(0);
  await pickOption(flyes, 'change-amounts');
  await expect(amountFields(page)).toHaveCount(3);
  await expect(amountFields(page).first()).toHaveValue('');
  await expect(amountFields(page).first()).toHaveAttribute('placeholder', '10');
  await page.getByTestId('amounts-done').click();

  // Filled in is not entered: back discards without asking.
  await page.getByTestId('back-button').click();
  await expect(page.getByTestId('plan-day').first()).toBeVisible();
  await expect(page.getByTestId('confirm-dialog')).not.toBeVisible();

  // Add set copies last time's final set; ticked sets log what was filled in.
  await startDay(page, 0);
  await pickOption(bench, 'set-add');
  await expect(bench.getByTestId('set-circle')).toHaveCount(4);
  await expectSet(bench, 3, '62.5 kg', '6');
  await tickSet(bench, 0);
  await tickSet(bench, 3);
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
    await typeWeight(workoutPage(page, 0), 0, weight!);
    await changeAmounts(workoutPage(page, 0), { 0: reps! });
    await tickSet(workoutPage(page, 0), 0);
    await page.getByTestId('workout-finish').click();
    await expect(page.getByTestId('history-sets')).toHaveText('1 of 3');
    await openPlan(page, 'Push');
  }
  await startDay(page, 0);
  const bench = workoutPage(page, 0);
  await expectSet(bench, 0, '60 kg', '8');

  // The session it was filled in from is deleted: "Last time" is now the one before.
  await goTo(page, '#/history');
  await page.getByTestId('history-row').first().click();
  await page.getByTestId('history-delete').click();
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('history-row')).toHaveCount(1);
  await page.getByTestId('tab-plans').click();
  await page.getByTestId('resume-workout').click();
  await expect(workoutPage(page, 0).getByTestId('last-time')).toContainText('50 kg × 10');
  for (const index of [0, 1, 2]) await expectSet(bench, index, '60 kg', '8');

  /** Types `weight` (carried to every set) and `reps` for every set. */
  async function fillRows(weight: string, reps: string): Promise<void> {
    await typeWeight(bench, 0, weight);
    await changeAmounts(bench, { 0: reps, 1: reps, 2: reps });
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
  await tickSet(workoutPage(page, 0), 0);
  await expect(rest).toHaveAttribute('data-seconds', '60');
  await expect(rest.getByTestId('rest-time')).toHaveText(/^(1:00|0:5\d)$/);
  await scrollWorkout(page, 1 / 3);
  await expectOnPage(page, 1);
  await expect(rest).toBeInViewport({ ratio: 1 });

  // Flyes has no rest: the default, 90 s. Un-ticking that set stops it.
  const flyes = workoutPage(page, 1);
  await tickSet(flyes, 0);
  await expect(rest).toHaveAttribute('data-seconds', '90');
  await expect(rest.getByTestId('rest-time')).toHaveText(/^1:(30|2\d)$/);
  await tickSet(flyes, 0, false);
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
  await tickSet(flyes, 1);
  await expect(rest).toHaveAttribute('data-seconds', '120');
  await expect(rest.getByTestId('rest-time')).toHaveText(/^(2:00|1:5\d)$/);

  // The workout's last set starts none, and ends the running one.
  await tickSet(flyes, 2);
  await expect(rest).toHaveCount(0);
});

test('at zero the countdown signals "start your next set" until dismissed', async ({ page }) => {
  await openApp(page);
  await createPlanWith(page, 'Short rest', [BENCH]);
  await page.getByTestId('edit-exercise').first().getByTestId('target-rest').fill('2');
  await page.getByTestId('editor-done').click();
  await startDay(page, 0);
  const bench = workoutPage(page, 0);
  const rest = page.getByTestId('rest-timer');

  await tickSet(bench, 0);
  await expect(rest).toHaveAttribute('data-state', 'running');
  await expect(rest).toHaveAttribute('data-state', 'over');
  await expect(rest.getByTestId('rest-over')).toHaveText('Start your next set');
  expect((await animationNames(rest)).some((name) => name.includes('pulse'))).toBe(true);
  await rest.getByTestId('rest-dismiss').click();
  await expect(rest).toHaveCount(0);

  // With reduced motion, the same signal without the pulse.
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await tickSet(bench, 1);
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
  /** The line of circles of A1 (`position` 0) or A2 (1). */
  const line = (position: number) =>
    workoutPage(page, 0).getByTestId('superset-line').nth(position);
  for (const n of [1, 2]) {
    // A1: no rest within a round (and the rest after the last round is over).
    await tickSet(line(0), n - 1);
    await expect(rest).toHaveCount(0);
    await expect(celebration).toHaveCount(0);
    // A2 ends the round: the superset's rest.
    await tickSet(line(1), n - 1);
    await expect(rest).toHaveAttribute('data-seconds', '45');
  }
  // Round 2's A2 finished the superset: one celebration.
  await expect(celebration).toHaveCount(1);
  await expect(celebration).toContainText('Superset A done');
  expect((await animationNames(celebration)).some((name) => name.includes('fly'))).toBe(true);
  await expect(celebration).toHaveCount(0);

  // The superset's page (two lines of circles, and room under the countdown)
  // is taller than the screen: it scrolls to its end before moving on.
  await scrollWorkout(page, 0.25);
  await expect(page.getByTestId('workout')).toHaveAttribute('data-page', '0');
  await expectOffScreen(page, 1);

  // The last exercise: its last set celebrates, with reduced motion without confetti.
  await scrollWorkout(page, 1 / 3);
  await expectOnPage(page, 1);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const pushdown = workoutPage(page, 1);
  for (const index of [0, 1]) await tickSet(pushdown, index);
  await expect(celebration).toHaveCount(0);
  await tickSet(pushdown, 2);
  await expect(celebration).toContainText('Triceps Pushdown done');
  expect((await animationNames(celebration)).some((name) => name.includes('fly'))).toBe(false);
  await expect(celebration).toHaveCount(0);
  await expect(rest).toHaveCount(0);
});
