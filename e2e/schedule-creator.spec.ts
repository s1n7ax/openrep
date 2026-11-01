/**
 * Verifications "Schedule creator" and "Paste a plan": the answers become a
 * prompt that can be copied and survive a restart, and an AI assistant's reply
 * pasted back becomes a plan; a reply that holds no plan changes nothing.
 */
import type { Page } from '@playwright/test';
import type { PlanFile } from '../src/lib/schema/planFile.ts';
import { openApp, readStoredUserData, reopen } from './support/app.ts';
import { expect, test } from './support/fixtures.ts';
import { copySchedule, startDay } from './support/plans.ts';
import { changeAmounts, tickSet, typeWeight } from './support/workout.ts';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

const reply: PlanFile = {
  app: 'openrep',
  kind: 'plan',
  formatVersion: 1,
  plan: {
    name: 'Dumbbell Upper/Lower',
    days: [
      {
        name: 'Upper',
        exercises: [
          {
            exercise: { kind: 'catalog', exerciseId: 'dumbbell-flyes', name: 'Dumbbell Flyes' },
            sets: 3,
            reps: '8-12',
          },
        ],
      },
    ],
  },
};

/** Opens the creator from the Schedules tab. */
async function openCreator(page: Page): Promise<void> {
  await page.getByTestId('tab-schedules').click();
  await page.getByTestId('schedule-creator-open').click();
}

/** Answers what the form requires. */
async function answerRequired(page: Page): Promise<void> {
  await page.getByTestId('creator-goal').selectOption('Build muscle');
  await page.getByTestId('creator-daysPerWeek').selectOption('4');
  await page.getByTestId('creator-sessionMinutes').selectOption('60');
  await page.getByTestId('creator-experience').selectOption('3+ years');
}

test(
  'the answers become a prompt, and the reply pasted back becomes a plan',
  { tag: '@smoke' },
  async ({ page }) => {
    await openApp(page);
    await openCreator(page);

    await page.getByTestId('creator-equipment-dumbbell').click();
    await answerRequired(page);
    await page.getByTestId('creator-injuries').fill('Sore right shoulder');
    await page.getByTestId('creator-bodyWeightKg').fill('82.5');
    await page.getByTestId('creator-create').click();

    const prompt = page.getByTestId('creator-prompt');
    await expect(prompt).toHaveValue(/- Equipment: Dumbbell, Bodyweight/);
    const text = await prompt.inputValue();
    expect(text).toContain('- Main goal: Build muscle');
    expect(text).toContain('- Injuries: Sore right shoulder');
    expect(text).toContain('- Body weight: 82.5 kg');
    expect(text).toContain('\ndumbbell-flyes: ');
    expect(text).toContain('\npushups: ');
    expect(text).not.toContain('\nbarbell-squat: ');
    expect(text).not.toContain('- Target weight');

    await page.getByTestId('creator-copy').click();
    await expect(page.getByTestId('creator-copied')).toBeVisible();
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);

    await page.getByTestId('creator-paste-open').click();
    await page
      .getByTestId('creator-paste')
      .fill(`Here is your plan:\n\n\`\`\`json\n${JSON.stringify(reply)}\n\`\`\`\n\nEnjoy!`);
    await page.getByTestId('creator-import').click();

    await expect(page.getByTestId('page-title')).toHaveText('Dumbbell Upper/Lower');
    await expect(page.getByTestId('plan-exercise-name')).toHaveText(['Dumbbell Flyes']);
    const stored = await readStoredUserData(page);
    expect(stored?.plans.map((plan) => plan.name)).toEqual(['Dumbbell Upper/Lower']);
  },
);

test('a required answer left blank keeps the prompt from being made', async ({ page }) => {
  await openApp(page);
  await openCreator(page);

  await page.getByTestId('creator-create').click();

  await expect(page.getByTestId('creator-goal-error')).toBeVisible();
  await expect(page.getByTestId('creator-goal')).toBeFocused();
  await expect(page.getByTestId('creator-prompt')).toHaveCount(0);

  await answerRequired(page);
  await expect(page.getByTestId('creator-goal-error')).toHaveCount(0);
  await page.getByTestId('creator-bodyWeightKg').fill('heavy');
  await page.getByTestId('creator-create').click();
  await expect(page.getByTestId('creator-bodyWeightKg')).toBeFocused();
  await expect(page.getByTestId('creator-prompt')).toHaveCount(0);
});

test('the answers survive a restart, and weights follow the unit', async ({ page }) => {
  await openApp(page);
  await openCreator(page);
  await page.getByTestId('creator-equipment-cable').click();
  await page.getByTestId('creator-priority-lats').click();
  await answerRequired(page);
  await page.getByTestId('creator-bodyWeightKg').fill('80');
  await page.getByTestId('creator-notes').fill('Restarted last week');

  await reopen(page);
  await openCreator(page);

  await expect(page.getByTestId('creator-equipment-cable')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('creator-priority-lats')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByTestId('creator-goal')).toHaveValue('Build muscle');
  await expect(page.getByTestId('creator-bodyWeightKg')).toHaveValue('80');
  await expect(page.getByTestId('creator-notes')).toHaveValue('Restarted last week');

  await page.getByTestId('tab-settings').click();
  await page.getByTestId('unit-lb').click();
  await openCreator(page);
  await expect(page.getByTestId('creator-bodyWeightKg')).toHaveValue('176.4');
  await page.getByTestId('creator-create').click();
  await expect(page.getByTestId('creator-prompt')).toHaveValue(/- Body weight: 176\.4 lb/);
});

test('the prompt names logged lifts', async ({ page }) => {
  await openApp(page);
  await copySchedule(page, 'beginner-full-body');
  await startDay(page, 0);
  const exercise = page.getByTestId('workout-exercise').first();
  await typeWeight(exercise, 0, '60');
  await changeAmounts(exercise, { 0: '8' });
  await tickSet(exercise, 0);
  await page.getByTestId('workout-finish').click();
  await expect(page.getByTestId('history-set').first()).toContainText('60 kg × 8');

  await openCreator(page);
  await answerRequired(page);
  await page.getByTestId('creator-create').click();

  await expect(page.getByTestId('creator-prompt')).toHaveValue(/## My logged lifts/);
  await expect(page.getByTestId('creator-prompt')).toHaveValue(/\n- .+: 60 kg × 8\n/);
});

test('text that holds no plan is rejected and stays in the box', async ({ page }) => {
  await openApp(page);
  await page.getByTestId('tab-schedules').click();
  await page.getByTestId('schedule-creator-paste-open').click();

  await expect(page.getByTestId('creator-import')).toBeDisabled();
  await page.getByTestId('creator-paste').fill('Sorry, I cannot help with that.');
  await page.getByTestId('creator-import').click();

  await expect(page.getByTestId('creator-paste-error')).toHaveText(
    'This text is not an OpenRep plan, or it is damaged.',
  );
  await expect(page.getByTestId('creator-paste')).toHaveValue('Sorry, I cannot help with that.');
  expect((await readStoredUserData(page))?.plans ?? []).toEqual([]);
});

test('the paste box is on the Schedules tab after a restart', async ({ page }) => {
  await openApp(page);
  await openCreator(page);
  await answerRequired(page);
  await page.getByTestId('creator-create').click();
  await expect(page.getByTestId('creator-prompt')).toBeVisible();

  await page.goto('/#/');
  await reopen(page);
  await page.getByTestId('tab-schedules').click();
  await page.getByTestId('schedule-creator-paste-open').click();
  await page.getByTestId('creator-paste').fill(JSON.stringify(reply));
  await page.getByTestId('creator-import').click();

  await expect(page.getByTestId('page-title')).toHaveText('Dumbbell Upper/Lower');
});
