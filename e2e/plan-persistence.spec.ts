/**
 * Verification "Plan persistence": a plan with 2 days × 3 exercises, its
 * targets set, is unchanged after closing and reopening the app.
 */
import { openApp, readStoredUserData, reopen } from './support/app.ts';
import { expect, test } from './support/fixtures.ts';
import { addExercise, createPlan, openPlan, planDayTexts } from './support/plans.ts';

interface Entry {
  query: string;
  id: string;
  name: string;
  /** Clicks on "More sets" from the default of 3. */
  moreSets: number;
  reps?: string;
  seconds?: string;
  weight?: string;
  rest?: string;
  notes?: string;
  /** How the plan shows the target. */
  shown: string;
}

const DAYS: { name: string; entries: Entry[] }[] = [
  {
    name: 'Push',
    entries: [
      {
        query: 'bench press',
        id: 'barbell-bench-press-medium-grip',
        name: 'Barbell Bench Press - Medium Grip',
        moreSets: 1,
        reps: '6-8',
        weight: '60',
        rest: '120',
        notes: 'Pause on the chest',
        shown: '4 × 6–8 · 60 kg · Rest 2 min',
      },
      {
        query: 'ohp',
        id: 'standing-military-press',
        name: 'Standing Military Press',
        moreSets: 0,
        reps: '8',
        weight: '35.5',
        shown: '3 × 8 · 35.5 kg',
      },
      {
        query: 'cable pushdown',
        id: 'triceps-pushdown',
        name: 'Triceps Pushdown',
        moreSets: 2,
        reps: '10-12',
        rest: '60',
        shown: '5 × 10–12 · Rest 1 min',
      },
    ],
  },
  {
    name: 'Legs',
    entries: [
      {
        query: 'back squat',
        id: 'barbell-squat',
        name: 'Barbell Squat',
        moreSets: 0,
        reps: '5',
        weight: '100',
        rest: '180',
        shown: '3 × 5 · 100 kg · Rest 3 min',
      },
      {
        query: 'rdl',
        id: 'romanian-deadlift',
        name: 'Romanian Deadlift',
        moreSets: 0,
        reps: '8-10',
        weight: '80',
        notes: 'Soft knees',
        shown: '3 × 8–10 · 80 kg',
      },
      {
        query: 'plank',
        id: 'plank',
        name: 'Plank',
        moreSets: 0,
        seconds: '45',
        shown: '3 × 45 s',
      },
    ],
  },
];

test('a plan with 2 days × 3 exercises is unchanged after reopening the app', async ({ page }) => {
  await openApp(page);
  await createPlan(page, 'Persistence Plan');

  for (const [dayIndex, day] of DAYS.entries()) {
    if (dayIndex > 0) await page.getByTestId('add-day').click();
    const dayCard = page.getByTestId('edit-day').nth(dayIndex);
    await dayCard.getByTestId('day-name-input').fill(day.name);

    for (const [index, entry] of day.entries.entries()) {
      await addExercise(page, dayIndex, entry.query, entry.id);
      const editor = page
        .getByTestId('edit-day')
        .nth(dayIndex)
        .getByTestId('edit-exercise')
        .nth(index);
      await expect(editor.getByTestId('edit-exercise-name')).toHaveText(entry.name);
      for (let i = 0; i < entry.moreSets; i++) await editor.getByTestId('target-sets-inc').click();
      if (entry.seconds !== undefined) {
        await editor.getByTestId('target-mode-time').click();
        await editor.getByTestId('target-duration').fill(entry.seconds);
      }
      if (entry.reps !== undefined) await editor.getByTestId('target-reps').fill(entry.reps);
      if (entry.weight !== undefined) await editor.getByTestId('target-weight').fill(entry.weight);
      if (entry.rest !== undefined) await editor.getByTestId('target-rest').fill(entry.rest);
      if (entry.notes !== undefined) await editor.getByTestId('target-notes').fill(entry.notes);
    }
  }
  await page.getByTestId('editor-done').click();

  // The plan as entered.
  const days = page.getByTestId('plan-day');
  await expect(days).toHaveCount(2);
  for (const [dayIndex, day] of DAYS.entries()) {
    const card = days.nth(dayIndex);
    await expect(card.locator('.day-name')).toHaveText(day.name);
    const exercises = card.getByTestId('plan-exercise');
    await expect(exercises).toHaveCount(3);
    for (const [index, entry] of day.entries.entries()) {
      await expect(exercises.nth(index).getByTestId('plan-exercise-name')).toHaveText(entry.name);
      await expect(exercises.nth(index).getByTestId('plan-exercise-target')).toHaveText(
        entry.shown,
      );
      if (entry.notes) await expect(exercises.nth(index)).toContainText(entry.notes);
    }
  }
  const shownBefore = await planDayTexts(page);
  const storedBefore = await readStoredUserData(page);

  await reopen(page);
  await openPlan(page, 'Persistence Plan');

  expect(await planDayTexts(page)).toEqual(shownBefore);
  const storedAfter = await readStoredUserData(page);
  expect(storedAfter?.plans).toEqual(storedBefore?.plans);
  expect(storedAfter?.plans).toHaveLength(1);
  expect(storedAfter?.plans[0]?.days.map((day) => day.exercises.length)).toEqual([3, 3]);
});
