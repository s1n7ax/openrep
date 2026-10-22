import { describe, expect, it } from 'vitest';
import type { Exercise } from '../schema/exercise.ts';
import { scheduleSchema, type Schedule } from '../schema/schedule.ts';
import { emptyUserData, userDataSchema } from '../schema/userData.ts';
import { createCustomExercise } from './customExercises.ts';
import { copyScheduleToPlan, scheduleExerciseCount } from './schedules.ts';

const NOW = '2026-03-01T09:00:00.000Z';

const schedule: Schedule = scheduleSchema.parse({
  formatVersion: 1,
  id: 'test-split',
  name: 'Test Split',
  description: 'Two days.',
  days: [
    {
      name: 'Push',
      exercises: [
        { exerciseId: 'pushups', sets: 3, reps: '8-12', restSec: 60, notes: 'Slow down' },
        { name: '  Landmine   press ', sets: 3, reps: '10' },
      ],
    },
    {
      name: 'Core',
      exercises: [
        { exerciseId: 'plank', sets: 2, durationSec: 45 },
        { exerciseId: 'gone-exercise', name: 'Gone exercise', sets: 1, reps: '5' },
        { exerciseId: 'removed-move', sets: 1, reps: '5' },
        { name: 'landmine press', sets: 2, reps: '12' },
      ],
    },
  ],
});

const catalog = new Map<string, Pick<Exercise, 'id' | 'name'>>([
  ['pushups', { id: 'pushups', name: 'Pushups' }],
  ['plank', { id: 'plank', name: 'Plank' }],
]);
const findExercise = (id: string) => catalog.get(id) as Exercise | undefined;

function counter() {
  let next = 0;
  return () => `id${next++}`;
}

describe('copyScheduleToPlan', () => {
  it('creates an editable plan with the schedule days, exercises and targets', () => {
    const data = copyScheduleToPlan(emptyUserData(), schedule, {
      planId: 'plan1',
      newId: counter(),
      now: NOW,
      findExercise,
    });
    expect(userDataSchema.safeParse(data).success).toBe(true);
    const plan = data.plans[0];
    expect(plan).toMatchObject({ id: 'plan1', name: 'Test Split', createdAt: NOW });
    expect(plan?.days.map((day) => day.name)).toEqual(['Push', 'Core']);
    expect(plan?.days[0]?.exercises[0]).toEqual({
      id: expect.any(String),
      exercise: { kind: 'catalog', exerciseId: 'pushups', name: 'Pushups' },
      sets: 3,
      reps: '8-12',
      restSec: 60,
      notes: 'Slow down',
    });
    expect(plan?.days[1]?.exercises[0]).toMatchObject({ sets: 2, durationSec: 45 });
    expect(plan?.days[1]?.exercises[0]).not.toHaveProperty('reps');
    const ids = plan?.days.flatMap((day) => [day.id, ...day.exercises.map((entry) => entry.id)]);
    expect(new Set(ids).size).toBe(ids?.length);
  });

  it('keeps catalog ids missing from the catalog, with the best name available', () => {
    const data = copyScheduleToPlan(emptyUserData(), schedule, {
      planId: 'p',
      newId: counter(),
      now: NOW,
      findExercise,
    });
    const core = data.plans[0]?.days[1]?.exercises ?? [];
    expect(core[1]?.exercise).toEqual({
      kind: 'catalog',
      exerciseId: 'gone-exercise',
      name: 'Gone exercise',
    });
    expect(core[2]?.exercise).toEqual({
      kind: 'catalog',
      exerciseId: 'removed-move',
      name: 'Removed move',
    });
  });

  it('turns name-only entries into one custom exercise per name', () => {
    const data = copyScheduleToPlan(emptyUserData(), schedule, {
      planId: 'p',
      newId: counter(),
      now: NOW,
      findExercise,
    });
    expect(data.customExercises).toHaveLength(1);
    const custom = data.customExercises[0];
    expect(custom).toMatchObject({
      name: 'Landmine press',
      notes: '',
      equipment: null,
      primaryMuscles: [],
      instructions: [],
      createdAt: NOW,
    });
    const refs = data.plans[0]?.days.flatMap((day) => day.exercises.map((e) => e.exercise));
    const customRefs = refs?.filter((ref) => ref.kind === 'custom');
    expect(customRefs).toEqual([
      { kind: 'custom', customExerciseId: custom?.id, name: 'Landmine press' },
      { kind: 'custom', customExerciseId: custom?.id, name: 'Landmine press' },
    ]);
  });

  it('reuses an existing custom exercise with the same name', () => {
    const existing = createCustomExercise(
      emptyUserData(),
      'mine',
      {
        name: 'LANDMINE PRESS',
        notes: 'my notes',
        equipment: 'barbell',
        primaryMuscles: ['shoulders'],
        secondaryMuscles: [],
        instructions: [],
      },
      NOW,
    );
    const data = copyScheduleToPlan(existing, schedule, {
      planId: 'p',
      newId: counter(),
      now: NOW,
      findExercise,
    });
    expect(data.customExercises.map((custom) => custom.id)).toEqual(['mine']);
    expect(data.plans[0]?.days[0]?.exercises[1]?.exercise).toEqual({
      kind: 'custom',
      customExerciseId: 'mine',
      name: 'LANDMINE PRESS',
    });
  });

  it('does not change existing plans and appends the copy', () => {
    const first = copyScheduleToPlan(emptyUserData(), schedule, {
      planId: 'a',
      newId: counter(),
      now: NOW,
      findExercise,
    });
    const snapshot = structuredClone(first);
    const second = copyScheduleToPlan(first, schedule, {
      planId: 'b',
      newId: () => `x${Math.random()}`,
      now: NOW,
      findExercise,
    });
    expect(first).toEqual(snapshot);
    expect(second.plans.map((plan) => plan.id)).toEqual(['a', 'b']);
    expect(second.customExercises).toHaveLength(1);
  });

  it('counts exercises', () => {
    expect(scheduleExerciseCount(schedule)).toBe(6);
  });
});
