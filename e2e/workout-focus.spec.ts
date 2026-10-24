/**
 * Verification "One exercise per screen": a started workout shows one
 * exercise per screen (3D view on top, its sets below) without the tab bar;
 * scrolling snaps from exercise to exercise and a page too tall for the
 * screen scrolls first; an exercise without an animation swipes to its
 * photos; a superset is one page whose picture swipes between its exercises;
 * the last page finishes the workout; back discards it; reopening lands on
 * the first exercise with sets left.
 */
import type { Page } from '@playwright/test';
import { openApp, readStoredUserData, reopen } from './support/app.ts';
import { expect, test } from './support/fixtures.ts';
import { addExercise, copySchedule, createPlan, startDay } from './support/plans.ts';
import {
  expectOffScreen,
  expectOnPage,
  scrollWorkout,
  swipePicture,
  workoutPage,
} from './support/workout.ts';

test.use({ hasTouch: true });
// Every page change starts 3D views, which takes seconds with software WebGL.
test.describe.configure({ timeout: 120_000 });

const GOBLET = { id: 'goblet-squat', name: 'Goblet Squat' };
const CURL = { id: 'dumbbell-bicep-curl', name: 'Dumbbell Bicep Curl' };
const PLANK = { id: 'plank', name: 'Plank' };

/**
 * Plan `name` with Goblet Squat (animated), Dumbbell Bicep Curl (no
 * animation, two photos) and Plank (animated, held for 30 s), 3 sets each;
 * ends on the plan page.
 */
async function createFocusPlan(page: Page, name: string): Promise<void> {
  await createPlan(page, name);
  await addExercise(page, 0, 'goblet squat', GOBLET.id);
  await addExercise(page, 0, 'dumbbell bicep curl', CURL.id);
  await addExercise(page, 0, 'plank', PLANK.id);
  await page.getByTestId('editor-done').click();
  await expect(page.getByTestId('plan-exercise')).toHaveCount(3);
}

/** Starts recording how far the workout's pages scroll; returns a reader of the farthest point. */
async function trackScroll(page: Page): Promise<() => Promise<number>> {
  const pages = page.getByTestId('workout-pages');
  await pages.evaluate((element) => {
    const start = element.scrollTop;
    const record = element as HTMLElement & { farthest?: number };
    record.farthest = 0;
    element.addEventListener('scroll', () => {
      record.farthest = Math.max(record.farthest ?? 0, Math.abs(element.scrollTop - start));
    });
  });
  return () =>
    pages.evaluate((element) => (element as HTMLElement & { farthest?: number }).farthest ?? 0);
}

test(
  'a workout shows one exercise per screen and snaps between them',
  { tag: '@smoke' },
  async ({ page }) => {
    await openApp(page);
    await copySchedule(page, 'beginner-full-body');
    await startDay(page, 0);

    // Only the first exercise: its 3D view on top, its sets below; no tab bar.
    await expectOnPage(page, 0);
    const first = workoutPage(page, 0);
    await expect(first.getByTestId('workout-exercise-name')).toHaveText(GOBLET.name);
    const picture = await first.getByTestId('exercise-viewer').boundingBox();
    const sets = await first.getByTestId('set-row').first().boundingBox();
    expect(picture!.y + picture!.height).toBeLessThanOrEqual(sets!.y);
    await expectOffScreen(page, 1);
    await expect(page.getByTestId('tab-plans')).toHaveCount(0);
    await expect(page.getByTestId('workout-position')).toHaveText('1 of 5');

    // A small scroll snaps back.
    const farthest = await trackScroll(page);
    await scrollWorkout(page, 0.07);
    await expectOnPage(page, 0);
    await expectOffScreen(page, 1);
    expect(await farthest()).toBeGreaterThan(30);

    // A third of the screen snaps the next exercise into view, and back.
    await scrollWorkout(page, 1 / 3);
    await expectOnPage(page, 1);
    await expectOffScreen(page, 0);
    await expect(page.getByTestId('workout-position')).toHaveText('2 of 5');
    await scrollWorkout(page, -1 / 3);
    await expectOnPage(page, 0);
    await expect(page.getByTestId('workout-position')).toHaveText('1 of 5');
  },
);

test('exercises without an animation swipe to their photos; the last page finishes', async ({
  page,
}) => {
  await openApp(page);
  await createFocusPlan(page, 'Focus');
  await startDay(page, 0);
  await expect(page.getByTestId('workout-position')).toHaveText('1 of 3');

  // Animated: the 3D view only, no photos.
  const squat = workoutPage(page, 0);
  await expect(squat.getByTestId('exercise-viewer')).toHaveAttribute('data-animated', 'true');
  await expect(squat.getByTestId('picture-slide')).toHaveCount(1);

  // No animation: the still figure, then its two photos.
  await scrollWorkout(page, 1 / 3);
  await expectOnPage(page, 1);
  await expect(page.getByTestId('workout-position')).toHaveText('2 of 3');
  const curl = workoutPage(page, 1);
  await expect(curl.getByTestId('workout-exercise-name')).toHaveText(CURL.name);
  const slides = curl.getByTestId('picture-slide');
  await expect(slides).toHaveCount(3);
  await expect(slides.nth(0).getByTestId('exercise-viewer')).toHaveAttribute(
    'data-animated',
    'false',
  );
  await expect(slides.nth(0)).toBeInViewport({ ratio: 0.99 });
  await swipePicture(curl);
  await expect(curl.getByTestId('workout-picture')).toHaveAttribute('data-shown', '1');
  await expect(slides.nth(1)).toHaveAttribute('data-kind', 'photo');
  await expect(slides.nth(1)).toBeInViewport({ ratio: 0.99 });
  const photo = slides.nth(1).locator('img');
  await expect
    .poll(() => photo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth))
    .toBeGreaterThan(0);
  // Swiping the picture leaves the page where it is.
  await expectOnPage(page, 1);

  // Ticking a set counts it.
  const progress = page.getByTestId('workout-progress');
  await expect(progress).toHaveText('0/9 sets');
  await curl.getByTestId('set-row').first().getByTestId('set-done').check();
  await expect(progress).toHaveText('1/9 sets');
  await expect(progress).toHaveAttribute('data-done', '1');

  // The name opens the exercise's page; back returns to the same exercise.
  await curl.getByTestId('workout-exercise-name').click();
  await expect(page.getByTestId('exercise-name')).toHaveText(CURL.name);
  await page.goBack();
  await expectOnPage(page, 1);

  // Past the last exercise: the finish page.
  await scrollWorkout(page, 1 / 3);
  await expectOnPage(page, 2);
  await scrollWorkout(page, 1 / 3);
  await expectOnPage(page, 3);
  await expect(page.getByTestId('workout-final-sets')).toHaveText('1 of 9 sets done');
  await expect(page.getByTestId('workout-position')).toHaveCount(0);
  await page.getByTestId('workout-finish').click();
  await expect(page).toHaveURL(/#\/history\/[^/]+$/);
  await expect(page.getByTestId('history-sets')).toHaveText('1 of 9');
});

test('entering sets and "last time" work on every page', async ({ page }) => {
  await openApp(page);
  await createFocusPlan(page, 'Every page');
  await startDay(page, 0);

  const amounts = ['8', '12', '45'];
  for (const [index, amount] of amounts.entries()) {
    if (index > 0) {
      await scrollWorkout(page, 1 / 3);
      await expectOnPage(page, index);
    }
    const current = workoutPage(page, index);
    const rows = current.getByTestId('set-row');
    const row = rows.first();
    await row.getByTestId('set-weight').fill('20');
    await row.locator('[data-testid="set-reps"], [data-testid="set-duration"]').fill(amount);
    await row.getByTestId('set-done').check();
    await current.getByTestId('set-add').click();
    await expect(rows).toHaveCount(4);
    await rows.nth(3).getByTestId('set-remove').click();
    await expect(rows).toHaveCount(3);
  }
  await expect(page.getByTestId('workout-progress')).toHaveAttribute('data-done', '3');
  await page.getByTestId('workout-finish').click();
  await expect(page.getByTestId('history-sets')).toHaveText('3 of 9');

  // The next workout shows them as last time on each page.
  await page.goBack();
  await startDay(page, 0);
  const expected = ['20 kg × 8', '20 kg × 12', '20 kg × 45 s'];
  for (const [index, text] of expected.entries()) {
    if (index > 0) {
      await scrollWorkout(page, 1 / 3);
      await expectOnPage(page, index);
    }
    await expect(workoutPage(page, index).getByTestId('last-time')).toContainText(text);
  }
});

test('a page with 8 sets scrolls to all of them before moving on', async ({ page }) => {
  await openApp(page);
  await createPlan(page, 'Eight sets');
  await addExercise(page, 0, 'goblet squat', GOBLET.id);
  await addExercise(page, 0, 'dumbbell bicep curl', CURL.id);
  const sets = page.getByTestId('edit-exercise').first().getByTestId('target-sets');
  for (let count = 3; count < 8; count++) {
    await page.getByTestId('edit-exercise').first().getByTestId('target-sets-inc').click();
  }
  await expect(sets).toHaveText('8');
  await page.getByTestId('editor-done').click();
  await startDay(page, 0);

  const squat = workoutPage(page, 0);
  const rows = squat.getByTestId('set-row');
  await expect(rows).toHaveCount(8);
  await expect(squat.getByTestId('set-add')).not.toBeInViewport();

  // The page scrolls within itself to its last set and Add set…
  await scrollWorkout(page, 0.25);
  await expect(rows.nth(7)).toBeInViewport({ ratio: 1 });
  await expect(squat.getByTestId('set-add')).toBeInViewport({ ratio: 1 });
  await expect(page.getByTestId('workout')).toHaveAttribute('data-page', '0');
  await expectOffScreen(page, 1);
  await squat.getByTestId('set-add').click();
  await expect(rows).toHaveCount(9);
  await expect(page.getByTestId('workout-position')).toHaveText('1 of 2');

  // …and only then snaps to the next exercise.
  await scrollWorkout(page, 1 / 3);
  await expectOnPage(page, 1);
  await expect(page.getByTestId('workout-position')).toHaveText('2 of 2');
});

test('a superset is one page whose picture swipes between its exercises', async ({ page }) => {
  await openApp(page);
  await createPlan(page, 'Superset focus');
  await addExercise(page, 0, 'goblet squat', GOBLET.id);
  await addExercise(page, 0, 'dumbbell bicep curl', CURL.id);
  await addExercise(page, 0, 'plank', PLANK.id);
  await page.getByTestId('edit-exercise').first().getByTestId('exercise-superset-next').click();
  await expect(page.getByTestId('edit-superset')).toBeVisible();
  await page.getByTestId('editor-done').click();
  await startDay(page, 0);

  // One page with rounds 1–3, then Plank.
  await expect(page.getByTestId('workout-position')).toHaveText('1 of 2');
  const superset = workoutPage(page, 0);
  await expect(superset.getByTestId('workout-round')).toHaveCount(3);
  await expect(superset.getByTestId('workout-exercise-name')).toHaveText([GOBLET.name, CURL.name]);

  // The picture: A1's 3D view, then A2's still figure and photos; it starts on A1.
  const picture = superset.getByTestId('workout-picture');
  const slides = superset.getByTestId('picture-slide');
  await expect(slides).toHaveCount(4);
  await expect(slides.nth(0)).toHaveAttribute('data-marker', 'A1');
  await expect(slides.nth(1)).toHaveAttribute('data-marker', 'A2');
  await expect(slides.nth(2)).toHaveAttribute('data-kind', 'photo');
  await expect(picture).toHaveAttribute('data-shown', '0');
  await expect(slides.nth(0).getByTestId('exercise-viewer')).toHaveAttribute(
    'data-animated',
    'true',
  );
  await swipePicture(superset);
  await expect(picture).toHaveAttribute('data-shown', '1');
  await expect(slides.nth(1)).toBeInViewport({ ratio: 0.99 });
  await expect(slides.nth(1).getByTestId('exercise-viewer')).toHaveAttribute(
    'data-animated',
    'false',
  );

  // With round 1's A1 ticked off, the picture starts on A2.
  await superset
    .locator('[data-testid="workout-round"][data-round="1"]')
    .getByTestId('set-row')
    .first()
    .getByTestId('set-done')
    .check();
  await reopen(page);
  await expectOnPage(page, 0);
  await expect(workoutPage(page, 0).getByTestId('workout-picture')).toHaveAttribute(
    'data-shown',
    '1',
  );
  await expect(workoutPage(page, 0).getByTestId('picture-slide').nth(1)).toBeInViewport({
    ratio: 0.99,
  });
});

test('back discards the workout, asking first once something was entered', async ({ page }) => {
  await openApp(page);
  const planId = await copySchedule(page, 'beginner-full-body');

  // Untouched: discarded without asking.
  await startDay(page, 0);
  await page.getByTestId('back-button').click();
  await expect(page).toHaveURL(new RegExp(`#/plans/${planId}$`));
  await expect(page.getByTestId('confirm-dialog')).not.toBeVisible();
  let stored = await readStoredUserData(page);
  expect(stored?.sessions).toEqual([]);
  expect(stored?.activeSessionId).toBeNull();

  // A set ticked: asks; Cancel stays.
  await startDay(page, 0);
  const set = workoutPage(page, 0).getByTestId('set-row').first();
  await set.getByTestId('set-done').check();
  await page.getByTestId('back-button').click();
  const dialog = page.getByTestId('confirm-dialog');
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText('Discard this workout?');
  await dialog.getByTestId('confirm-cancel').click();
  await expect(dialog).not.toBeVisible();
  await expect(set.getByTestId('set-done')).toBeChecked();
  expect((await readStoredUserData(page))?.sessions).toHaveLength(1);

  // Discard deletes it and returns to the plan.
  await page.getByTestId('back-button').click();
  await dialog.getByTestId('confirm-ok').click();
  await expect(page).toHaveURL(new RegExp(`#/plans/${planId}$`));
  await expect(page.getByTestId('plan-day').first()).toBeVisible();
  stored = await readStoredUserData(page);
  expect(stored?.sessions).toEqual([]);
  expect(stored?.activeSessionId).toBeNull();
});

test('reopening a workout lands on the first exercise with sets left', async ({ page }) => {
  await openApp(page);
  await copySchedule(page, 'beginner-full-body');
  await startDay(page, 0);
  const rows = workoutPage(page, 0).getByTestId('set-row');
  await expect(rows).toHaveCount(3);
  for (const index of [0, 1, 2]) await rows.nth(index).getByTestId('set-done').check();

  await reopen(page);
  await expectOnPage(page, 1);
  await expect(page.getByTestId('workout-position')).toHaveText('2 of 5');
  await expect(page.getByTestId('workout-progress')).toHaveText('3/14 sets');
});

test('a custom exercise shows the still figure with its muscles and no photos', async ({
  page,
}) => {
  await openApp(page);
  await createPlan(page, 'Custom focus');
  await page.getByTestId('add-exercise').click();
  await page.getByTestId('exercise-search').fill('Landmine Press');
  await page.getByTestId('create-custom-from-query').click();
  await page.getByTestId('custom-primary-shoulders').click();
  await page.getByTestId('custom-save').click();
  await expect(page.getByTestId('edit-exercise')).toHaveCount(1);
  await page.getByTestId('editor-done').click();
  await startDay(page, 0);

  const custom = workoutPage(page, 0);
  await expect(custom.getByTestId('workout-exercise-name')).toHaveText('Landmine Press');
  await expect(custom.getByTestId('picture-slide')).toHaveCount(1);
  const viewer = custom.getByTestId('exercise-viewer');
  await expect(viewer).toHaveAttribute('data-animated', 'false');
  await expect(viewer).toHaveAttribute('data-primary', 'shoulders');
});
