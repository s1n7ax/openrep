/**
 * Verifications "Plan file import" and "Plan file export": a plan file an AI
 * assistant wrote becomes a normal, editable plan (supersets, weights and a
 * custom exercise included) and exporting the plan writes the same format
 * back; an invalid file is rejected and changes nothing.
 */
import { readFile } from 'node:fs/promises';
import type { Page } from '@playwright/test';
import type { PlanFile } from '../src/lib/schema/planFile.ts';
import { openApp, readStoredUserData, reopen } from './support/app.ts';
import { expect, test } from './support/fixtures.ts';
import { openPlan } from './support/plans.ts';

const file: PlanFile = {
  app: 'openrep',
  kind: 'plan',
  formatVersion: 1,
  plan: {
    name: 'AI Upper/Lower',
    days: [
      {
        name: 'Upper',
        exercises: [
          {
            exercise: {
              kind: 'catalog',
              exerciseId: 'barbell-bench-press-medium-grip',
              name: 'Barbell Bench Press',
            },
            sets: 4,
            reps: '5',
            weightKg: 72.5,
            restSec: 180,
            notes: 'Two warm-up sets first.',
          },
          {
            exercise: { kind: 'catalog', exerciseId: 'dumbbell-flyes', name: 'Dumbbell Flyes' },
            sets: 3,
            reps: '12',
            supersetId: 'arms',
          },
          {
            exercise: { kind: 'catalog', exerciseId: 'triceps-pushdown', name: 'Triceps Pushdown' },
            sets: 3,
            reps: '12-15',
            weightKg: 25,
            supersetId: 'arms',
          },
        ],
        supersets: [{ id: 'arms', restSec: 90 }],
      },
      {
        name: 'Lower',
        exercises: [
          {
            exercise: { kind: 'catalog', exerciseId: 'barbell-squat', name: 'Barbell Squat' },
            sets: 3,
            reps: '5',
            weightKg: 90,
            restSec: 180,
          },
          {
            exercise: { kind: 'catalog', exerciseId: 'plank', name: 'Plank' },
            sets: 3,
            durationSec: 40,
            restSec: 60,
          },
          {
            exercise: { kind: 'custom', customExerciseId: 'sled-push', name: 'Sled Push' },
            sets: 4,
            reps: '1',
            restSec: 120,
          },
        ],
      },
    ],
  },
  customExercises: [
    {
      id: 'sled-push',
      name: 'Sled Push',
      equipment: 'other',
      primaryMuscles: ['quadriceps'],
      instructions: ['Load the sled.', 'Push it 20 m.'],
    },
  ],
};

/** Chooses a plan file from the Plans tab. */
async function choosePlanFile(page: Page, name: string, text: string): Promise<void> {
  await page.getByTestId('tab-plans').click();
  await page.getByTestId('plan-file-input').setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
}

test('importing a generated plan adds it as an editable plan', async ({ page }) => {
  await openApp(page);
  await choosePlanFile(page, 'ai-upper-lower.json', JSON.stringify(file));

  await expect(page.getByTestId('page-title')).toHaveText('AI Upper/Lower');
  await expect(page.getByTestId('plan-day').locator('.day-name')).toHaveText(['Upper', 'Lower']);
  await expect(page.getByTestId('plan-exercise-target').first()).toHaveText(
    '4 × 5 · 72.5 kg · Rest 3 min',
  );
  await expect(page.getByTestId('plan-superset-summary')).toHaveText(
    '3 rounds · rest 90 s after each round',
  );
  // The catalog's name wins over the file's for an exercise the catalog has.
  await expect(page.getByTestId('plan-exercise-name')).toHaveText([
    'Barbell Bench Press - Medium Grip',
    'Dumbbell Flyes',
    'Triceps Pushdown',
    'Barbell Squat',
    'Plank',
    'Sled Push',
  ]);

  // The custom exercise of the file is in the app's exercises.
  await page.getByTestId('tab-exercises').click();
  await expect(page.getByTestId('custom-row')).toContainText('Sled Push');

  const stored = await readStoredUserData(page);
  expect(stored?.plans).toHaveLength(1);
  expect(stored?.plans[0]?.name).toBe('AI Upper/Lower');
  expect(stored?.customExercises.map((custom) => custom.name)).toEqual(['Sled Push']);

  // And it is saved: still there after reopening.
  await reopen(page);
  await openPlan(page, 'AI Upper/Lower');
  await expect(page.getByTestId('plan-exercise-target').first()).toHaveText(
    '4 × 5 · 72.5 kg · Rest 3 min',
  );
});

test('importing a second plan keeps the first one', async ({ page }) => {
  await openApp(page);
  await choosePlanFile(page, 'ai-upper-lower.json', JSON.stringify(file));
  await expect(page.getByTestId('page-title')).toHaveText('AI Upper/Lower');
  await choosePlanFile(page, 'ai-upper-lower.json', JSON.stringify(file));
  await expect(page.getByTestId('page-title')).toHaveText('AI Upper/Lower');
  await page.getByTestId('tab-plans').click();
  await expect(page.getByTestId('plan-link')).toHaveCount(2);
});

test('exporting a plan writes the same format back', async ({ page }) => {
  await openApp(page);
  await choosePlanFile(page, 'ai-upper-lower.json', JSON.stringify(file));
  await expect(page.getByTestId('page-title')).toHaveText('AI Upper/Lower');

  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByTestId('plan-export').click(),
  ]);
  expect(download.suggestedFilename()).toBe('openrep-plan-ai-upper-lower.json');
  await expect(page.getByTestId('plan-export-message')).toHaveText(
    'Plan file saved to your downloads.',
  );

  const exported = JSON.parse(await readFile(await download.path(), 'utf8')) as PlanFile;
  expect(exported).toMatchObject({ app: 'openrep', kind: 'plan', formatVersion: 1 });
  expect(exported.plan.name).toBe('AI Upper/Lower');
  expect(exported.plan.days.map((day) => day.name)).toEqual(['Upper', 'Lower']);
  expect(exported.plan.days[0]?.exercises[0]).toMatchObject({
    exercise: { kind: 'catalog', exerciseId: 'barbell-bench-press-medium-grip' },
    reps: '5',
    weightKg: 72.5,
    notes: 'Two warm-up sets first.',
  });
  expect(exported.plan.days[0]?.supersets).toEqual([expect.objectContaining({ restSec: 90 })]);
  expect(exported.customExercises?.map((custom) => custom.name)).toEqual(['Sled Push']);
});

test('an invalid plan file is rejected and changes nothing', async ({ page }) => {
  await openApp(page);
  // An entry needs exactly one of reps / durationSec; this one has neither.
  const invalid = {
    app: 'openrep',
    kind: 'plan',
    formatVersion: 1,
    plan: {
      name: 'Broken',
      days: [
        {
          name: 'Day 1',
          exercises: [
            {
              exercise: { kind: 'catalog', exerciseId: 'plank', name: 'Plank' },
              sets: 3,
            },
          ],
        },
      ],
    },
  };
  await choosePlanFile(page, 'broken.json', JSON.stringify(invalid));

  await expect(page.getByTestId('plan-import-error')).toHaveText(
    'This plan is damaged or incomplete and cannot be imported.',
  );
  expect((await readStoredUserData(page))?.plans ?? []).toEqual([]);
});
