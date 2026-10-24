/**
 * Verification "Supersets": exercises grouped into a superset in the plan
 * editor show as a labelled group on the plan page, are logged round by
 * round, show "last time" per exercise and are grouped by round in history;
 * a community schedule with a superset shows it, copies it into a plan and
 * Submit keeps it; a backup keeps supersets.
 */
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import { buildCatalog } from '../src/lib/data/buildCatalog.ts';
import { validateData } from '../src/lib/data/validate.ts';
import type { Catalog } from '../src/lib/schema/catalog.ts';
import { scheduleSchema, type ScheduleV2 } from '../src/lib/schema/schedule.ts';
import {
  bundledCatalog,
  clearStorage,
  openApp,
  readStoredUserData,
  reopen,
  waitForApp,
} from './support/app.ts';
import { REMOTE_CATALOG_URL } from './support/env.ts';
import { expect, test } from './support/fixtures.ts';
import { addExercise, createPlan, openPlan, startDay } from './support/plans.ts';

const BENCH = { id: 'barbell-bench-press-medium-grip', name: 'Barbell Bench Press - Medium Grip' };
const FLYES = { id: 'dumbbell-flyes', name: 'Dumbbell Flyes' };
const PUSHDOWN = { id: 'triceps-pushdown', name: 'Triceps Pushdown' };

/**
 * Creates plan `name` with Bench Press, Dumbbell Flyes and Triceps Pushdown
 * (3 × 10 each) on its first day; ends in the editor.
 */
async function createThreeExercisePlan(page: Page, name: string): Promise<void> {
  await createPlan(page, name);
  await addExercise(page, 0, 'barbell bench press medium grip', BENCH.id);
  await addExercise(page, 0, 'dumbbell flyes', FLYES.id);
  await addExercise(page, 0, 'triceps pushdown', PUSHDOWN.id);
}

/**
 * In the editor, groups the first two exercises into a superset with the
 * first one's 3 sets as rounds and a rest of 90 s; ends on the plan page.
 */
async function groupFirstTwo(page: Page): Promise<void> {
  const bench = page.getByTestId('edit-exercise').first();
  await bench.getByTestId('target-rest').fill('90');
  await bench.getByTestId('exercise-superset-next').click();
  const superset = page.getByTestId('edit-superset');
  await expect(superset.getByTestId('edit-superset-label')).toHaveText('Superset A');
  await expect(superset.getByTestId('superset-rounds')).toHaveText('3');
  await expect(superset.getByTestId('superset-rest')).toHaveValue('90');
  await expect(superset.getByTestId('edit-exercise-label')).toHaveText(['A1', 'A2']);
  await page.getByTestId('editor-done').click();
  await expect(page.getByTestId('plan-superset')).toBeVisible();
}

/** Fills and ticks every set row of round `round` (1-based) of the superset card. */
async function logRound(page: Page, round: number): Promise<void> {
  const rows = page
    .getByTestId('workout-superset')
    .locator(`[data-testid="workout-round"][data-round="${round}"]`)
    .getByTestId('set-row');
  await expect(rows).toHaveCount(2);
  for (const [index, [weight, reps]] of [
    ['60', '8'],
    ['14', '12'],
  ].entries()) {
    const row = rows.nth(index);
    await row.getByTestId('set-weight').fill(weight!);
    await row.getByTestId('set-reps').fill(reps!);
    await row.getByTestId('set-done').check();
  }
}

test('a superset is shown on the plan, logged round by round and in history', async ({ page }) => {
  test.setTimeout(120_000);
  await openApp(page);
  await createThreeExercisePlan(page, 'Push supersets');
  await groupFirstTwo(page);

  // The plan page: A1 and A2 in one group, Triceps Pushdown on its own.
  const group = page.getByTestId('plan-superset');
  await expect(group.getByTestId('plan-superset-summary')).toHaveText(
    '3 rounds · rest 90 s after each round',
  );
  await expect(group.getByTestId('plan-exercise-label')).toHaveText(['A1', 'A2']);
  await expect(group.getByTestId('plan-exercise-name')).toHaveText([BENCH.name, FLYES.name]);
  await expect(group.getByTestId('plan-exercise-target')).toHaveText(['10 reps', '10 reps']);
  const exercises = page.getByTestId('plan-exercise');
  await expect(exercises).toHaveCount(3);
  await expect(exercises.nth(2).getByTestId('plan-exercise-name')).toHaveText(PUSHDOWN.name);
  await expect(exercises.nth(2).getByTestId('plan-exercise-label')).toHaveText('3');
  await expect(exercises.nth(2).getByTestId('plan-exercise-target')).toHaveText('3 × 10');

  // The workout: one card, rounds 1–3 with an A1 and an A2 row each.
  await startDay(page, 0);
  const card = page.getByTestId('workout-superset');
  await expect(card).toHaveCount(1);
  await expect(card.getByTestId('workout-superset-summary')).toHaveText(
    '3 rounds · rest 90 s after each round',
  );
  await expect(card.getByTestId('workout-exercise-name')).toHaveText([BENCH.name, FLYES.name]);
  const rounds = card.getByTestId('workout-round');
  await expect(rounds).toHaveCount(3);
  for (const index of [0, 1, 2]) {
    await expect(rounds.nth(index).getByRole('heading')).toHaveText(`Round ${index + 1}`);
    await expect(rounds.nth(index).getByTestId('set-marker')).toHaveText(['A1', 'A2']);
  }
  await expect(
    page.getByTestId('workout-exercise').getByTestId('workout-exercise-name'),
  ).toHaveText(PUSHDOWN.name);

  // Ticking all 6 rows advances the progress by 6 sets.
  const progress = page.getByTestId('workout-progress');
  await expect(progress).toHaveAttribute('data-done', '0');
  await expect(progress).toHaveAttribute('data-total', '9');
  for (const round of [1, 2, 3]) await logRound(page, round);
  await expect(progress).toHaveAttribute('data-done', '6');

  // Add round: round 4 with one row per exercise.
  await card.getByTestId('round-add').click();
  await expect(rounds).toHaveCount(4);
  await expect(rounds.nth(3).getByTestId('set-marker')).toHaveText(['A1', 'A2']);
  await expect(progress).toHaveAttribute('data-total', '11');
  await expect(card.getByTestId('workout-superset-summary')).toHaveText(
    '4 rounds · rest 90 s after each round',
  );

  // History: the superset grouped by round.
  await page.getByTestId('workout-finish').click();
  const logged = page.getByTestId('history-superset');
  await expect(logged.getByTestId('history-superset-summary')).toHaveText(
    '4 rounds · rest 90 s after each round',
  );
  const loggedRounds = logged.getByTestId('history-round');
  await expect(loggedRounds).toHaveCount(4);
  for (const index of [0, 1, 2]) {
    const sets = loggedRounds.nth(index).getByTestId('history-set');
    await expect(sets).toHaveCount(2);
    await expect(sets.nth(0)).toContainText('A1');
    await expect(sets.nth(0)).toContainText('60 kg × 8');
    await expect(sets.nth(0)).toContainText('Done');
    await expect(sets.nth(1)).toContainText('A2');
    await expect(sets.nth(1)).toContainText('14 kg × 12');
  }
  await expect(loggedRounds.nth(3).getByTestId('history-set')).toHaveText([
    /A1.*Skipped/,
    /A2.*Skipped/,
  ]);
  await expect(page.getByTestId('history-sets')).toHaveText('6 of 11');

  // The next workout shows "last time" for each exercise of the superset.
  await openPlan(page, 'Push supersets');
  await startDay(page, 0);
  const members = page.getByTestId('workout-superset-exercise');
  await expect(members.nth(0).getByTestId('last-time')).toContainText(
    '60 kg × 8, 60 kg × 8, 60 kg × 8',
  );
  await expect(members.nth(1).getByTestId('last-time')).toContainText(
    '14 kg × 12, 14 kg × 12, 14 kg × 12',
  );
});

test('supersets can be extended, reordered, taken apart and ungrouped', async ({ page }) => {
  await openApp(page);
  await createThreeExercisePlan(page, 'Tri-set');
  const names = page.getByTestId('edit-exercise-name');
  const labels = page.getByTestId('edit-exercise-label');

  // A tri-set: the first two, then the superset with the next exercise.
  await page.getByTestId('edit-exercise').first().getByTestId('exercise-superset-next').click();
  await page.getByTestId('edit-superset').getByTestId('superset-join-next').click();
  const superset = page.getByTestId('edit-superset');
  await expect(superset.getByTestId('edit-exercise')).toHaveCount(3);
  await expect(labels).toHaveText(['A1', 'A2', 'A3']);
  await page.getByTestId('editor-done').click();
  await expect(page.getByTestId('plan-superset').getByTestId('plan-exercise-label')).toHaveText([
    'A1',
    'A2',
    'A3',
  ]);
  await expect(page.getByTestId('plan-superset-summary')).toHaveText('3 rounds');

  // Reorder within it; it is still one superset after reopening the app.
  await page.getByTestId('plan-edit').click();
  await superset.getByTestId('edit-exercise').nth(2).getByTestId('exercise-move-up').click();
  await expect(names).toHaveText([BENCH.name, PUSHDOWN.name, FLYES.name]);
  await expect(
    superset.getByTestId('edit-exercise').nth(2).getByTestId('exercise-move-down'),
  ).toBeDisabled();
  await superset.getByTestId('superset-rounds-inc').click();
  await expect(superset.getByTestId('superset-rounds')).toHaveText('4');
  await reopen(page);
  await openPlan(page, 'Tri-set');
  await expect(page.getByTestId('plan-exercise-name')).toHaveText([
    BENCH.name,
    PUSHDOWN.name,
    FLYES.name,
  ]);
  await expect(page.getByTestId('plan-superset-summary')).toHaveText('4 rounds');

  // Ungrouping leaves normal exercises in the same order.
  await page.getByTestId('plan-edit').click();
  await superset.getByTestId('superset-ungroup').click();
  await expect(superset).toHaveCount(0);
  await expect(names).toHaveText([BENCH.name, PUSHDOWN.name, FLYES.name]);
  await expect(labels).toHaveText(['1', '2', '3']);
  await expect(page.getByTestId('target-sets')).toHaveText(['4', '4', '4']);

  // A superset of the last two moves up as a whole.
  await page.getByTestId('edit-exercise').nth(1).getByTestId('exercise-superset-next').click();
  await expect(names).toHaveText([BENCH.name, PUSHDOWN.name, FLYES.name]);
  await superset.getByTestId('superset-move-up').click();
  await expect(names).toHaveText([PUSHDOWN.name, FLYES.name, BENCH.name]);
  await expect(labels).toHaveText(['A1', 'A2', '3']);
  // A normal exercise moves past the whole superset.
  await page.getByTestId('edit-exercise').nth(2).getByTestId('exercise-move-up').click();
  await expect(names).toHaveText([BENCH.name, PUSHDOWN.name, FLYES.name]);
  await expect(labels).toHaveText(['1', 'A1', 'A2']);

  // Taking one of two out leaves a normal exercise: no superset is left.
  await superset
    .getByTestId('edit-exercise')
    .first()
    .getByTestId('exercise-superset-remove')
    .click();
  await expect(superset).toHaveCount(0);
  await expect(names).toHaveText([BENCH.name, FLYES.name, PUSHDOWN.name]);
  await expect(labels).toHaveText(['1', '2', '3']);
  await page.getByTestId('editor-done').click();
  await expect(page.getByTestId('plan-superset')).toHaveCount(0);
  await expect(page.getByTestId('plan-exercise')).toHaveCount(3);
});

test.describe('community schedules with supersets', () => {
  const SCHEDULE: ScheduleV2 = {
    formatVersion: 2,
    id: 'superset-test-schedule',
    name: 'Superset Test Schedule',
    description: 'A schedule with a superset.',
    days: [
      {
        name: 'Push',
        exercises: [
          {
            superset: {
              rounds: 3,
              restSec: 90,
              exercises: [
                { exerciseId: BENCH.id, reps: '8' },
                { exerciseId: FLYES.id, reps: '12', notes: 'Slow on the way down' },
              ],
            },
          },
          { exerciseId: PUSHDOWN.id, sets: 3, reps: '10-12', restSec: 60 },
        ],
      },
    ],
  };

  test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

  test.beforeEach(async ({ page }) => {
    // On the web, @capacitor/browser opens pages with window.open: record them instead.
    await page.addInitScript(() => {
      const opened: string[] = [];
      Object.assign(window, { openedUrls: opened });
      window.open = (url?: string | URL) => {
        opened.push(String(url));
        return null;
      };
    });
  });

  /**
   * The bundled catalog plus the superset schedule as a newer catalog,
   * answered to the app's downloads once `publish` is called (before, a
   * download fails like being offline, so the launch check changes nothing).
   */
  async function remoteCatalogWithSchedule(
    page: Page,
    base: Catalog,
  ): Promise<{ remote: Catalog; publish: () => void }> {
    const remote = await buildCatalog(
      {
        exercises: base.exercises,
        animations: base.animations,
        schedules: [...base.schedules, SCHEDULE],
      },
      new Date().toISOString(),
    );
    let published = false;
    await page.route(REMOTE_CATALOG_URL, (route) =>
      published
        ? route.fulfill({ json: remote, headers: { 'access-control-allow-origin': '*' } })
        : route.abort('internetdisconnected'),
    );
    return { remote, publish: () => (published = true) };
  }

  test('a schedule with a superset is shown, copied and submitted with it', async ({
    page,
    request,
  }) => {
    const base = await bundledCatalog(request);
    expect(base.formatVersion).toBe(1);
    const { remote, publish } = await remoteCatalogWithSchedule(page, base);
    expect(remote.formatVersion).toBe(2);

    await openApp(page, '#/settings');
    publish();
    await page.getByTestId('catalog-update').click();
    await expect(page.getByTestId('catalog-update-result')).toHaveText('Catalog updated.');

    // The schedule page shows the group.
    await page.getByTestId('tab-schedules').click();
    const card = page.locator(`[data-testid="schedule-card"][data-schedule-id="${SCHEDULE.id}"]`);
    await expect(card).toContainText('1 day');
    await expect(card).toContainText('3 exercises');
    await card.click();
    const group = page.getByTestId('schedule-superset');
    await expect(group.getByTestId('schedule-superset-summary')).toHaveText(
      '3 rounds · rest 90 s after each round',
    );
    await expect(group.getByTestId('schedule-exercise-label')).toHaveText(['A1', 'A2']);
    await expect(group.getByTestId('schedule-exercise-name')).toHaveText([BENCH.name, FLYES.name]);
    await expect(page.getByTestId('schedule-exercise')).toHaveCount(3);
    await expect(page.getByTestId('schedule-exercise').nth(2)).toContainText(PUSHDOWN.name);
    await expect(page.getByTestId('schedule-exercise').nth(2)).toContainText('3 × 10–12');

    // Copying it creates a plan with the same superset.
    await page.getByTestId('schedule-copy').click();
    const planGroup = page.getByTestId('plan-superset');
    await expect(planGroup.getByTestId('plan-superset-summary')).toHaveText(
      '3 rounds · rest 90 s after each round',
    );
    await expect(planGroup.getByTestId('plan-exercise-name')).toHaveText([BENCH.name, FLYES.name]);
    await expect(planGroup.getByTestId('plan-exercise-target')).toHaveText(['8 reps', '12 reps']);
    await expect(page.getByTestId('plan-exercise').nth(2)).toContainText('3 × 10–12 · Rest 1 min');

    // Submit produces a schedule file with the superset that passes validation.
    await page.getByTestId('plan-submit').click();
    await expect(page.getByTestId('submit-dialog')).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => (window as unknown as { openedUrls: string[] }).openedUrls))
      .toHaveLength(1);
    const [opened] = await page.evaluate(
      () => (window as unknown as { openedUrls: string[] }).openedUrls,
    );
    const value = new URL(opened!).searchParams.get('value');
    expect(value).not.toBeNull();
    const submitted = scheduleSchema.parse(JSON.parse(value!));
    expect(submitted.formatVersion).toBe(2);
    expect(submitted.days).toEqual(SCHEDULE.days);
    const { issues } = validateData({
      exercises: base.exercises.map((exercise) => ({
        path: `exercises/${exercise.id}.json`,
        content: JSON.stringify(exercise),
      })),
      animations: [],
      schedules: [{ path: `schedules/${submitted.id}.json`, content: value! }],
      images: base.exercises.flatMap((exercise) => exercise.images),
    });
    expect(issues).toEqual([]);
  });
});

test('a backup keeps supersets of plans and workouts', async ({ page }) => {
  await openApp(page);
  await createThreeExercisePlan(page, 'Backup supersets');
  await groupFirstTwo(page);
  await startDay(page, 0);
  await logRound(page, 1);
  await page.getByTestId('workout-finish').click();
  await expect(page.getByTestId('history-superset')).toBeVisible();

  const before = await readStoredUserData(page);
  expect(before?.plans[0]?.days[0]?.supersets).toHaveLength(1);
  expect(before?.sessions[0]?.supersets).toHaveLength(1);

  await page.getByTestId('tab-settings').click();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('backup-export').click(),
  ]);
  const text = await readFile(await download.path(), 'utf8');

  // A fresh install, then the backup.
  await clearStorage(page);
  await page.reload();
  await waitForApp(page);
  expect((await readStoredUserData(page))?.plans ?? []).toEqual([]);
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('backup-file-input').setInputFiles({
    name: download.suggestedFilename(),
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('backup-message')).toContainText('Backup restored');
  expect(await readStoredUserData(page)).toEqual(before);

  await openPlan(page, 'Backup supersets');
  await expect(page.getByTestId('plan-superset').getByTestId('plan-exercise-label')).toHaveText([
    'A1',
    'A2',
  ]);
  await page.getByTestId('tab-history').click();
  await page.getByTestId('history-row').click();
  await expect(page.getByTestId('history-superset').getByTestId('history-round')).toHaveCount(3);
});
