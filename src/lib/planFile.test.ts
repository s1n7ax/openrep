import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  createPlanFile,
  describePlanFileProblem,
  importPlanFile,
  InvalidPlanFileError,
  parsePlanFile,
  planFileName,
  serializePlanFile,
  type PlanFileProblem,
} from './planFile.ts';
import { planFileSchema, type PlanFile } from './schema/planFile.ts';
import { emptyUserData, type CustomExercise, type Plan, type UserData } from './schema/userData.ts';

const now = '2026-01-02T03:04:05.000Z';

function idsFrom(start = 0): () => string {
  let next = start;
  return () => `new-${(next += 1)}`;
}

/** A custom exercise of the user's data. */
function custom(id: string, name: string): CustomExercise {
  return {
    id,
    name,
    notes: '',
    equipment: null,
    primaryMuscles: [],
    secondaryMuscles: [],
    instructions: [],
    createdAt: now,
    updatedAt: now,
  };
}

const validFile: PlanFile = {
  app: 'openrep',
  kind: 'plan',
  formatVersion: 1,
  plan: {
    name: 'Upper/Lower',
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
            notes: 'Warm up first.',
          },
        ],
      },
    ],
  },
};

function parse(text: string): PlanFile {
  return parsePlanFile(text);
}

function problemOf(run: () => unknown): PlanFileProblem {
  try {
    run();
  } catch (error) {
    if (error instanceof InvalidPlanFileError) return error.problem;
    throw error;
  }
  throw new Error('expected the file to be rejected');
}

const ALL_PROBLEMS: PlanFileProblem[] = [
  'too-large',
  'not-json',
  'not-plan',
  'newer-version',
  'invalid',
];

describe('parsePlanFile', () => {
  it('reads a valid file', () => {
    expect(parse(JSON.stringify(validFile))).toEqual(validFile);
  });

  it('ignores a byte order mark', () => {
    expect(parse(`\uFEFF${JSON.stringify(validFile)}`).plan.name).toBe('Upper/Lower');
  });

  it('rejects text that is not JSON', () => {
    expect(problemOf(() => parse('not json'))).toBe('not-json');
  });

  it('rejects another kind of OpenRep file', () => {
    const backup = { app: 'openrep', kind: 'backup', formatVersion: 1 };
    expect(problemOf(() => parse(JSON.stringify(backup)))).toBe('not-plan');
  });

  it('rejects a file from a newer format version', () => {
    const newer = { ...validFile, formatVersion: 2 };
    expect(problemOf(() => parse(JSON.stringify(newer)))).toBe('newer-version');
  });

  it('rejects an invalid plan', () => {
    const both = structuredClone(validFile);
    both.plan.days[0]!.exercises[0]!.durationSec = 30;
    expect(problemOf(() => parse(JSON.stringify(both)))).toBe('invalid');
  });

  it('rejects unknown fields', () => {
    const extra = { ...validFile, extra: true };
    expect(problemOf(() => parse(JSON.stringify(extra)))).toBe('invalid');
  });

  it('rejects weights that are not numbers', () => {
    const text = JSON.stringify(validFile).replace('72.5', '"72.5 kg"');
    expect(problemOf(() => parse(text))).toBe('invalid');
  });

  it('has a message for every problem', () => {
    for (const problem of ALL_PROBLEMS) {
      expect(describePlanFileProblem(problem)).not.toBe('');
    }
  });
});

describe('createPlanFile', () => {
  const plan: Plan = {
    id: 'plan-1',
    name: '  ',
    days: [
      {
        id: 'day-1',
        name: '',
        exercises: [
          {
            id: 'entry-1',
            exercise: { kind: 'catalog', exerciseId: 'plank', name: '' },
            sets: 3,
            durationSec: 30,
          },
          {
            id: 'entry-2',
            exercise: { kind: 'custom', customExerciseId: 'custom-1', name: 'Sled Push' },
            sets: 4,
            reps: '20',
            supersetId: 'superset-1',
          },
          {
            id: 'entry-3',
            exercise: { kind: 'custom', customExerciseId: 'custom-1', name: 'Sled Push' },
            sets: 4,
            reps: '20',
            supersetId: 'superset-1',
          },
        ],
        supersets: [{ id: 'superset-1', restSec: 90 }],
      },
    ],
    createdAt: now,
    updatedAt: now,
  };

  it('fills the names the app shows when they are empty', () => {
    const file = createPlanFile(plan, [custom('custom-1', 'Sled Push')]);
    expect(file.plan.name).toBe('Untitled plan');
    expect(file.plan.days[0]!.name).toBe('Day 1');
    expect(file.plan.days[0]!.exercises[0]!.exercise.name).toBe('Exercise');
    expect(file.plan.days[0]!.exercises[1]!.supersetId).toBe('superset-1');
    expect(planFileSchema.safeParse(file).success).toBe(true);
  });

  it('carries the custom exercises the plan uses, once each', () => {
    const file = createPlanFile(plan, [custom('custom-1', 'Sled Push')]);
    expect(file.customExercises?.map((entry) => entry.id)).toEqual(['custom-1']);
  });

  it('leaves out custom exercises the plan does not use', () => {
    const file = createPlanFile(plan, [custom('custom-1', 'Sled Push'), custom('other', 'Other')]);
    expect(file.customExercises).toHaveLength(1);
  });

  it('has no customExercises field when there are none', () => {
    const plain: Plan = {
      ...plan,
      days: [
        {
          id: 'day-1',
          name: 'Day 1',
          exercises: [
            {
              id: 'entry-1',
              exercise: { kind: 'catalog', exerciseId: 'plank', name: 'Plank' },
              sets: 3,
              durationSec: 30,
            },
          ],
        },
      ],
    };
    expect(createPlanFile(plain, [])).not.toHaveProperty('customExercises');
  });

  it('writes a file that parses back', () => {
    const file = createPlanFile(plan, [custom('custom-1', 'Sled Push')]);
    expect(parse(serializePlanFile(file))).toEqual(file);
  });
});

describe('planFileName', () => {
  it('uses the plan name as a slug', () => {
    expect(planFileName({ ...({} as Plan), name: 'Push / Pull (Legs!)' })).toBe(
      'openrep-plan-push-pull-legs.json',
    );
  });

  it('falls back to "plan" without a usable name', () => {
    expect(planFileName({ ...({} as Plan), name: '  ' })).toBe('openrep-plan-plan.json');
  });
});

describe('importPlanFile', () => {
  function importInto(data: UserData, file: PlanFile): UserData {
    return importPlanFile(data, file, { newId: idsFrom(), now }).data;
  }

  it('adds the plan at the end and returns its id', () => {
    const imported = importPlanFile(emptyUserData(), validFile, { newId: idsFrom(), now });
    expect(imported.data.plans).toHaveLength(1);
    expect(imported.data.plans[0]!.id).toBe(imported.planId);
    expect(imported.data.plans[0]!.name).toBe('Upper/Lower');
    expect(imported.data.plans[0]!.createdAt).toBe(now);
  });

  it('keeps the targets, weights and notes', () => {
    const entry = importInto(emptyUserData(), validFile).plans[0]!.days[0]!.exercises[0]!;
    expect(entry).toMatchObject({
      sets: 4,
      reps: '5',
      weightKg: 72.5,
      restSec: 180,
      notes: 'Warm up first.',
      exercise: {
        kind: 'catalog',
        exerciseId: 'barbell-bench-press-medium-grip',
        name: 'Barbell Bench Press',
      },
    });
  });

  it('replaces every id of the file, so importing twice is safe', () => {
    const once = importPlanFile(emptyUserData(), validFile, { newId: idsFrom(0), now }).data;
    const twice = importPlanFile(once, validFile, { newId: idsFrom(100), now }).data;
    const [first, second] = twice.plans;
    expect(first!.id).not.toBe(second!.id);
    expect(first!.days[0]!.id).not.toBe(second!.days[0]!.id);
    expect(first!.days[0]!.exercises[0]!.id).not.toBe(second!.days[0]!.exercises[0]!.id);
  });

  it('does not mutate the user data it is given', () => {
    const data = emptyUserData();
    importInto(data, validFile);
    expect(data.plans).toEqual([]);
  });

  it('adds a custom exercise of the file', () => {
    const file: PlanFile = {
      ...validFile,
      customExercises: [
        {
          id: 'sled-push',
          name: 'Sled Push',
          equipment: 'other',
          primaryMuscles: ['quadriceps'],
          instructions: ['Push it.'],
        },
      ],
      plan: {
        ...validFile.plan,
        days: [
          {
            name: 'Lower',
            exercises: [
              {
                exercise: { kind: 'custom', customExerciseId: 'sled-push', name: 'Sled Push' },
                sets: 4,
                reps: '20',
              },
            ],
          },
        ],
      },
    };
    const data = importInto(emptyUserData(), file);
    expect(data.customExercises).toHaveLength(1);
    expect(data.customExercises[0]).toMatchObject({
      name: 'Sled Push',
      notes: '',
      equipment: 'other',
      primaryMuscles: ['quadriceps'],
      secondaryMuscles: [],
      instructions: ['Push it.'],
      createdAt: now,
    });
    expect(data.plans[0]!.days[0]!.exercises[0]!.exercise).toEqual({
      kind: 'custom',
      customExerciseId: data.customExercises[0]!.id,
      name: 'Sled Push',
    });
  });

  it('reuses an existing custom exercise of the same name', () => {
    const existing = custom('custom-1', '  sled   PUSH ');
    const data = importInto(
      { ...emptyUserData(), customExercises: [existing] },
      {
        ...validFile,
        plan: {
          ...validFile.plan,
          days: [
            {
              name: 'Lower',
              exercises: [
                {
                  exercise: { kind: 'custom', customExerciseId: 'other-id', name: 'Sled Push' },
                  sets: 4,
                  reps: '20',
                },
              ],
            },
          ],
        },
      },
    );
    expect(data.customExercises).toEqual([existing]);
    expect(data.plans[0]!.days[0]!.exercises[0]!.exercise).toEqual({
      kind: 'custom',
      customExerciseId: 'custom-1',
      name: 'sled   PUSH',
    });
  });

  it('adds a custom exercise a reference names but the file does not define', () => {
    const data = importInto(emptyUserData(), {
      ...validFile,
      plan: {
        ...validFile.plan,
        days: [
          {
            name: 'Lower',
            exercises: [
              {
                exercise: { kind: 'custom', customExerciseId: 'unknown', name: 'Sled Push' },
                sets: 4,
                reps: '20',
              },
            ],
          },
        ],
      },
    });
    expect(data.customExercises.map((entry) => entry.name)).toEqual(['Sled Push']);
  });

  it('keeps a superset together and maps its id', () => {
    const data = importInto(emptyUserData(), {
      ...validFile,
      plan: {
        ...validFile.plan,
        days: [
          {
            name: 'Arms',
            supersets: [{ id: 'arms', restSec: 90 }],
            exercises: [
              {
                exercise: { kind: 'catalog', exerciseId: 'dumbbell-flyes', name: 'Flyes' },
                sets: 3,
                reps: '12',
                supersetId: 'arms',
              },
              {
                exercise: { kind: 'catalog', exerciseId: 'plank', name: 'Plank' },
                sets: 3,
                durationSec: 30,
                supersetId: 'arms',
              },
            ],
          },
        ],
      },
    });
    const day = data.plans[0]!.days[0]!;
    expect(day.supersets).toHaveLength(1);
    const [superset] = day.supersets!;
    expect(superset!.restSec).toBe(90);
    expect(day.exercises.map((entry) => entry.supersetId)).toEqual([superset!.id, superset!.id]);
  });

  it('puts a superset’s exercises next to each other', () => {
    const data = importInto(emptyUserData(), {
      ...validFile,
      plan: {
        ...validFile.plan,
        days: [
          {
            name: 'Arms',
            supersets: [{ id: 'arms' }],
            exercises: [
              {
                exercise: { kind: 'catalog', exerciseId: 'dumbbell-flyes', name: 'Flyes' },
                sets: 3,
                reps: '12',
                supersetId: 'arms',
              },
              {
                exercise: { kind: 'catalog', exerciseId: 'barbell-squat', name: 'Squat' },
                sets: 3,
                reps: '5',
              },
              {
                exercise: { kind: 'catalog', exerciseId: 'plank', name: 'Plank' },
                sets: 3,
                durationSec: 30,
                supersetId: 'arms',
              },
            ],
          },
        ],
      },
    });
    const entries = data.plans[0]!.days[0]!.exercises;
    expect(entries.map((entry) => entry.exercise.name)).toEqual(['Flyes', 'Plank', 'Squat']);
  });

  it('drops a supersetId that names no superset', () => {
    const data = importInto(emptyUserData(), {
      ...validFile,
      plan: {
        ...validFile.plan,
        days: [
          {
            name: 'Arms',
            exercises: [
              {
                exercise: { kind: 'catalog', exerciseId: 'plank', name: 'Plank' },
                sets: 3,
                durationSec: 30,
                supersetId: 'missing',
              },
            ],
          },
        ],
      },
    });
    const day = data.plans[0]!.days[0]!;
    expect(day.exercises[0]).not.toHaveProperty('supersetId');
    expect(day).not.toHaveProperty('supersets');
  });
});

describe('the example in llms.txt', () => {
  const text = readFileSync(new URL('../../llms.txt', import.meta.url), 'utf8');
  const examples = [...text.matchAll(/```json\n([\s\S]*?)```/g)].map((match) => match[1]!);

  it('has at least one JSON example', () => {
    expect(examples.length).toBeGreaterThan(0);
  });

  it.each(examples.map((json, index) => [index, json] as const))(
    'example %i is a valid plan file',
    (_index, json) => {
      const file = parse(json);
      // And it imports without touching the app's own data.
      const data = importPlanFile(emptyUserData(), file, { newId: idsFrom(), now }).data;
      expect(data.plans).toHaveLength(1);
    },
  );
});
