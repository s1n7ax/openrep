/**
 * Verification "Plan days at a glance": a plan's days show their name, the
 * muscles they train on a front-and-back figure (primary and secondary) and
 * Start, without their exercises until a day is tapped; the day after the
 * last one finished is marked Next, back to the first after the last, and
 * any day can still be started.
 */
import type { Page } from '@playwright/test';
import { openApp } from './support/app.ts';
import { expect, test } from './support/fixtures.ts';
import { addExercise, copySchedule, createPlan, startDay } from './support/plans.ts';
import { tickSet } from './support/workout.ts';

// Starting workouts starts 3D views, which takes seconds with software WebGL.
test.describe.configure({ timeout: 180_000 });

/** Expects day `name` (and no other) to be marked Next. */
async function expectNext(page: Page, name: string): Promise<void> {
  const days = page.getByTestId('plan-day');
  await expect(days.filter({ has: page.getByTestId('day-next') })).toHaveCount(1);
  await expect(days.filter({ has: page.getByTestId('day-next') }).locator('.day-name')).toHaveText(
    name,
  );
  await expect(page.locator('[data-testid="plan-day"][data-next="true"]')).toHaveCount(1);
}

/** Starts the day at `dayIndex`, ticks its first set off and finishes the workout; ends back on the plan. */
async function logDay(page: Page, dayIndex: number): Promise<void> {
  const url = page.url();
  await startDay(page, dayIndex);
  await tickSet(page.getByTestId('workout-exercise').first(), 0);
  await page.getByTestId('workout-finish').click();
  await expect(page.getByTestId('history-set').first()).toBeVisible();
  await page.goto(url);
  await expect(page.getByTestId('plan-day').first()).toBeVisible();
}

test('days show their name, muscles and Start, and their exercises only when tapped', async ({
  page,
}) => {
  await openApp(page);
  await copySchedule(page, 'push-pull-legs');

  const days = page.getByTestId('plan-day');
  await expect(days.locator('.day-name')).toHaveText(['Push', 'Pull', 'Legs']);
  for (const day of await days.all()) {
    await expect(day.getByTestId('day-muscles')).toBeVisible();
    await expect(day.getByTestId('day-start')).toBeEnabled();
    await expect(day.getByTestId('day-toggle')).toHaveAttribute('aria-expanded', 'false');
  }
  await expect(page.getByTestId('plan-exercise')).toHaveCount(0);

  // Each day lights its own muscles: chest on Push, lats on Pull, quadriceps on Legs.
  const level = (dayIndex: number, area: string) =>
    days.nth(dayIndex).getByTestId(`day-muscles-${area}`);
  await expect(level(0, 'chest-front')).toHaveAttribute('data-level', 'primary');
  await expect(level(1, 'lats-back')).toHaveAttribute('data-level', 'primary');
  await expect(level(2, 'quadriceps-front')).toHaveAttribute('data-level', 'primary');
  await expect(level(2, 'chest-front')).toHaveAttribute('data-level', 'none');

  // Tapping a day, on its figure as on its name, shows its exercises; tapping again hides them.
  const pull = days.nth(1);
  // The figure is under the day's toggle, which takes the tap.
  const figure = await pull.getByTestId('day-muscles').boundingBox();
  await page.mouse.click(figure!.x + figure!.width / 2, figure!.y + figure!.height / 2);
  await expect(pull.getByTestId('day-toggle')).toHaveAttribute('aria-expanded', 'true');
  await expect(pull.getByTestId('plan-exercise')).toHaveCount(6);
  await expect(pull.getByTestId('plan-exercise-name').first()).toHaveText('Barbell Deadlift');
  await expect(pull.getByTestId('plan-exercise-target').first()).toHaveText('3 × 5 · Rest 3 min');
  await expect(page.getByTestId('plan-exercise')).toHaveCount(6);
  await pull.getByTestId('day-toggle').click();
  await expect(pull.getByTestId('day-toggle')).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByTestId('plan-exercise')).toHaveCount(0);

  // Start, inside the tappable day, opens the workout.
  await startDay(page, 0);
});

test('the figure lights the primary and secondary muscles of the day', async ({ page }) => {
  await openApp(page);
  await createPlan(page, 'Bench only');
  await addExercise(page, 0, 'barbell bench press medium grip', 'barbell-bench-press-medium-grip');
  await page.getByTestId('editor-done').click();

  const figure = page.getByTestId('plan-day').getByTestId('day-muscles');
  await expect(figure).toHaveAttribute(
    'aria-label',
    'Muscles: Chest. Secondary: Shoulders, Triceps',
  );
  const lit = figure.locator('[data-level]:not([data-level="none"])');
  await expect
    .poll(() =>
      lit.evaluateAll((areas) =>
        areas.map(
          (area) => `${area.getAttribute('data-testid')} ${area.getAttribute('data-level')}`,
        ),
      ),
    )
    .toEqual([
      'day-muscles-shoulders-front secondary',
      'day-muscles-chest-front primary',
      'day-muscles-shoulders-back secondary',
      'day-muscles-triceps-back secondary',
    ]);
});

test('the day after the last one finished is marked Next, and any day can be started', async ({
  page,
}) => {
  await openApp(page);
  await copySchedule(page, 'push-pull-legs');
  await expectNext(page, 'Push');
  await expect(page.getByTestId('plan-day').first().getByTestId('day-start')).toHaveClass(
    /btn-primary/,
  );

  await logDay(page, 0);
  await expectNext(page, 'Pull');

  // Legs is not the next day, and starts all the same; after the last day comes the first.
  await logDay(page, 2);
  await expectNext(page, 'Push');
});
