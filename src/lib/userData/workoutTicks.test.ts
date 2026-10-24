import { describe, expect, it } from 'vitest';
import type { LoggedSet, Session, SessionExercise, Superset } from '../schema/userData.ts';
import { blockKey } from './supersets.ts';
import { tickOutcome } from './workoutTicks.ts';

function sets(prefix: string, done: boolean[]): LoggedSet[] {
  return done.map((value, index) => ({
    id: `${prefix}${index + 1}`,
    weightKg: 60,
    reps: 8,
    durationSec: null,
    done: value,
  }));
}

function exercise(
  id: string,
  done: boolean[],
  options: { restSec?: number; supersetId?: string } = {},
): SessionExercise {
  const entry: SessionExercise = {
    id,
    exercise: { kind: 'catalog', exerciseId: id, name: id },
    target: { sets: done.length, reps: '8' },
    sets: sets(id, done),
  };
  if (options.restSec !== undefined) entry.target.restSec = options.restSec;
  if (options.supersetId !== undefined) entry.supersetId = options.supersetId;
  return entry;
}

function session(exercises: SessionExercise[], supersets: Superset[] = []): Session {
  return {
    id: 's1',
    planId: 'p1',
    planName: 'Plan',
    dayId: 'd1',
    dayName: 'Day A',
    startedAt: '2026-01-01T10:00:00.000Z',
    finishedAt: null,
    exercises,
    ...(supersets.length > 0 ? { supersets } : {}),
  };
}

describe('tickOutcome: rest', () => {
  it("rests for the exercise's rest from the plan", () => {
    const value = session([exercise('bench', [true, false, false], { restSec: 60 })]);
    expect(tickOutcome(value, 'bench', 'bench1', 90)).toEqual({ restSec: 60, completed: null });
  });

  it('rests for the default rest when the plan gives none', () => {
    const value = session([exercise('bench', [true, false]), exercise('row', [false])]);
    expect(tickOutcome(value, 'bench', 'bench1', 90).restSec).toBe(90);
    expect(tickOutcome(value, 'bench', 'bench1', 120).restSec).toBe(120);
  });

  it('does not rest for a rest of 0 s', () => {
    const planned = session([exercise('bench', [true, false], { restSec: 0 })]);
    expect(tickOutcome(planned, 'bench', 'bench1', 90).restSec).toBeNull();
    const defaulted = session([exercise('bench', [true, false])]);
    expect(tickOutcome(defaulted, 'bench', 'bench1', 0).restSec).toBeNull();
  });

  it("rests after an exercise's last set before the next exercise", () => {
    const value = session([
      exercise('bench', [true, true], { restSec: 60 }),
      exercise('row', [false]),
    ]);
    expect(tickOutcome(value, 'bench', 'bench2', 90).restSec).toBe(60);
  });

  it("does not rest after the workout's last set, even with sets left before it", () => {
    const value = session([exercise('bench', [false, false]), exercise('row', [false, true])]);
    expect(tickOutcome(value, 'row', 'row2', 90).restSec).toBeNull();
  });

  it('does not rest once every set of the workout is ticked off', () => {
    const value = session([exercise('bench', [true, true]), exercise('row', [true, true])]);
    expect(tickOutcome(value, 'bench', 'bench1', 90).restSec).toBeNull();
  });

  it('starts nothing for a set not ticked off, or one that does not exist', () => {
    const value = session([exercise('bench', [false, false])]);
    const nothing = { restSec: null, completed: null };
    expect(tickOutcome(value, 'bench', 'bench1', 90)).toEqual(nothing);
    expect(tickOutcome(value, 'bench', 'nope', 90)).toEqual(nothing);
    expect(tickOutcome(value, 'nope', 'bench1', 90)).toEqual(nothing);
  });
});

describe('tickOutcome: superset rest', () => {
  /** Superset A (squat, curl; 2 rounds; rest 45 s, or none for null) then a plank. */
  function withSuperset(squat: boolean[], curl: boolean[], restSec: number | null = 45) {
    return session(
      [
        exercise('squat', squat, { supersetId: 'a', restSec: 120 }),
        exercise('curl', curl, { supersetId: 'a' }),
        exercise('plank', [false]),
      ],
      [restSec === null ? { id: 'a' } : { id: 'a', restSec }],
    );
  }

  it("rests after a round's last row only, for the superset's rest", () => {
    expect(tickOutcome(withSuperset([true, false], [false, false]), 'squat', 'squat1', 90)).toEqual(
      { restSec: null, completed: null },
    );
    expect(tickOutcome(withSuperset([true, false], [true, false]), 'curl', 'curl1', 90)).toEqual({
      restSec: 45,
      completed: null,
    });
  });

  it('rests for the default rest when the superset has none', () => {
    const value = withSuperset([true, false], [true, false], null);
    expect(tickOutcome(value, 'curl', 'curl1', 90).restSec).toBe(90);
  });

  it('rests when a tick out of order completes the round', () => {
    // A2 first: it is the round's last row.
    expect(
      tickOutcome(withSuperset([false, false], [true, false]), 'curl', 'curl1', 90).restSec,
    ).toBe(45);
    // Then A1: the round is done.
    expect(
      tickOutcome(withSuperset([true, false], [true, false]), 'squat', 'squat1', 90).restSec,
    ).toBe(45);
  });

  it("does not rest after the workout's last row when the superset is last", () => {
    const value = session(
      [
        exercise('plank', [true]),
        exercise('squat', [true, true], { supersetId: 'a' }),
        exercise('curl', [true, false], { supersetId: 'a' }),
      ],
      [{ id: 'a', restSec: 45 }],
    );
    const ticked = structuredClone(value);
    ticked.exercises[2]!.sets[1]!.done = true;
    expect(tickOutcome(ticked, 'curl', 'curl2', 90).restSec).toBeNull();
    // With a row left before it, still none.
    ticked.exercises[0]!.sets[0]!.done = false;
    expect(tickOutcome(ticked, 'curl', 'curl2', 90).restSec).toBeNull();
  });
});

describe('tickOutcome: completion', () => {
  /** Key (`blockKey`) of the exercise or superset the tick completed; null for none. */
  function completedKey(...args: Parameters<typeof tickOutcome>): string | null {
    const { completed } = tickOutcome(...args);
    return completed && blockKey(completed);
  }

  it('completes an exercise when its last unticked set is ticked, in any order', () => {
    const value = session([exercise('bench', [true, true, true]), exercise('row', [false])]);
    expect(completedKey(value, 'bench', 'bench2', 90)).toBe('exercise-bench');
    const open = session([exercise('bench', [true, false, true]), exercise('row', [false])]);
    expect(tickOutcome(open, 'bench', 'bench3', 90).completed).toBeNull();
  });

  it('completes the last exercise of the workout too', () => {
    const value = session([exercise('bench', [true]), exercise('row', [true, true])]);
    expect(tickOutcome(value, 'row', 'row2', 90).restSec).toBeNull();
    expect(completedKey(value, 'row', 'row2', 90)).toBe('exercise-row');
  });

  it('completes a superset once, when all its rows are done', () => {
    const supersets = [{ id: 'a', restSec: 45 }];
    // A1 is done with all its sets, A2 is not: not complete yet.
    const partly = session(
      [
        exercise('squat', [true, true], { supersetId: 'a' }),
        exercise('curl', [true, false], { supersetId: 'a' }),
        exercise('plank', [false]),
      ],
      supersets,
    );
    expect(tickOutcome(partly, 'squat', 'squat2', 90).completed).toBeNull();
    const done = structuredClone(partly);
    done.exercises[1]!.sets[1]!.done = true;
    expect(tickOutcome(done, 'curl', 'curl2', 90).restSec).toBe(45);
    expect(completedKey(done, 'curl', 'curl2', 90)).toBe('superset-a');
  });
});
