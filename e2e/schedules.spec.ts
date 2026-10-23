/**
 * Verification "Schedules": a copied starter schedule is an editable plan
 * whose changes persist.
 */
import { openApp, reopen } from './support/app.ts';
import { expect, test } from './support/fixtures.ts';
import { copySchedule, openPlan } from './support/plans.ts';

test(
  'copying Push/Pull/Legs gives a plan that can be edited',
  { tag: '@smoke' },
  async ({ page }) => {
    await openApp(page);
    await page.getByTestId('tab-schedules').click();
    await expect(
      page.locator('[data-testid="schedule-card"][data-schedule-id="push-pull-legs"]'),
    ).toContainText('Push/Pull/Legs');

    await copySchedule(page, 'push-pull-legs');
    await expect(page.getByTestId('page-title')).toHaveText('Push/Pull/Legs');
    await expect(page.getByTestId('plan-day').locator('.day-name')).toHaveText([
      'Push',
      'Pull',
      'Legs',
    ]);
    const firstTarget = page.getByTestId('plan-exercise-target').first();
    await expect(firstTarget).toHaveText('4 × 6–8 · Rest 2 min 30 s');

    await page.getByTestId('plan-edit').click();
    await page.getByTestId('day-name-input').first().fill('Chest and Shoulders');
    const firstExercise = page.getByTestId('edit-exercise').first();
    await firstExercise.getByTestId('target-sets-inc').click();
    await expect(firstExercise.getByTestId('target-sets')).toHaveText('5');
    await page.getByTestId('editor-done').click();

    await expect(page.getByTestId('plan-day').first().locator('.day-name')).toHaveText(
      'Chest and Shoulders',
    );
    await expect(firstTarget).toHaveText('5 × 6–8 · Rest 2 min 30 s');

    await reopen(page);
    await openPlan(page, 'Push/Pull/Legs');
    await expect(page.getByTestId('plan-day').locator('.day-name')).toHaveText([
      'Chest and Shoulders',
      'Pull',
      'Legs',
    ]);
    await expect(page.getByTestId('plan-exercise-target').first()).toHaveText(
      '5 × 6–8 · Rest 2 min 30 s',
    );

    // The community schedule itself is unchanged.
    await page.getByTestId('tab-schedules').click();
    await page.locator('[data-testid="schedule-card"][data-schedule-id="push-pull-legs"]').click();
    await expect(page.getByTestId('schedule-day').first()).toContainText('Push');
    await expect(page.getByTestId('schedule-day').first()).toContainText('4 × 6–8');
  },
);
