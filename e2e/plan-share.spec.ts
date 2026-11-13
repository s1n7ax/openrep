/**
 * Verification "Plans from an AI assistant": a reply shared to the app from
 * Android's share sheet, or pasted, shows a preview of its plan and adds it on
 * "Add plan"; text holding no valid plan says so and changes nothing;
 * exercises not in the catalog come in by name; and nothing the user already
 * has changes.
 */
import type { PlanFile } from '../src/lib/schema/planFile.ts';
import { asAndroid, shareToApp } from './support/android.ts';
import { openApp, readStoredUserData } from './support/app.ts';
import { expect, test } from './support/fixtures.ts';
import { seedUserData } from './support/seed.ts';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const plan: PlanFile = {
  app: 'openrep',
  kind: 'plan',
  formatVersion: 1,
  plan: {
    name: '3-Day Beginner Full Body',
    days: [
      {
        name: 'Day A',
        exercises: [
          {
            exercise: { kind: 'catalog', exerciseId: 'barbell-squat', name: 'Barbell Squat' },
            sets: 3,
            reps: '8-10',
            restSec: 120,
          },
          {
            // An id the catalog does not have, for an exercise it has under that name.
            exercise: { kind: 'catalog', exerciseId: 'push-up', name: 'Pushups' },
            sets: 3,
            reps: '10',
          },
          {
            // Not in the catalog at all.
            exercise: { kind: 'catalog', exerciseId: 'backpack-step-up', name: 'Backpack Step-Up' },
            sets: 4,
            durationSec: 30,
          },
        ],
      },
      {
        name: 'Day B',
        exercises: [
          {
            exercise: { kind: 'custom', customExerciseId: 'farmer-carry', name: 'Farmer Carry' },
            sets: 3,
            durationSec: 40,
          },
        ],
      },
    ],
  },
};

/** How Gemini answers: chat text around a fenced JSON block. */
const geminiReply = `Here is your plan:\n\n\`\`\`json\n${JSON.stringify(plan, null, 2)}\n\`\`\`\n\nHave a good workout!`;

test(
  'a reply shared as the app launches is previewed, then added',
  { tag: '@smoke' },
  async ({ page }) => {
    await asAndroid(page, { launchShare: geminiReply });
    await openApp(page);

    await expect(page.getByTestId('page-title')).toHaveText('Shared plan');
    await expect(page.getByTestId('plan-preview-name')).toHaveText('3-Day Beginner Full Body');
    await expect(page.getByTestId('plan-preview-day')).toHaveCount(2);
    await expect(page.getByTestId('plan-preview-exercise')).toHaveText([
      'Barbell Squat',
      'Pushups',
      'Backpack Step-Up',
      'Farmer Carry',
    ]);
    // Previewing adds nothing.
    expect((await readStoredUserData(page))?.plans ?? []).toEqual([]);

    await page.getByTestId('creator-import').click();

    await expect(page.getByTestId('page-title')).toHaveText('3-Day Beginner Full Body');
    const stored = await readStoredUserData(page);
    expect(stored?.plans.map((entry) => entry.name)).toEqual(['3-Day Beginner Full Body']);
  },
);

test('exercises not in the catalog are imported by name', async ({ page }) => {
  await asAndroid(page, { launchShare: geminiReply });
  await openApp(page);

  // Backpack Step-Up and Farmer Carry are not in the catalog; Pushups is, under another id.
  await expect(page.getByTestId('plan-preview-new')).toHaveCount(2);
  await page.getByTestId('creator-import').click();
  await expect(page.getByTestId('page-title')).toHaveText('3-Day Beginner Full Body');

  const stored = await readStoredUserData(page);
  const [dayA, dayB] = stored!.plans[0]!.days;
  expect(dayA!.exercises.map((entry) => entry.exercise)).toEqual([
    { kind: 'catalog', exerciseId: 'barbell-squat', name: 'Barbell Squat' },
    { kind: 'catalog', exerciseId: 'pushups', name: 'Pushups' },
    expect.objectContaining({ kind: 'custom', name: 'Backpack Step-Up' }),
  ]);
  expect(dayB!.exercises[0]!.exercise).toMatchObject({ kind: 'custom', name: 'Farmer Carry' });
  expect(stored!.customExercises.map((custom) => custom.name).sort()).toEqual([
    'Backpack Step-Up',
    'Farmer Carry',
  ]);
  await expect(page.getByTestId('plan-exercise-name')).toContainText(['Backpack Step-Up']);
});

test('a reply shared while the app is open leaves everything else as it was', async ({ page }) => {
  await asAndroid(page);
  await openApp(page);
  await seedUserData(page);
  const before = await readStoredUserData(page);

  await shareToApp(page, geminiReply);
  await expect(page.getByTestId('plan-preview-name')).toHaveText('3-Day Beginner Full Body');
  await page.getByTestId('creator-import').click();
  await expect(page.getByTestId('page-title')).toHaveText('3-Day Beginner Full Body');

  const after = await readStoredUserData(page);
  expect(after!.plans.slice(0, -1)).toEqual(before!.plans);
  expect(after!.plans.at(-1)!.name).toBe('3-Day Beginner Full Body');
  expect(after!.sessions).toEqual(before!.sessions);
  expect(after!.settings).toEqual(before!.settings);
  expect(after!.customExercises.slice(0, before!.customExercises.length)).toEqual(
    before!.customExercises,
  );
});

test('a shared reply with invalid or partial JSON says so and changes nothing', async ({
  page,
}) => {
  await asAndroid(page);
  await openApp(page);

  // Cut off mid-answer.
  await shareToApp(page, geminiReply.slice(0, geminiReply.length / 2));
  await expect(page.getByTestId('creator-paste-error')).toHaveText(
    'This text is not an OpenRep plan, or it is damaged.',
  );
  await expect(page.getByTestId('plan-preview')).toHaveCount(0);

  // A plan with a set count out of range.
  const invalid = structuredClone(plan);
  invalid.plan.days[0]!.exercises[0]!.sets = 0;
  await shareToApp(page, JSON.stringify(invalid));
  await expect(page.getByTestId('creator-paste-error')).toHaveText(
    'This plan is damaged or incomplete and cannot be imported.',
  );
  await page.getByTestId('creator-import').click();

  await expect(page.getByTestId('page-title')).toHaveText('Shared plan');
  expect((await readStoredUserData(page))?.plans ?? []).toEqual([]);
});

test('a pasted reply is previewed before it is added', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('tab-schedules').click();
  await page.getByTestId('schedule-creator-paste-open').click();

  await page.getByTestId('creator-paste').fill(geminiReply);
  await expect(page.getByTestId('plan-preview-name')).toHaveText('3-Day Beginner Full Body');
  await expect(page.getByTestId('plan-preview-exercise')).toHaveCount(4);
  expect((await readStoredUserData(page))?.plans ?? []).toEqual([]);

  await page.getByTestId('creator-import').click();
  await expect(page.getByTestId('page-title')).toHaveText('3-Day Beginner Full Body');
  expect((await readStoredUserData(page))?.plans).toHaveLength(1);
});

test('the paste screen copies a short prompt for an assistant', async ({ page }) => {
  await openApp(page, '#/schedule-creator/paste');

  await page.getByTestId('paste-prompt-copy').click();

  await expect(page.getByTestId('paste-prompt-copied')).toBeVisible();
  const prompt = await page.evaluate(() => navigator.clipboard.readText());
  expect(prompt).toContain('"app": "openrep"');
  expect(prompt).toMatch(/## The plan I want\n\n$/);
});
