import { describe, expect, it } from 'vitest';
import type { Muscle } from '../schema/common.ts';
import type { CustomExercise, ExerciseRef, Plan, PlanDay, Session } from '../schema/userData.ts';
import { dayMuscles, nextPlanDay } from './selectors.ts';

const T0 = '2026-01-01T10:00:00.000Z';
const squat: ExerciseRef = { kind: 'catalog', exerciseId: 'barbell-squat', name: 'Squat' };

function day(id: string, exercises = 1): PlanDay {
  return {
    id,
    name: id.toUpperCase(),
    exercises: Array.from({ length: exercises }, (_, index) => ({
      id: `${id}-e${index}`,
      exercise: squat,
      sets: 3,
      reps: '8',
    })),
  };
}

function plan(days: PlanDay[], id = 'p1'): Plan {
  return { id, name: 'Plan', days, createdAt: T0, updatedAt: T0 };
}

/** A workout of day `dayId` of plan `planId`, started on January `date`, finished unless `open`. */
function workout(dayId: string, date: number, planId = 'p1', open = false): Session {
  const startedAt = `2026-01-${String(date).padStart(2, '0')}T10:00:00.000Z`;
  return {
    id: `${planId}-${dayId}-${date}`,
    planId,
    planName: 'Plan',
    dayId,
    dayName: dayId,
    startedAt,
    finishedAt: open ? null : startedAt.replace('T10', 'T11'),
    exercises: [],
  };
}

describe('nextPlanDay', () => {
  const abc = plan([day('a'), day('b'), day('c')]);

  it('is the first day without history', () => {
    expect(nextPlanDay(abc, [])?.id).toBe('a');
  });

  it('is the day after the last one finished, back to the first after the last', () => {
    expect(nextPlanDay(abc, [workout('a', 1)])?.id).toBe('b');
    expect(nextPlanDay(abc, [workout('a', 1), workout('b', 3)])?.id).toBe('c');
    expect(nextPlanDay(abc, [workout('b', 3), workout('c', 5)])?.id).toBe('a');
  });

  it('follows the most recently started workout, not the order of the list', () => {
    expect(nextPlanDay(abc, [workout('b', 5), workout('c', 2)])?.id).toBe('c');
  });

  it('ignores workouts in progress and those of other plans', () => {
    expect(nextPlanDay(abc, [workout('a', 1), workout('b', 3, 'p1', true)])?.id).toBe('b');
    expect(nextPlanDay(abc, [workout('a', 1), workout('b', 3, 'p2')])?.id).toBe('b');
  });

  it('passes over a workout of a day since removed', () => {
    expect(nextPlanDay(abc, [workout('a', 1), workout('gone', 3)])?.id).toBe('b');
    expect(nextPlanDay(abc, [workout('gone', 3)])?.id).toBe('a');
  });

  it('skips days without exercises', () => {
    const gaps = plan([day('a', 0), day('b'), day('c', 0)]);
    expect(nextPlanDay(gaps, [])?.id).toBe('b');
    expect(nextPlanDay(gaps, [workout('b', 1)])?.id).toBe('b');
    expect(nextPlanDay(plan([day('a', 0)]), [])).toBeUndefined();
  });
});

describe('dayMuscles', () => {
  const catalog: Record<string, { primaryMuscles: Muscle[]; secondaryMuscles: Muscle[] }> = {
    bench: { primaryMuscles: ['chest'], secondaryMuscles: ['shoulders', 'triceps'] },
    pushdown: { primaryMuscles: ['triceps'], secondaryMuscles: [] },
  };
  const find = (id: string) => catalog[id];
  const custom: CustomExercise = {
    id: 'c1',
    name: 'Landmine Press',
    notes: '',
    equipment: null,
    primaryMuscles: ['shoulders'],
    secondaryMuscles: ['abdominals'],
    instructions: [],
    createdAt: T0,
    updatedAt: T0,
  };

  function dayOf(...refs: ExerciseRef[]): PlanDay {
    return {
      id: 'd',
      name: 'D',
      exercises: refs.map((exercise, index) => ({ id: `e${index}`, exercise, sets: 3, reps: '8' })),
    };
  }

  const ref = (exerciseId: string): ExerciseRef => ({
    kind: 'catalog',
    exerciseId,
    name: exerciseId,
  });

  it('lists the primary and secondary muscles of an exercise', () => {
    expect(dayMuscles(dayOf(ref('bench')), find, [])).toEqual({
      primary: ['chest'],
      secondary: ['shoulders', 'triceps'],
    });
  });

  it('lists each muscle once, primary in any exercise winning over secondary', () => {
    expect(dayMuscles(dayOf(ref('bench'), ref('pushdown'), ref('bench')), find, [])).toEqual({
      primary: ['chest', 'triceps'],
      secondary: ['shoulders'],
    });
  });

  it('counts custom exercises and skips those no longer there', () => {
    const customRef: ExerciseRef = { kind: 'custom', customExerciseId: 'c1', name: 'Landmine' };
    const goneCustom: ExerciseRef = { kind: 'custom', customExerciseId: 'gone', name: 'Gone' };
    expect(dayMuscles(dayOf(customRef, ref('missing'), goneCustom), find, [custom])).toEqual({
      primary: ['shoulders'],
      secondary: ['abdominals'],
    });
    expect(dayMuscles(dayOf(), find, [custom])).toEqual({ primary: [], secondary: [] });
  });
});
