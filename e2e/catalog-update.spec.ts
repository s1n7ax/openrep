/**
 * Verification "Catalog update": an exercise added to the remote catalog
 * appears after Settings → Update catalog; an update that removes an
 * exercise used in a plan does not break the plan or logging it.
 */
import type { Page } from '@playwright/test';
import { buildCatalog } from '../src/lib/data/buildCatalog.ts';
import type { Catalog } from '../src/lib/schema/catalog.ts';
import type { Exercise } from '../src/lib/schema/exercise.ts';
import { bundledCatalog, openApp, reopen } from './support/app.ts';
import { REMOTE_CATALOG_URL } from './support/env.ts';
import { expect, test } from './support/fixtures.ts';
import { addExercise, createPlan, openPlan, startDay } from './support/plans.ts';
import { changeAmounts, tickSet, typeWeight } from './support/workout.ts';

const ZERCHER: Exercise = {
  formatVersion: 1,
  id: 'zercher-squat-test',
  name: 'Zercher Squat Test',
  aliases: [],
  category: 'strength',
  level: 'intermediate',
  force: 'push',
  mechanic: 'compound',
  equipment: 'barbell',
  primaryMuscles: ['quadriceps'],
  secondaryMuscles: ['glutes', 'abdominals'],
  instructions: ['Hold the bar in the crooks of your elbows.', 'Squat down and stand back up.'],
  images: [],
  source: { name: 'community' },
};

/** A catalog with the bundled content changed by `change`, with its own revision. */
async function remoteCatalog(
  base: Catalog,
  change: (exercises: Exercise[]) => Exercise[],
): Promise<Catalog> {
  return buildCatalog(
    {
      exercises: change([...base.exercises]),
      animations: base.animations,
      schedules: base.schedules,
    },
    new Date().toISOString(),
  );
}

/**
 * Answers the app's catalog downloads with whatever `serve()` returns at the
 * time; null fails the download like being offline.
 */
async function serveRemoteCatalog(page: Page, serve: () => Catalog | null): Promise<void> {
  await page.route(REMOTE_CATALOG_URL, async (route) => {
    const catalog = serve();
    if (catalog === null) return route.abort('internetdisconnected');
    await route.fulfill({
      json: catalog,
      headers: { 'access-control-allow-origin': '*' },
    });
  });
}

async function updateCatalog(page: Page, expected: string): Promise<void> {
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('catalog-update').click();
  await expect(page.getByTestId('catalog-update-result')).toHaveText(expected);
  await expect(page.getByTestId('catalog-source')).toHaveText('Downloaded update');
}

test('a new exercise in the remote catalog appears after an update', async ({ page, request }) => {
  const base = await bundledCatalog(request);
  const remote = await remoteCatalog(base, (exercises) => [...exercises, ZERCHER]);
  let served: Catalog | null = null;
  await serveRemoteCatalog(page, () => served);

  await openApp(page, '#/exercises');
  await page.getByTestId('exercise-search').fill('zercher squat test');
  await expect(page.getByTestId('exercise-row')).toHaveCount(0);

  served = remote;
  await updateCatalog(page, 'Catalog updated with 1 new exercise.');
  await expect(page.getByTestId('catalog-count')).toHaveText(String(base.exercises.length + 1));

  await page.getByTestId('tab-exercises').click();
  await page.getByTestId('exercise-search').fill('zercher squat test');
  const first = page.getByTestId('exercise-row').first();
  await expect(first).toHaveAttribute('data-exercise-id', ZERCHER.id);
  await first.click();
  await expect(page.getByTestId('exercise-name')).toHaveText('Zercher Squat Test');

  // The update is kept: reopening the app (no download this time) still has it.
  served = null;
  await reopen(page);
  await page.getByTestId('tab-exercises').click();
  await page.getByTestId('exercise-search').fill('zercher squat test');
  await expect(page.getByTestId('exercise-row').first()).toHaveAttribute(
    'data-exercise-id',
    ZERCHER.id,
  );
});

test('an update removing an exercise used in a plan keeps the plan working', async ({
  page,
  request,
}) => {
  const removed = { id: 'alternate-hammer-curl', name: 'Alternate Hammer Curl' };
  const base = await bundledCatalog(request);
  expect(base.exercises.some((exercise) => exercise.id === removed.id)).toBe(true);
  const remote = await remoteCatalog(base, (exercises) =>
    exercises.filter((exercise) => exercise.id !== removed.id),
  );
  let served: Catalog | null = null;
  await serveRemoteCatalog(page, () => served);

  await openApp(page);
  await createPlan(page, 'Arms');
  await addExercise(page, 0, 'alternate hammer curl', removed.id);
  await page.getByTestId('editor-done').click();
  await expect(page.getByTestId('plan-exercise-name')).toHaveText([removed.name]);

  served = remote;
  await updateCatalog(page, 'Catalog updated.');
  await expect(page.getByTestId('catalog-count')).toHaveText(String(base.exercises.length - 1));

  // The plan shows the stored name with a note.
  await openPlan(page, 'Arms');
  const entry = page.getByTestId('plan-exercise');
  await expect(entry.getByTestId('plan-exercise-name')).toHaveText(removed.name);
  await expect(entry.getByTestId('missing-note')).toContainText('No longer in catalog');

  // Logging it still works.
  await startDay(page, 0);
  const exercise = page.getByTestId('workout-exercise');
  await expect(exercise.getByTestId('workout-exercise-name')).toHaveText(removed.name);
  await expect(exercise.getByTestId('missing-note')).toContainText('No longer in catalog');
  // Its page has no 3D view.
  await expect(page.getByTestId('workout-page').getByTestId('workout-picture')).toHaveCount(0);
  await typeWeight(exercise, 0, '14');
  await changeAmounts(exercise, { 0: '10' });
  await tickSet(exercise, 0);
  await page.getByTestId('workout-finish').click();
  await expect(page.getByTestId('history-exercise')).toContainText(removed.name);
  await expect(page.getByTestId('history-set').first()).toContainText('14 kg × 10');
});
