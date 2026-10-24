import { describe, expect, it } from 'vitest';
import {
  buildSubmitUrl,
  canSubmitCustomExercise,
  ContributionInvalidError,
  customExerciseToExercise,
  exerciseContribution,
  MAX_SUBMIT_URL_LENGTH,
  planToSchedule,
  randomSuffix,
  scheduleContribution,
  slugify,
  type ContributionProblem,
} from './contribute.ts';
import { ID_PATTERN } from './schema/common.ts';
import { exerciseSchema, type Exercise } from './schema/exercise.ts';
import { scheduleSchema } from './schema/schedule.ts';
import type { CustomExercise, Plan } from './schema/userData.ts';

const T0 = '2026-01-01T10:00:00.000Z';

const catalog = new Map<string, Pick<Exercise, 'id' | 'name'>>([
  ['barbell-squat', { id: 'barbell-squat', name: 'Barbell Squat' }],
  ['plank', { id: 'plank', name: 'Plank' }],
  ['zercher-squat', { id: 'zercher-squat', name: 'Zercher Squat' }],
]);
const findExercise = (id: string) => catalog.get(id) as Exercise | undefined;

const custom: CustomExercise = {
  id: 'c1',
  name: '  Landmine Press ',
  notes: 'my private notes',
  equipment: 'barbell',
  primaryMuscles: ['shoulders', 'shoulders'],
  secondaryMuscles: ['triceps', 'shoulders'],
  instructions: [' Hold the bar end at the shoulder. ', '', 'Press up and forward.'],
  createdAt: T0,
  updatedAt: T0,
};

function plan(overrides: Partial<Plan> = {}): Plan {
  return {
    id: 'p1',
    name: 'My Push / Pull Plan!',
    createdAt: T0,
    updatedAt: T0,
    days: [
      {
        id: 'd1',
        name: ' Heavy ',
        exercises: [
          {
            id: 'e1',
            exercise: { kind: 'catalog', exerciseId: 'barbell-squat', name: 'Squat' },
            sets: 5,
            reps: '5',
            weightKg: 140,
            restSec: 180,
            notes: '  Belt on  ',
          },
          {
            id: 'e2',
            exercise: { kind: 'custom', customExerciseId: 'c1', name: 'Old name' },
            sets: 3,
            reps: '8-10',
            notes: ' ',
          },
          {
            id: 'e3',
            exercise: { kind: 'catalog', exerciseId: 'removed-exercise', name: 'Removed One' },
            sets: 2,
            durationSec: 30,
          },
          {
            id: 'e4',
            exercise: { kind: 'custom', customExerciseId: 'deleted', name: 'Deleted custom' },
            sets: 1,
            reps: '12',
          },
        ],
      },
      { id: 'd2', name: 'Empty', exercises: [] },
      {
        id: 'd3',
        name: '',
        exercises: [
          {
            id: 'e5',
            exercise: { kind: 'catalog', exerciseId: 'plank', name: 'Plank' },
            sets: 3,
            durationSec: 60,
          },
        ],
      },
    ],
    ...overrides,
  };
}

function problemOf(run: () => unknown): ContributionProblem | null {
  try {
    run();
    return null;
  } catch (error) {
    if (error instanceof ContributionInvalidError) return error.problem;
    throw error;
  }
}

describe('slugify', () => {
  it('makes kebab-case ids', () => {
    expect(slugify('My Push / Pull Plan!')).toBe('my-push-pull-plan');
    expect(slugify('Übung für Bäuche')).toBe('ubung-fur-bauche');
    expect(slugify('🏋️')).toBe('');
    const long = slugify('a very long plan name that keeps going and going and going forever');
    expect(long.length).toBeLessThanOrEqual(48);
    expect(long).toMatch(ID_PATTERN);
    expect(long.endsWith('-')).toBe(false);
  });

  it('makes random suffixes that keep ids valid', () => {
    const suffix = randomSuffix();
    expect(suffix).toMatch(/^[a-z0-9]{6}$/);
    expect(`plan-${suffix}`).toMatch(ID_PATTERN);
  });
});

describe('planToSchedule', () => {
  it('builds a valid schedule: catalog ids, name-only entries, no weights or empty days', () => {
    const schedule = planToSchedule(plan(), {
      customExercises: [custom],
      findExercise,
      suffix: 'abc123',
    });
    expect(scheduleSchema.safeParse(schedule).success).toBe(true);
    expect(schedule).toEqual({
      formatVersion: 1,
      id: 'my-push-pull-plan-abc123',
      name: 'My Push / Pull Plan!',
      description: 'A 2-day plan shared from the OpenRep app.',
      days: [
        {
          name: 'Heavy',
          exercises: [
            { exerciseId: 'barbell-squat', sets: 5, reps: '5', restSec: 180, notes: 'Belt on' },
            { name: 'Landmine Press', sets: 3, reps: '8-10' },
            { name: 'Removed One', sets: 2, durationSec: 30 },
            { name: 'Deleted custom', sets: 1, reps: '12' },
          ],
        },
        { name: 'Day 3', exercises: [{ exerciseId: 'plank', sets: 3, durationSec: 60 }] },
      ],
    });
  });

  it('writes a plan without supersets as a version 1 file, fields in the same order', () => {
    const schedule = planToSchedule(plan(), {
      customExercises: [custom],
      findExercise,
      suffix: 'x',
    });
    expect(Object.keys(schedule)).toEqual(['formatVersion', 'id', 'name', 'description', 'days']);
    expect(Object.keys(schedule.days[0]!.exercises[0]!)).toEqual([
      'exerciseId',
      'sets',
      'reps',
      'restSec',
      'notes',
    ]);
  });

  it('keeps supersets in a version 2 file', () => {
    const base = plan();
    const [heavy, empty, last] = base.days;
    const withSuperset = plan({
      days: [
        {
          ...heavy!,
          exercises: heavy!.exercises.map((entry, index) => {
            if (index > 1) return entry;
            const { restSec: _restSec, ...rest } = entry;
            return { ...rest, sets: 4, supersetId: 's1' };
          }),
          supersets: [{ id: 's1', restSec: 90 }],
        },
        empty!,
        last!,
      ],
    });
    const schedule = planToSchedule(withSuperset, {
      customExercises: [custom],
      findExercise,
      suffix: 'abc123',
    });
    expect(scheduleSchema.safeParse(schedule).success).toBe(true);
    expect(schedule).toEqual({
      formatVersion: 2,
      id: 'my-push-pull-plan-abc123',
      name: 'My Push / Pull Plan!',
      description: 'A 2-day plan shared from the OpenRep app.',
      days: [
        {
          name: 'Heavy',
          exercises: [
            {
              superset: {
                rounds: 4,
                restSec: 90,
                exercises: [
                  { exerciseId: 'barbell-squat', reps: '5', notes: 'Belt on' },
                  { name: 'Landmine Press', reps: '8-10' },
                ],
              },
            },
            { name: 'Removed One', sets: 2, durationSec: 30 },
            { name: 'Deleted custom', sets: 1, reps: '12' },
          ],
        },
        { name: 'Day 3', exercises: [{ exerciseId: 'plank', sets: 3, durationSec: 60 }] },
      ],
    });
  });

  it('names untitled plans and needs at least one exercise', () => {
    const untitled = planToSchedule(plan({ name: ' ' }), {
      customExercises: [],
      findExercise,
      suffix: 'x1',
    });
    expect(untitled.name).toBe('Untitled plan');
    expect(untitled.id).toBe('untitled-plan-x1');
    expect(
      problemOf(() =>
        planToSchedule(plan({ days: [{ id: 'd', name: 'A', exercises: [] }] }), {
          customExercises: [],
          findExercise,
          suffix: 'x1',
        }),
      ),
    ).toBe('no-exercises');
  });
});

describe('customExerciseToExercise', () => {
  it('builds a valid community exercise file', () => {
    const exercise = customExerciseToExercise(custom, { findExercise, suffix: 'q1w2e3' });
    expect(exerciseSchema.safeParse(exercise).success).toBe(true);
    expect(exercise).toEqual({
      formatVersion: 1,
      id: 'landmine-press',
      name: 'Landmine Press',
      aliases: [],
      category: 'strength',
      level: 'beginner',
      force: null,
      mechanic: null,
      equipment: 'barbell',
      primaryMuscles: ['shoulders'],
      secondaryMuscles: ['triceps'],
      instructions: ['Hold the bar end at the shoulder.', 'Press up and forward.'],
      images: [],
      source: { name: 'community' },
    });
  });

  it('adds the suffix when the id is taken by a catalog exercise', () => {
    const exercise = customExerciseToExercise(
      { ...custom, name: 'Zercher Squat' },
      { findExercise, suffix: 'q1w2e3' },
    );
    expect(exercise.id).toBe('zercher-squat-q1w2e3');
  });

  it('requires a primary muscle and a step', () => {
    const noMuscle = { ...custom, primaryMuscles: [] };
    const noSteps = { ...custom, instructions: ['  '] };
    expect(canSubmitCustomExercise(custom)).toBe(true);
    expect(canSubmitCustomExercise(noMuscle)).toBe(false);
    expect(canSubmitCustomExercise(noSteps)).toBe(false);
    const context = { findExercise, suffix: 's' };
    expect(problemOf(() => customExerciseToExercise(noMuscle, context))).toBe('no-primary-muscle');
    expect(problemOf(() => customExerciseToExercise(noSteps, context))).toBe('no-steps');
  });
});

describe('buildSubmitUrl', () => {
  function decode(url: string) {
    const parsed = new URL(url);
    return { parsed, params: parsed.searchParams };
  }

  it('pre-fills the file name, content and commit message on GitHub', () => {
    const schedule = planToSchedule(plan(), {
      customExercises: [custom],
      findExercise,
      suffix: 'abc123',
    });
    const contribution = scheduleContribution(schedule);
    expect(contribution.path).toBe('data/schedules/my-push-pull-plan-abc123.json');
    expect(contribution.json.endsWith('}\n')).toBe(true);
    const { url, includesContent } = buildSubmitUrl(contribution);
    expect(includesContent).toBe(true);
    expect(url.length).toBeLessThanOrEqual(MAX_SUBMIT_URL_LENGTH);
    const { parsed, params } = decode(url);
    expect(`${parsed.host}${parsed.pathname}`).toBe('github.com/s1n7ax/openrep/new/main');
    expect(params.get('filename')).toBe('data/schedules/my-push-pull-plan-abc123.json');
    expect(params.get('message')).toBe('Add schedule: My Push / Pull Plan!');
    const value = params.get('value') ?? '';
    expect(value).toBe(contribution.json);
    expect(scheduleSchema.safeParse(JSON.parse(value)).success).toBe(true);
  });

  it('builds exercise contributions', () => {
    const contribution = exerciseContribution(
      customExerciseToExercise(custom, { findExercise, suffix: 's' }),
    );
    const { params } = decode(buildSubmitUrl(contribution).url);
    expect(params.get('filename')).toBe('data/exercises/landmine-press.json');
    expect(exerciseSchema.safeParse(JSON.parse(params.get('value') ?? '')).success).toBe(true);
  });

  it('leaves the content out when the URL would be longer than 6000 characters', () => {
    const big = plan({
      days: Array.from({ length: 12 }, (_, day) => ({
        id: `d${day}`,
        name: `Day ${day + 1}`,
        exercises: Array.from({ length: 8 }, (_, index) => ({
          id: `e${day}-${index}`,
          exercise: { kind: 'catalog' as const, exerciseId: 'barbell-squat', name: 'Squat' },
          sets: 3,
          reps: '8-12',
          restSec: 90,
          notes: 'Control the descent and keep the chest up.',
        })),
      })),
    });
    const contribution = scheduleContribution(
      planToSchedule(big, { customExercises: [], findExercise, suffix: 'big' }),
    );
    const { url, includesContent } = buildSubmitUrl(contribution);
    expect(includesContent).toBe(false);
    expect(url.length).toBeLessThanOrEqual(MAX_SUBMIT_URL_LENGTH);
    const { params } = decode(url);
    expect(params.has('value')).toBe(false);
    expect(params.get('filename')).toBe('data/schedules/my-push-pull-plan-big.json');
    expect(params.get('message')).toBe('Add schedule: My Push / Pull Plan!');
  });
});
