/**
 * Verifications "Schedule creator" and "Paste a plan": the creator is filled
 * in step by step by tapping — popular answers, pictures of equipment, the
 * body, exercises by photo, a plan to build on — with typed answers next to
 * them; the answers become a prompt that can be copied and survive a
 * restart, and an AI assistant's reply pasted back becomes a new plan; a
 * reply that holds no plan changes nothing.
 */
import type { Page } from '@playwright/test';
import type { Backup } from '../src/lib/schema/backup.ts';
import type { PlanFile } from '../src/lib/schema/planFile.ts';
import { emptyUserData } from '../src/lib/schema/userData.ts';
import { androidBack, asAndroid } from './support/android.ts';
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

/** Expects the creator to show the step `key`. */
async function expectStep(page: Page, key: string): Promise<void> {
  await expect(page.getByTestId('creator-step')).toHaveAttribute('data-step', key);
}

/** Taps Next (or Skip) until the creator shows the step `key`. */
async function toStep(page: Page, key: string): Promise<void> {
  for (let tries = 0; tries < 10; tries += 1) {
    if ((await page.getByTestId('creator-step').getAttribute('data-step')) === key) return;
    await page.getByTestId('creator-next').click();
  }
  await expectStep(page, key);
}

/** From the first step, answers what the creator requires and ends at the review. */
async function answerRequired(page: Page): Promise<void> {
  await expectStep(page, 'start');
  await toStep(page, 'goal');
  await page.getByTestId('creator-goal-build-muscle').click();
  await toStep(page, 'week');
  await page.getByTestId('creator-days-4').click();
  await page.getByTestId('creator-minutes-60').click();
  await toStep(page, 'you');
  await page.getByTestId('creator-experience-3-years').click();
  await toStep(page, 'review');
}

/** Taps a muscle group (on its first shape) or an injury spot of the body figure. */
async function tapBody(page: Page, testid: string): Promise<void> {
  const area = page.getByTestId(testid);
  const shapes = area.locator('path');
  await ((await shapes.count()) > 0 ? shapes.first() : area).click();
  await expect(area).toHaveAttribute('aria-pressed', 'true');
}

/** Picks the catalog exercise `exerciseId`, found by `query`, into the include or avoid list. */
async function pickExercise(
  page: Page,
  list: 'include' | 'avoid',
  query: string,
  exerciseId: string,
): Promise<void> {
  await page.getByTestId(`creator-${list}-add`).click();
  await page.getByTestId('exercise-search').fill(query);
  await page.locator(`[data-testid="exercise-row"][data-exercise-id="${exerciseId}"]`).click();
  await expectStep(page, 'exercises');
}

test(
  'tapping through the steps makes a prompt, and the reply pasted back becomes a plan',
  { tag: '@smoke' },
  async ({ page }) => {
    await openApp(page);
    await openCreator(page);
    await expect(page.getByTestId('creator-plan-empty')).toBeVisible();
    await page.getByTestId('creator-next').click();

    await page.getByTestId('creator-goal-build-muscle').click();
    await page.getByTestId('creator-next').click();

    await page.getByTestId('creator-days-4').click();
    await page.getByTestId('creator-minutes-60').click();
    await page.getByTestId('creator-layout-weekdays-only').click();
    await page.getByTestId('creator-next').click();

    await expectStep(page, 'equipment');
    await expect(page.getByTestId('creator-next')).toHaveText('Skip');
    await page.getByTestId('creator-equipment-dumbbell').click();
    await page.getByTestId('creator-extra-bench').click();
    await expect(page.getByTestId('creator-next')).toHaveText('Next');
    // Every popular extra is a picture with its name, like the equipment.
    await expect(page.locator('[data-testid^="creator-extra-"] svg.equipment-picture')).toHaveCount(
      10,
    );
    // Dumbbells and a bench are the "Home dumbbells" setup, until more is added.
    await expect(page.getByTestId('equipment-preset-1')).toHaveAttribute('aria-pressed', 'true');
    // Typing a pictured extra picks its picture instead of adding it twice.
    await page.getByTestId('creator-extra-own').click();
    await page.getByTestId('creator-extra-input').fill('pull-up BAR');
    await page.getByTestId('creator-extra-input').press('Enter');
    await expect(page.getByTestId('creator-extra-pull-up-bar')).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('creator-extra-typed')).toHaveCount(0);
    await expect(page.getByTestId('equipment-preset-1')).toHaveAttribute('aria-pressed', 'false');
    await page.getByTestId('creator-next').click();

    await tapBody(page, 'creator-priority-chest-front');
    await tapBody(page, 'creator-priority-lats-back');
    await expect(page.getByTestId('creator-priority-picked')).toHaveText('Chest · Lats');
    await page.getByTestId('creator-next').click();

    await tapBody(page, 'creator-injury-left-knee');
    await expect(page.getByTestId('creator-injury-picked')).toHaveText('Left knee');
    await page.getByTestId('creator-injuries').fill('Sore right shoulder');
    await page.getByTestId('creator-next').click();

    await expectStep(page, 'exercises');
    await page.getByTestId('creator-next').click();

    await page.getByTestId('creator-sport-football').click();
    await page.getByTestId('creator-sport-own').click();
    await page.getByTestId('creator-sport-input').fill('Padel');
    await page.getByTestId('creator-sport-input').press('Enter');
    await expect(page.getByTestId('creator-sport-typed')).toHaveText('Padel');
    await page.getByTestId('creator-next').click();

    await page.getByTestId('creator-experience-3-years').click();
    await page.getByTestId('creator-bodyWeightKg').fill('82.5');
    await page.getByTestId('creator-next').click();

    await expectStep(page, 'review');
    await expect(page.getByTestId('creator-review-equipment')).toContainText(
      'Bodyweight, Dumbbell, Bench',
    );
    await page.getByTestId('creator-create').click();

    const prompt = page.getByTestId('creator-prompt');
    await expect(prompt).toHaveValue(/- Equipment: Dumbbell, Bodyweight, Bench/);
    const text = await prompt.inputValue();
    expect(text).toContain('- Main goal: Build muscle');
    expect(text).toContain('- Training days per week: 4');
    expect(text).toContain('- Week layout: Weekdays only');
    expect(text).toContain('- Muscles to prioritise: Chest, Lats');
    expect(text).toContain('- Injuries: Left knee, Sore right shoulder');
    expect(text).toContain('- Other sports: Football, Padel');
    expect(text).toContain('- Body weight: 82.5 kg');
    expect(text).toContain('\ndumbbell-flyes: ');
    expect(text).toContain('\npushups: ');
    expect(text).not.toContain('\nbarbell-squat: ');
    expect(text).not.toContain('- Target weight');
    expect(text).not.toContain('## My current plan');

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

test('a required answer left blank keeps the creator on its step', async ({ page }) => {
  await openApp(page);
  await openCreator(page);
  await page.getByTestId('creator-next').click();

  await expectStep(page, 'goal');
  await page.getByTestId('creator-next').click();
  await expect(page.getByTestId('creator-goal-error')).toBeVisible();
  await expectStep(page, 'goal');
  await page.getByTestId('creator-goal-own').click();
  await page.getByTestId('creator-goal-input').fill('Run a marathon');
  await page.getByTestId('creator-goal-input').press('Enter');
  await expect(page.getByTestId('creator-goal-error')).toHaveCount(0);
  await page.getByTestId('creator-next').click();

  await expectStep(page, 'week');
  await page.getByTestId('creator-days-3').click();
  await page.getByTestId('creator-next').click();
  await expect(page.getByTestId('creator-week-error')).toHaveText('Pick how long a session is.');
  // Only the missing answer is marked, not the optional ones next to it.
  const marked = page.locator('[data-invalid="true"]');
  await expect(marked).toHaveCount(1);
  await expect(marked.getByTestId('creator-minutes-45')).toBeVisible();
  await page.getByTestId('creator-minutes-45').click();
  await page.getByTestId('creator-next').click();

  await toStep(page, 'you');
  await page.getByTestId('creator-next').click();
  await expect(page.getByTestId('creator-experience-error')).toBeVisible();
  await page.getByTestId('creator-experience-new-to-lifting').click();

  // The keyboard's Done key in a field does not leave the step.
  await page.getByTestId('creator-bodyWeightKg').fill('80');
  await page.getByTestId('creator-bodyWeightKg').press('Enter');
  await expectStep(page, 'you');

  await page.getByTestId('creator-bodyWeightKg').fill('heavy');
  await expect(page.getByTestId('creator-bodyWeightKg-error')).toBeVisible();
  await page.getByTestId('creator-next').click();
  await expectStep(page, 'you');

  await page.getByTestId('creator-bodyWeightKg').fill('80');
  await page.getByTestId('creator-next').click();
  await page.getByTestId('creator-create').click();
  await expect(page.getByTestId('creator-prompt')).toHaveValue(/- Main goal: Run a marathon/);
});

test('exercises are picked by photo or typed, and reach the prompt', async ({ page }) => {
  await openApp(page);
  await openCreator(page);
  await answerRequired(page);
  await page.getByTestId('creator-review-exercises').click();

  await expectStep(page, 'exercises');
  await pickExercise(page, 'include', 'dumbbell flyes', 'dumbbell-flyes');
  await pickExercise(page, 'include', 'pushups', 'pushups');
  const included = page.getByTestId('creator-include-item');
  await expect(included).toHaveText(['Dumbbell Flyes', 'Pushups']);
  await expect(included.first().locator('img')).toBeVisible();

  await page.getByTestId('creator-avoid-add').click();
  await page.getByTestId('exercise-search').fill('Sandbag shouldering');
  await page.getByTestId('create-custom-from-query').click();
  await expect(page.getByTestId('creator-avoid-item')).toHaveText(['Sandbag shouldering']);

  await page.getByTestId('creator-include-remove').last().click();
  await expect(included).toHaveText(['Dumbbell Flyes']);

  await toStep(page, 'review');
  await expect(page.getByTestId('creator-review-exercises')).toContainText(
    'Want: Dumbbell Flyes · Avoid: Sandbag shouldering',
  );
  await page.getByTestId('creator-create').click();
  const prompt = page.getByTestId('creator-prompt');
  await expect(prompt).toHaveValue(/- Exercises to include: Dumbbell Flyes\n/);
  await expect(prompt).toHaveValue(/- Exercises to avoid: Sandbag shouldering\n/);
  expect((await readStoredUserData(page))?.customExercises).toEqual([]);
});

test('a prompt can build on a plan, whose reply is added as a new plan', async ({ page }) => {
  await openApp(page);
  await copySchedule(page, 'push-pull-legs');
  const original = (await readStoredUserData(page))!.plans[0]!;

  await openCreator(page);
  await page.locator(`[data-testid="creator-plan"][data-plan-id="${original.id}"]`).click();
  await page.getByTestId('creator-change-swap-in-new-exercises').click();
  await page.getByTestId('creator-next').click();
  await page.getByTestId('creator-goal-get-stronger').click();
  await page.getByTestId('creator-next').click();
  // The plan's three days are the first answer to days per week.
  await expect(page.getByTestId('creator-days-3')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('creator-minutes-75').click();
  await page.getByTestId('creator-next').click();
  // So is the equipment its exercises use.
  await expectStep(page, 'equipment');
  for (const item of ['barbell', 'cable', 'dumbbell', 'machine']) {
    await expect(page.getByTestId(`creator-equipment-${item}`)).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  }
  await expect(page.getByTestId('creator-equipment-bands')).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await toStep(page, 'you');
  await page.getByTestId('creator-experience-1-3-years').click();
  await toStep(page, 'review');
  await expect(page.getByTestId('creator-review-start')).toContainText(
    `${original.name} · Swap in new exercises`,
  );
  await page.getByTestId('creator-create').click();

  const text = await page.getByTestId('creator-prompt').inputValue();
  expect(text).toContain('## My current plan');
  expect(text).toContain('What I want changed: Swap in new exercises.');
  expect(text).toContain(`"name": "${original.name}"`);
  const first = original.days[0]!.exercises[0]!.exercise;
  expect(first.kind === 'catalog' && text.includes(`"exerciseId": "${first.exerciseId}"`)).toBe(
    true,
  );
  expect(text).toContain('- Start from my current plan');
  expect(text).toContain('- Equipment: Barbell, Cable, Dumbbell, Machine, Bodyweight');
  expect(text).toContain('- Keep the `weightKg` my current plan gives an exercise');
  expect(text).toContain('use only the ids listed above, or ones my current plan already uses.');

  // The prompt pasted back by mistake adds nothing.
  await page.getByTestId('creator-paste-open').click();
  await page.getByTestId('creator-paste').fill(text);
  await page.getByTestId('creator-import').click();
  await expect(page.getByTestId('creator-paste-error')).toBeVisible();

  await page.getByTestId('creator-paste').fill(JSON.stringify(reply));
  await page.getByTestId('creator-import').click();
  await expect(page.getByTestId('page-title')).toHaveText('Dumbbell Upper/Lower');
  const stored = await readStoredUserData(page);
  expect(stored?.plans.map((plan) => plan.name)).toEqual([original.name, 'Dumbbell Upper/Lower']);
  expect(stored?.plans[0]).toEqual(original);
});

test('switching the plan to build on switches what it filled in', async ({ page }) => {
  await openApp(page);
  const ppl = await copySchedule(page, 'push-pull-legs');
  const upperLower = await copySchedule(page, 'upper-lower');
  const plan = (id: string) => page.locator(`[data-testid="creator-plan"][data-plan-id="${id}"]`);
  const saved = async () => (await readStoredUserData(page))?.scheduleAnswers;

  await openCreator(page);
  await plan(ppl).click();
  await plan(upperLower).click();
  await page.getByTestId('creator-next').click();
  await page.getByTestId('creator-goal-get-stronger').click();
  await page.getByTestId('creator-next').click();
  // Upper/Lower's four days and its equipment, not Push/Pull/Legs'.
  await expect(page.getByTestId('creator-days-4')).toHaveAttribute('aria-checked', 'true');
  await page.getByTestId('creator-minutes-60').click();
  await page.getByTestId('creator-next').click();
  await expect(page.getByTestId('creator-equipment-e-z-curl-bar')).toHaveAttribute(
    'aria-pressed',
    'true',
  );

  // Starting fresh clears what the plan filled in, and keeps what was picked.
  for (const step of ['week', 'goal', 'start']) {
    await page.getByTestId('creator-previous').click();
    await expectStep(page, step);
  }
  await page.getByTestId('creator-plan-none').click();
  await expect
    .poll(saved)
    .toMatchObject({ basePlanId: null, daysPerWeek: '', equipment: [], sessionMinutes: '60' });

  // Days chosen by hand stay when a plan is picked.
  await page.getByTestId('creator-next').click();
  await page.getByTestId('creator-next').click();
  await page.getByTestId('creator-days-5').click();
  await page.getByTestId('creator-previous').click();
  await page.getByTestId('creator-previous').click();
  await plan(ppl).click();
  await expect.poll(saved).toMatchObject({
    basePlanId: ppl,
    daysPerWeek: '5',
    equipment: ['barbell', 'cable', 'dumbbell', 'machine'],
  });
});

test('the answers survive a restart, and weights follow the unit', async ({ page }) => {
  await openApp(page);
  await openCreator(page);
  await answerRequired(page);
  await page.getByTestId('creator-review-equipment').click();
  await page.getByTestId('creator-equipment-cable').click();
  await page.getByTestId('creator-next').click();
  await tapBody(page, 'creator-priority-lats-back');
  await toStep(page, 'you');
  await page.getByTestId('creator-bodyWeightKg').fill('80');
  await page.getByTestId('creator-targetWeightKg').fill('76');
  await page.getByTestId('creator-height').fill('180 cm');
  await page.getByTestId('creator-sex-male').click();
  await toStep(page, 'review');
  await expect(page.getByTestId('creator-review-you')).toContainText(
    '3+ years · 80 kg · target 76 kg · 180 cm · Male',
  );
  await page.getByTestId('creator-notes').fill('Restarted last week');

  await reopen(page);
  await openCreator(page);

  // Nothing required is missing, so the creator opens at the review.
  await expectStep(page, 'review');
  await expect(page.getByTestId('creator-review-goal')).toContainText('Build muscle');
  await expect(page.getByTestId('creator-review-equipment')).toContainText('Cable');
  await expect(page.getByTestId('creator-review-muscles')).toContainText('Lats');
  await expect(page.getByTestId('creator-notes')).toHaveValue('Restarted last week');
  await page.getByTestId('creator-review-equipment').click();
  await expect(page.getByTestId('creator-equipment-cable')).toHaveAttribute('aria-pressed', 'true');

  await page.getByTestId('tab-settings').click();
  await page.getByTestId('unit-lb').click();
  await openCreator(page);
  await page.getByTestId('creator-review-you').click();
  await expect(page.getByTestId('creator-bodyWeightKg')).toHaveValue('176.4');
  await toStep(page, 'review');
  await page.getByTestId('creator-create').click();
  await expect(page.getByTestId('creator-prompt')).toHaveValue(/- Body weight: 176\.4 lb/);
});

test('answers saved by the earlier form carry over', async ({ page }) => {
  await openApp(page);
  // Answers as the first version of the creator saved them: text boxes, no lists.
  const backup: Backup = {
    app: 'openrep',
    kind: 'backup',
    formatVersion: 1,
    exportedAt: '2026-10-01T10:00:00.000Z',
    data: {
      ...emptyUserData(),
      scheduleAnswers: {
        equipment: ['dumbbell'],
        goal: 'Lose fat',
        injuries: 'Bad knees',
        daysPerWeek: '3',
        sessionMinutes: '45',
        weekLayout: '',
        split: '',
        supersets: 'No',
        experience: 'Under 1 year',
        strengthLevel: '',
        bodyWeightKg: null,
        targetWeightKg: null,
        age: '',
        sex: '',
        height: '',
        avoidExercises: 'Burpees',
        includeExercises: 'Deadlifts, pull-ups',
        priorityMuscles: ['glutes'],
        otherSports: 'Volleyball on Sundays',
        notes: '',
      } as unknown as Backup['data']['scheduleAnswers'],
    },
  };
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('backup-file-input').setInputFiles({
    name: 'openrep-backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(backup)),
  });
  await page.getByTestId('confirm-ok').click();
  await expect(page.getByTestId('confirm-dialog')).toBeHidden();

  await openCreator(page);
  await expectStep(page, 'review');
  await expect(page.getByTestId('creator-review-exercises')).toContainText(
    'Want: Deadlifts, pull-ups · Avoid: Burpees',
  );
  await expect(page.getByTestId('creator-review-sports')).toContainText('Volleyball on Sundays');
  await page.getByTestId('creator-create').click();
  const text = await page.getByTestId('creator-prompt').inputValue();
  expect(text).toContain('- Main goal: Lose fat');
  expect(text).toContain('- Injuries: Bad knees');
  expect(text).toContain('- Exercises to include: Deadlifts, pull-ups');
  expect(text).toContain('- Exercises to avoid: Burpees');
  expect(text).toContain('- Muscles to prioritise: Glutes');
  expect(text).toContain('- Other sports: Volleyball on Sundays');
  expect(text).toContain('- Supersets: do not use them');
});

test("Android's back button goes back a step", async ({ page }) => {
  await asAndroid(page);
  await openApp(page);
  await openCreator(page);
  await toStep(page, 'goal');
  await page.getByTestId('creator-goal-lose-fat').click();
  await page.getByTestId('creator-next').click();
  await expectStep(page, 'week');

  await androidBack(page);
  await expectStep(page, 'goal');
  await androidBack(page);
  await expectStep(page, 'start');
  await androidBack(page);
  await expect(page.getByTestId('schedule-creator-open')).toBeVisible();

  // Opened again once complete, it starts at the review, which back leaves
  // at once; a step opened from the review goes back to the review.
  await page.getByTestId('schedule-creator-open').click();
  await toStep(page, 'week');
  await page.getByTestId('creator-days-3').click();
  await page.getByTestId('creator-minutes-30').click();
  await toStep(page, 'you');
  await page.getByTestId('creator-experience-under-1-year').click();
  await toStep(page, 'review');
  await page.getByTestId('tab-schedules').click();
  await page.getByTestId('schedule-creator-open').click();
  await expectStep(page, 'review');
  await androidBack(page);
  await expect(page.getByTestId('schedule-creator-open')).toBeVisible();
  await page.getByTestId('schedule-creator-open').click();
  await expectStep(page, 'review');
  await page.getByTestId('creator-review-sports').click();
  await expectStep(page, 'sports');
  await androidBack(page);
  await expectStep(page, 'review');
  await androidBack(page);
  await expect(page.getByTestId('schedule-creator-open')).toBeVisible();
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
