/**
 * Verification "Auto-tick and auto-advance": tapping a circle ticks the sets
 * before it too, un-ticking one un-ticks the sets after it; finishing an
 * exercise celebrates it and then moves on to the next exercise with sets
 * left, or the finish page, unless a swipe (even one still settling when the
 * celebration ends) or an un-tick came meanwhile; the rest countdown stays
 * on through the move; the 3D view fills the room the page leaves and keeps
 * its size while the countdown shows.
 */
import type { Locator, Page } from '@playwright/test';
import { openApp } from './support/app.ts';
import { expect, test } from './support/fixtures.ts';
import { addExercise, createPlan, startDay } from './support/plans.ts';
import {
  expectOnPage,
  pauseAnimations,
  scrollWorkout,
  setCircle,
  workoutPage,
} from './support/workout.ts';

test.use({ hasTouch: true });
// Every page change starts 3D views, which takes seconds with software WebGL.
test.describe.configure({ timeout: 120_000 });

const EXERCISES = [
  { id: 'barbell-bench-press-medium-grip', query: 'barbell bench press medium grip' },
  { id: 'dumbbell-flyes', query: 'dumbbell flyes' },
  { id: 'triceps-pushdown', query: 'triceps pushdown' },
];

/** Expects the circles of `scope` to be ticked off as `expected` says: "✓✓·". */
async function expectTicked(scope: Locator, expected: string): Promise<void> {
  const circles = scope.getByTestId('set-circle');
  await expect(circles).toHaveCount(expected.length);
  for (const [index, mark] of [...expected].entries()) {
    await expect(circles.nth(index)).toHaveAttribute('aria-pressed', String(mark === '✓'));
  }
}

/** The height of the picture on top of page `index`. */
async function pictureHeight(page: Page, index: number): Promise<number> {
  const box = await workoutPage(page, index).getByTestId('workout-picture').boundingBox();
  return box!.height;
}

/**
 * Ends the celebration as soon as the next finger on the screen is lifted,
 * after the pages took the lift: the swipe has not settled yet.
 */
async function endCelebrationOnLift(page: Page): Promise<void> {
  await page.getByTestId('celebration').evaluate((celebration) => {
    const end = () => {
      for (const animation of celebration.getAnimations()) animation.finish();
    };
    window.addEventListener('touchend', end, { once: true });
  });
}

test('ticking a set ticks the ones before it, and a finished exercise moves on', async ({
  page,
}) => {
  await openApp(page);
  await createPlan(page, 'Auto advance');
  for (const exercise of EXERCISES) await addExercise(page, 0, exercise.query, exercise.id);
  await page.getByTestId('editor-done').click();
  await startDay(page, 0);
  await expectOnPage(page, 0);
  await expect(page.getByTestId('workout-position')).toHaveText('1 of 3');

  // The 3D view is taller than its least height (38% of the screen) and the
  // circles are on the screen without scrolling.
  const bench = workoutPage(page, 0);
  const height = await pictureHeight(page, 0);
  expect(height).toBeGreaterThan(0.38 * page.viewportSize()!.height + 50);
  await expect(bench.getByTestId('set-circles')).toBeInViewport({ ratio: 1 });

  // Circle 3 of the bench ticks all three: the bench is done, it celebrates
  // and the countdown starts.
  const progress = page.getByTestId('workout-progress');
  const rest = page.getByTestId('rest-timer');
  const celebration = page.getByTestId('celebration');
  await setCircle(bench, 2).click();
  await expectTicked(bench, '✓✓✓');
  await expect(progress).toHaveText('3/9 sets');
  await expect(rest).toBeVisible();
  // The countdown leaves the 3D view as it was, below the circles.
  expect(await pictureHeight(page, 0)).toBe(height);
  const circles = (await bench.getByTestId('set-circles').boundingBox())!;
  expect(circles.y + circles.height).toBeLessThanOrEqual((await rest.boundingBox())!.y);
  // When the celebration is over, the flyes, the countdown still on. (The
  // move starts the pushdown's 3D view, which can hold up the page for
  // longer than `expect` waits: `expectOnPage` waits for it.)
  await expect(celebration).toContainText('done');
  await expectOnPage(page, 1);
  await expect(celebration).toHaveCount(0);
  await expect(page.getByTestId('workout-position')).toHaveText('2 of 3');
  await expect(rest).toBeInViewport({ ratio: 1 });

  // Un-ticking set 2 of the finished flyes during the celebration un-ticks
  // set 3 too, and the screen stays.
  const flyes = workoutPage(page, 1);
  let resume = await pauseAnimations(page);
  await setCircle(flyes, 2).click();
  await expectTicked(flyes, '✓✓✓');
  await expect(celebration).toBeVisible();
  await setCircle(flyes, 1).click();
  await expectTicked(flyes, '✓··');
  await expect(progress).toHaveText('4/9 sets');
  await resume();
  await expect(celebration).toHaveCount(0);
  await expect(page.getByTestId('workout')).toHaveAttribute('data-page', '1');

  // Swiping to another page during the celebration keeps the screen there,
  // even when the celebration ends as the swipe is let go, before it settles.
  resume = await pauseAnimations(page);
  await setCircle(flyes, 2).click();
  await expectTicked(flyes, '✓✓✓');
  await expect(celebration).toBeVisible();
  await endCelebrationOnLift(page);
  await scrollWorkout(page, -1 / 3);
  await expect(celebration).toHaveCount(0);
  await expectOnPage(page, 0);
  await resume();

  // The pushdown is the last exercise: finishing it moves on to the finish page.
  await scrollWorkout(page, 1 / 3);
  await expectOnPage(page, 1);
  await scrollWorkout(page, 1 / 3);
  await expectOnPage(page, 2);
  await setCircle(workoutPage(page, 2), 2).click();
  await expectTicked(workoutPage(page, 2), '✓✓✓');
  await expect(celebration).toHaveCount(0);
  await expectOnPage(page, 3);
  await expect(page.getByTestId('workout-final-sets')).toHaveText('9 of 9 sets done');
  await page.getByTestId('workout-finish').click();
  await expect(page.getByTestId('history-sets')).toHaveText('9 of 9');
});
