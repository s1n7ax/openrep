import { readdirSync, readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { InvalidPlanFileError, parsePastedPlan, parsePlanFile } from './planFile.ts';
import {
  buildSchedulePrompt,
  LOGGED_LIFTS_LIMIT,
  type SchedulePromptInput,
} from './schedulePrompt.ts';
import type { Equipment } from './schema/common.ts';
import type { Exercise } from './schema/exercise.ts';
import type { CustomExercise, Plan, ScheduleAnswers, Session } from './schema/userData.ts';
import { emptyScheduleAnswers } from './userData/scheduleAnswers.ts';

const NOW = new Date('2026-06-01T10:00:00.000Z');

function exercise(id: string, equipment: Equipment | null): Exercise {
  return {
    formatVersion: 1,
    id,
    name: id,
    aliases: [],
    category: 'strength',
    level: 'beginner',
    force: null,
    mechanic: null,
    equipment,
    primaryMuscles: ['chest'],
    secondaryMuscles: [],
    instructions: [],
    images: [],
    source: { name: 'community' },
  };
}

const catalog = [
  exercise('dumbbell-press', 'dumbbell'),
  exercise('barbell-press', 'barbell'),
  exercise('leg-machine', 'machine'),
  exercise('pushups', 'body only'),
  exercise('calf-stretch', null),
  exercise('band-pull', 'bands'),
];

/** A finished session, started at `startedAt`, with one exercise and these sets. */
function session(
  id: string,
  startedAt: string,
  name: string,
  sets: { weightKg: number | null; reps: number | null; durationSec?: number; done?: boolean }[],
): Session {
  return {
    id,
    planId: null,
    planName: 'Plan',
    dayId: null,
    dayName: 'Day',
    startedAt,
    finishedAt: startedAt,
    exercises: [
      {
        id: `${id}-e`,
        exercise: { kind: 'catalog', exerciseId: name.toLowerCase(), name },
        target: { sets: sets.length, reps: '8' },
        sets: sets.map((set, index) => ({
          id: `${id}-${index}`,
          weightKg: set.weightKg,
          reps: set.reps,
          durationSec: set.durationSec ?? null,
          done: set.done ?? true,
        })),
      },
    ],
  };
}

function prompt(
  answers: Partial<ScheduleAnswers> = {},
  input: Partial<SchedulePromptInput> = {},
): string {
  return buildSchedulePrompt({
    answers: { ...emptyScheduleAnswers(), ...answers },
    unit: 'kg',
    exercises: catalog,
    sessions: [],
    now: NOW,
    ...input,
  });
}

/** The lines of one "## " section of a prompt. */
function section(text: string, title: string): string {
  const start = text.indexOf(`## ${title}\n`);
  expect(start, `section "${title}"`).toBeGreaterThanOrEqual(0);
  const end = text.indexOf('\n## ', start + 1);
  return text.slice(start, end === -1 ? undefined : end);
}

const FILLED: ScheduleAnswers = {
  equipment: ['dumbbell', 'bands'],
  extraEquipment: ['Bench', 'Pull-up bar'],
  basePlanId: null,
  planChanges: [],
  goal: 'Build muscle',
  injuryPicks: ['left-knee', 'tennis-elbow'],
  injuries: 'Sore right shoulder',
  daysPerWeek: '4',
  sessionMinutes: '75',
  weekLayout: '2 on, 1 off, 2 on',
  split: 'Upper/lower',
  supersets: 'Yes',
  experience: '3+ years',
  strengthLevel: 'Intermediate',
  bodyWeightKg: 82.5,
  targetWeightKg: 78,
  age: '31',
  sex: 'Male',
  height: '178 cm',
  avoidExercises: '',
  includeExercises: '',
  avoidList: [{ exerciseId: 'barbell-curl', name: 'Barbell Curl' }, { name: 'Burpees' }],
  includeList: [{ exerciseId: 'pullups', name: 'Pullups' }],
  priorityMuscles: ['lats', 'lower back'],
  sports: ['Volleyball', 'Padel'],
  otherSports: 'Volleyball after the gym',
  notes: 'I restarted last week',
};

describe('buildSchedulePrompt', () => {
  it('states every answer', () => {
    const about = section(prompt(FILLED), 'About me');
    expect(about.split('\n').slice(2)).toEqual([
      '- Equipment: Bands, Dumbbell, Bodyweight, Bench, Pull-up bar',
      '- Main goal: Build muscle',
      '- Training days per week: 4',
      '- Time per session: 75 minutes',
      '- Week layout: 2 on, 1 off, 2 on',
      '- Split: Upper/lower',
      '- Supersets: use them where they fit',
      '- Training experience: 3+ years',
      '- Strength level: Intermediate',
      '- Body weight: 82.5 kg',
      '- Target weight: 78 kg',
      '- Age: 31',
      '- Sex: Male',
      '- Height: 178 cm',
      '- Injuries: Left knee, Tennis elbow, Sore right shoulder',
      '- Exercises to avoid: Barbell Curl, Burpees',
      '- Exercises to include: Pullups',
      '- Muscles to prioritise: Lats, Lower back',
      '- Other sports: Volleyball, Padel, Volleyball after the gym',
      '- Anything else: I restarted last week',
      '',
    ]);
  });

  it('leaves blank answers out, keeping only what is always known', () => {
    const blank = prompt({ goal: 'Lose fat', injuries: '   ' });
    expect(section(blank, 'About me').split('\n').slice(2)).toEqual([
      '- Equipment: Bodyweight',
      '- Main goal: Lose fat',
      '',
    ]);
    expect(blank).not.toContain('Injuries');
    expect(blank).not.toContain('Target weight');
  });

  it('still states exercises typed into the first version of the form', () => {
    const about = section(
      prompt({ includeExercises: 'Deadlifts', includeList: [{ name: 'Squats' }] }),
      'About me',
    );
    expect(about).toContain('- Exercises to include: Squats, Deadlifts');
  });

  it('says not to use supersets when the user said no', () => {
    expect(prompt({ supersets: 'No' })).toContain('- Supersets: do not use them');
  });

  it('flattens free text onto one line', () => {
    expect(prompt({ injuries: '  Left knee\n\n  Right wrist ' })).toContain(
      '- Injuries: Left knee Right wrist',
    );
  });

  it('gives weights in the user unit', () => {
    const about = section(
      prompt({ bodyWeightKg: 80, targetWeightKg: 75 }, { unit: 'lb' }),
      'About me',
    );
    expect(about).toContain('- Body weight: 176.4 lb');
    expect(about).toContain('- Target weight: 165.3 lb');
  });

  it('lists the exercises of the chosen equipment and bodyweight ones, and no others', () => {
    const list = section(prompt({ equipment: ['dumbbell'] }), 'Exercises');
    expect(list).toContain('### Dumbbell\n\ndumbbell-press: chest');
    expect(list).toContain('### Bodyweight\n\npushups: chest\ncalf-stretch: chest');
    expect(list).not.toContain('barbell-press');
    expect(list).not.toContain('leg-machine');
    expect(list).not.toContain('band-pull');
  });

  it('lists only bodyweight exercises when no equipment is chosen', () => {
    const list = section(prompt(), 'Exercises');
    expect(list).toContain('pushups: chest');
    expect(list).not.toContain('dumbbell-press');
  });

  it('does not depend on a link', () => {
    expect(prompt(FILLED)).not.toMatch(/https?:/);
  });

  it('carries a format example the app accepts once its placeholder is filled in', () => {
    const example = /```json\n([\s\S]*?)```/.exec(prompt())?.[1];
    expect(example).toBeDefined();
    const filled = example!.replaceAll('<id from the list>', 'pushups');
    expect(parsePlanFile(filled).plan.days[0]?.supersets).toEqual([{ id: 'pair', restSec: 90 }]);
  });

  it('does not import as a plan when pasted back by mistake', () => {
    expect(() => parsePastedPlan(prompt(FILLED))).toThrow(InvalidPlanFileError);
  });

  it('gives way to the real plan when pasted back along with the reply', () => {
    const plan = {
      app: 'openrep',
      kind: 'plan',
      formatVersion: 1,
      plan: { name: 'Real plan', days: [{ name: 'Day 1', exercises: [] }] },
    };
    const chat = `${prompt(FILLED)}\n\`\`\`json\n${JSON.stringify(plan)}\n\`\`\``;
    expect(parsePastedPlan(chat).plan.name).toBe('Real plan');
  });

  it('describes the custom exercise form the app accepts', () => {
    const text = prompt();
    const customs = /`"customExercises": (\[.*?\])`/.exec(text)?.[1];
    const reference = /`(\{ "kind": "custom".*?\})`/.exec(text)?.[1];
    expect(customs).toBeDefined();
    expect(reference).toBeDefined();
    const file = parsePlanFile(
      JSON.stringify({
        app: 'openrep',
        kind: 'plan',
        formatVersion: 1,
        plan: {
          name: 'Plan',
          days: [
            { name: 'Day', exercises: [{ exercise: JSON.parse(reference!), sets: 1, reps: '5' }] },
          ],
        },
        customExercises: JSON.parse(customs!),
      }),
    );
    expect(file.customExercises).toHaveLength(1);
  });

  it('includes the real catalog for a full gym within a size a chat can take', () => {
    const real = readdirSync('data/exercises')
      .filter((file) => file.endsWith('.json'))
      .map((file) => JSON.parse(readFileSync(`data/exercises/${file}`, 'utf8')) as Exercise);
    const text = prompt(
      {
        equipment: [
          'bands',
          'barbell',
          'cable',
          'dumbbell',
          'e-z curl bar',
          'exercise ball',
          'foam roll',
          'kettlebells',
          'machine',
          'medicine ball',
          'other',
        ],
      },
      { exercises: real },
    );
    for (const { id } of real) expect(text).toContain(`\n${id}: `);
    expect(text.length).toBeLessThan(45_000);
  });

  describe('the plan to build on', () => {
    const plan: Plan = {
      id: 'p1',
      name: 'My PPL',
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-02T10:00:00.000Z',
      days: [
        {
          id: 'd1',
          name: 'Push',
          exercises: [
            {
              id: 'e1',
              exercise: { kind: 'catalog', exerciseId: 'dumbbell-press', name: 'Dumbbell Press' },
              sets: 3,
              reps: '8-12',
              weightKg: 30,
              restSec: 90,
              supersetId: 's1',
            },
            {
              id: 'e2',
              exercise: { kind: 'custom', customExerciseId: 'c1', name: 'Landmine Press' },
              sets: 3,
              durationSec: 40,
              supersetId: 's1',
            },
          ],
          supersets: [{ id: 's1', restSec: 60 }],
        },
      ],
    };
    const custom: CustomExercise = {
      id: 'c1',
      name: 'Landmine Press',
      notes: '',
      equipment: 'barbell',
      primaryMuscles: ['shoulders'],
      secondaryMuscles: [],
      instructions: ['Press the bar up.'],
      createdAt: '2026-05-01T10:00:00.000Z',
      updatedAt: '2026-05-01T10:00:00.000Z',
    };
    const withPlan = (answers: Partial<ScheduleAnswers> = {}) =>
      prompt(
        { ...FILLED, basePlanId: 'p1', ...answers },
        { plans: [plan], customExercises: [custom] },
      );

    it('is left out when starting fresh, or when the plan is gone', () => {
      expect(prompt(FILLED, { plans: [plan] })).not.toContain('My current plan');
      expect(prompt({ basePlanId: 'deleted' }, { plans: [plan] })).not.toContain('My current plan');
    });

    it('carries the plan in the reply format, without ids or timestamps', () => {
      const text = withPlan();
      const current = section(text, 'My current plan');
      const json = /```json\n([\s\S]*?)```/.exec(current)?.[1];
      expect(JSON.parse(json!)).toEqual({
        plan: {
          name: 'My PPL',
          days: [
            {
              name: 'Push',
              exercises: [
                {
                  exercise: {
                    kind: 'catalog',
                    exerciseId: 'dumbbell-press',
                    name: 'Dumbbell Press',
                  },
                  sets: 3,
                  reps: '8-12',
                  weightKg: 30,
                  restSec: 90,
                  supersetId: 's1',
                },
                {
                  exercise: { kind: 'custom', customExerciseId: 'c1', name: 'Landmine Press' },
                  sets: 3,
                  durationSec: 40,
                  supersetId: 's1',
                },
              ],
              supersets: [{ id: 's1', restSec: 60 }],
            },
          ],
        },
        customExercises: [
          {
            id: 'c1',
            name: 'Landmine Press',
            notes: '',
            equipment: 'barbell',
            primaryMuscles: ['shoulders'],
            secondaryMuscles: [],
            instructions: ['Press the bar up.'],
          },
        ],
      });
      expect(section(text, 'How to build the plan')).toContain(
        '- Start from my current plan, and reply with the whole new plan, under a new name.',
      );
    });

    it('says what to change, picked and typed', () => {
      expect(
        section(
          withPlan({ planChanges: ['Progress the weights', 'Harder legs'] }),
          'My current plan',
        ),
      ).toContain('What I want changed: Progress the weights, Harder legs.');
      expect(section(withPlan(), 'My current plan')).not.toContain('What I want changed');
    });

    it('comes before the plan file format', () => {
      const text = withPlan();
      expect(text.indexOf('## My current plan')).toBeLessThan(text.indexOf('## Plan file format'));
    });

    it('does not import as a plan when the prompt is pasted back by mistake', () => {
      expect(() => parsePastedPlan(withPlan())).toThrow(InvalidPlanFileError);
    });
  });

  describe('logged lifts', () => {
    it('leaves the section out without history', () => {
      expect(prompt()).not.toContain('logged lifts');
    });

    it('gives the best recent set of each exercise, newest first, in the user unit', () => {
      const text = prompt(
        {},
        {
          unit: 'lb',
          sessions: [
            session('old', '2026-05-01T10:00:00.000Z', 'Bench', [
              { weightKg: 60, reps: 8 },
              { weightKg: 70, reps: 5 },
            ]),
            session('new', '2026-05-20T10:00:00.000Z', 'Squat', [{ weightKg: 100, reps: 5 }]),
            session('mid', '2026-05-10T10:00:00.000Z', 'Bench', [{ weightKg: 65, reps: 5 }]),
          ],
        },
      );
      expect(section(text, 'My logged lifts').split('\n').slice(4)).toEqual([
        '- Squat: 220.5 lb × 5',
        '- Bench: 154.3 lb × 5',
        '',
      ]);
    });

    it('does not take a failed lift for the best set', () => {
      const text = prompt(
        {},
        {
          sessions: [
            session('s', '2026-05-20T10:00:00.000Z', 'Bench', [
              { weightKg: 90, reps: 5 },
              { weightKg: 100, reps: 0 },
            ]),
          ],
        },
      );
      expect(text).toContain('- Bench: 90 kg × 5');
    });

    it('ignores sessions older than the window and sets not done', () => {
      const text = prompt(
        {},
        {
          sessions: [
            session('ancient', '2026-01-01T10:00:00.000Z', 'Bench', [{ weightKg: 90, reps: 5 }]),
            session('skipped', '2026-05-20T10:00:00.000Z', 'Row', [
              { weightKg: 60, reps: 8, done: false },
            ]),
          ],
        },
      );
      expect(text).not.toContain('logged lifts');
    });

    it('covers at most the limit of exercises', () => {
      const sessions = Array.from({ length: LOGGED_LIFTS_LIMIT + 5 }, (_, index) =>
        session(
          `s${index}`,
          `2026-05-20T10:00:${String(index).padStart(2, '0')}.000Z`,
          `L${index}`,
          [{ weightKg: 50, reps: 5 }],
        ),
      );
      const lifts = section(prompt({}, { sessions }), 'My logged lifts');
      expect(lifts.match(/^- /gm)).toHaveLength(LOGGED_LIFTS_LIMIT);
    });
  });
});
