import { describe, expect, it } from 'vitest';
import { emptyUserData, userDataSchema, type UserData } from '../schema/userData.ts';
import {
  addDay,
  addPlanExercise,
  createPlan,
  deleteDay,
  deletePlan,
  deletePlanExercise,
  moveDay,
  movePlan,
  movePlanExercise,
  renameDay,
  renamePlan,
  updatePlanExerciseTarget,
} from './plans.ts';
import { moveItem } from './reorder.ts';

const T0 = '2026-01-01T10:00:00.000Z';
const T1 = '2026-01-02T10:00:00.000Z';

const bench = {
  kind: 'catalog',
  exerciseId: 'barbell-bench-press-medium-grip',
  name: 'Bench',
} as const;
const squat = { kind: 'catalog', exerciseId: 'barbell-squat', name: 'Squat' } as const;

/** A plan "p1" with days "d1" (exercises e1, e2) and "d2". */
function seeded(): UserData {
  let data = createPlan(
    emptyUserData(),
    { id: 'p1', name: 'Strength', firstDay: { id: 'd1', name: 'Day A' } },
    T0,
  );
  data = addDay(data, 'p1', { id: 'd2', name: 'Day B' }, T0);
  data = addPlanExercise(
    data,
    'p1',
    'd1',
    { id: 'e1', exercise: bench, target: { sets: 3, reps: '8-12' } },
    T0,
  );
  data = addPlanExercise(
    data,
    'p1',
    'd1',
    { id: 'e2', exercise: squat, target: { sets: 5, reps: '5', weightKg: 100 } },
    T0,
  );
  return data;
}

describe('moveItem', () => {
  it('moves items up and down and ignores moves off the ends', () => {
    const items = ['a', 'b', 'c'];
    expect(moveItem(items, 0, 1)).toEqual(['b', 'a', 'c']);
    expect(moveItem(items, 2, -1)).toEqual(['a', 'c', 'b']);
    expect(moveItem(items, 0, -1)).toBe(items);
    expect(moveItem(items, 2, 1)).toBe(items);
    expect(moveItem(items, -1, 1)).toBe(items);
    expect(items).toEqual(['a', 'b', 'c']);
  });
});

describe('plan updates', () => {
  it('builds a plan with days and exercises that validates', () => {
    const data = seeded();
    expect(userDataSchema.safeParse(data).success).toBe(true);
    const plan = data.plans[0];
    expect(plan?.days.map((day) => day.name)).toEqual(['Day A', 'Day B']);
    expect(plan?.days[0]?.exercises.map((entry) => entry.id)).toEqual(['e1', 'e2']);
    expect(plan?.days[0]?.exercises[1]).toEqual({
      id: 'e2',
      exercise: squat,
      sets: 5,
      reps: '5',
      weightKg: 100,
    });
  });

  it('does not mutate its input', () => {
    const data = seeded();
    const snapshot = structuredClone(data);
    renamePlan(data, 'p1', 'Other', T1);
    deleteDay(data, 'p1', 'd1', T1);
    movePlanExercise(data, 'p1', 'd1', 'e1', 1, T1);
    expect(data).toEqual(snapshot);
  });

  it('renames plans and days and bumps updatedAt', () => {
    let data = renamePlan(seeded(), 'p1', 'Power', T1);
    data = renameDay(data, 'p1', 'd2', 'Legs', T1);
    expect(data.plans[0]?.name).toBe('Power');
    expect(data.plans[0]?.days[1]?.name).toBe('Legs');
    expect(data.plans[0]?.updatedAt).toBe(T1);
    expect(data.plans[0]?.createdAt).toBe(T0);
  });

  it('reorders plans, days and exercises', () => {
    let data = createPlan(seeded(), { id: 'p2', name: 'Cardio' }, T0);
    data = movePlan(data, 'p2', -1);
    expect(data.plans.map((plan) => plan.id)).toEqual(['p2', 'p1']);
    data = moveDay(data, 'p1', 'd2', -1, T1);
    expect(data.plans[1]?.days.map((day) => day.id)).toEqual(['d2', 'd1']);
    data = movePlanExercise(data, 'p1', 'd1', 'e1', 1, T1);
    expect(data.plans[1]?.days[1]?.exercises.map((entry) => entry.id)).toEqual(['e2', 'e1']);
  });

  it('returns the same data for no-op and unknown targets', () => {
    const data = seeded();
    expect(movePlan(data, 'p1', -1)).toBe(data);
    expect(renamePlan(data, 'nope', 'x', T1)).toBe(data);
    expect(renamePlan(data, 'p1', 'Strength', T1)).toBe(data);
    expect(deletePlan(data, 'nope')).toBe(data);
    expect(deleteDay(data, 'p1', 'nope', T1)).toBe(data);
    expect(moveDay(data, 'p1', 'd1', -1, T1)).toBe(data);
    expect(deletePlanExercise(data, 'p1', 'd1', 'nope', T1)).toBe(data);
    expect(updatePlanExerciseTarget(data, 'p1', 'd2', 'e1', { sets: 1, reps: '1' }, T1)).toBe(data);
  });

  it('replaces targets, dropping unset fields and blank notes', () => {
    const data = updatePlanExerciseTarget(
      seeded(),
      'p1',
      'd1',
      'e2',
      { sets: 3, durationSec: 45, restSec: 60, notes: '  ', weightKg: undefined },
      T1,
    );
    expect(data.plans[0]?.days[0]?.exercises[1]).toEqual({
      id: 'e2',
      exercise: squat,
      sets: 3,
      durationSec: 45,
      restSec: 60,
    });
    expect(userDataSchema.safeParse(data).success).toBe(true);
  });

  it('deletes exercises, days and plans', () => {
    let data = deletePlanExercise(seeded(), 'p1', 'd1', 'e1', T1);
    expect(data.plans[0]?.days[0]?.exercises.map((entry) => entry.id)).toEqual(['e2']);
    data = deleteDay(data, 'p1', 'd1', T1);
    expect(data.plans[0]?.days.map((day) => day.id)).toEqual(['d2']);
    data = deletePlan(data, 'p1');
    expect(data.plans).toEqual([]);
  });
});
