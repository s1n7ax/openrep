/**
 * Verification "Search": alternative names find exercises, and a name that is
 * not in the catalog offers a custom exercise, which is added to the plan day.
 */
import { openApp, readStoredUserData } from './support/app.ts';
import { expect, test } from './support/fixtures.ts';
import { createPlan } from './support/plans.ts';

test(
  'searching "skull crusher" lists Lying Triceps Press first',
  { tag: '@smoke' },
  async ({ page }) => {
    await openApp(page, '#/exercises');
    await page.getByTestId('exercise-search').fill('skull crusher');

    const first = page.getByTestId('exercise-row').first();
    await expect(first).toHaveAttribute('data-exercise-id', 'lying-triceps-press');
    await expect(first).toContainText('Lying Triceps Press');
  },
);

test('a name not in the catalog creates a custom exercise on the plan day', async ({ page }) => {
  const name = 'zzqx nonexistent';
  await openApp(page);
  await createPlan(page, 'Custom Plan');

  await page.getByTestId('add-exercise').click();
  await page.getByTestId('exercise-search').fill(name);
  await expect(page.getByTestId('exercise-row')).toHaveCount(0);
  const create = page.getByTestId('create-custom-from-query');
  await expect(create).toContainText(`Create custom exercise “${name}”`);
  await create.click();

  await expect(page.getByTestId('custom-name')).toHaveValue(name);
  await page.getByTestId('custom-save').click();

  // Back in the plan editor with the new exercise on the day.
  const added = page.getByTestId('edit-exercise');
  await expect(added).toHaveCount(1);
  await expect(added.getByTestId('edit-exercise-name')).toHaveText(name);
  await page.getByTestId('editor-done').click();
  await expect(page.getByTestId('plan-exercise-name')).toHaveText([name]);

  const stored = await readStoredUserData(page);
  expect(stored?.customExercises.map((exercise) => exercise.name)).toEqual([name]);
  expect(stored?.plans[0]?.days[0]?.exercises[0]?.exercise).toMatchObject({
    kind: 'custom',
    customExerciseId: stored?.customExercises[0]?.id,
    name,
  });
});
