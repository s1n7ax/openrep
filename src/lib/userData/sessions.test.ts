import { describe, expect, it } from 'vitest';
import {
  emptyUserData,
  userDataSchema,
  type LoggedSet,
  type UserData,
} from '../schema/userData.ts';
import {
  createCustomExercise,
  deleteCustomExercise,
  normalizeCustomExerciseInput,
  updateCustomExercise,
} from './customExercises.ts';
import { addDay, addPlanExercise, createPlan, supersetWithNext } from './plans.ts';
import { activeSession, history, lastTimeFor, planStats, sameExercise } from './selectors.ts';
import {
  addLoggedRound,
  addLoggedSet,
  deleteSession,
  finishSession,
  removeLoggedSet,
  setLoggedSetDone,
  startSession,
  updateLoggedSet,
} from './sessions.ts';
import { setCatalogMeta, setDefaultRest, setUnit } from './settings.ts';
import { defaultTarget, formatDuration, formatTarget, formatTargetWithRest } from './targets.ts';

const T0 = '2026-01-01T10:00:00.000Z';
const T1 = '2026-01-01T11:00:00.000Z';
const T2 = '2026-01-08T10:00:00.000Z';
const T3 = '2026-01-08T11:00:00.000Z';

const squat = { kind: 'catalog', exerciseId: 'barbell-squat', name: 'Squat' } as const;
const plank = { kind: 'catalog', exerciseId: 'plank', name: 'Plank' } as const;

function counter(prefix: string) {
  let next = 0;
  return () => `${prefix}${next++}`;
}

function planData(): UserData {
  let data = createPlan(
    emptyUserData(),
    { id: 'p1', name: 'Legs', firstDay: { id: 'd1', name: 'Day A' } },
    T0,
  );
  data = addDay(data, 'p1', { id: 'd2', name: 'Day B' }, T0);
  data = addPlanExercise(
    data,
    'p1',
    'd1',
    { id: 'e1', exercise: squat, target: { sets: 3, reps: '5', weightKg: 100 } },
    T0,
  );
  return addPlanExercise(
    data,
    'p1',
    'd1',
    { id: 'e2', exercise: plank, target: { sets: 2, durationSec: 60 } },
    T0,
  );
}

describe('sessions', () => {
  it('starts a session from a plan day with one row per target set', () => {
    const data = startSession(
      planData(),
      { sessionId: 's1', planId: 'p1', dayId: 'd1' },
      T0,
      counter('id'),
    );
    expect(userDataSchema.safeParse(data).success).toBe(true);
    const session = activeSession(data);
    expect(session?.id).toBe('s1');
    expect(session).toMatchObject({ planName: 'Legs', dayName: 'Day A', finishedAt: null });
    expect(session?.exercises.map((exercise) => exercise.target)).toEqual([
      { sets: 3, reps: '5', weightKg: 100 },
      { sets: 2, durationSec: 60 },
    ]);
    expect(session?.exercises[0]?.sets).toHaveLength(3);
    expect(session?.exercises[0]?.sets[0]).toEqual({
      id: 'id1',
      weightKg: 100,
      reps: null,
      durationSec: null,
      done: false,
    });
    expect(session?.exercises[1]?.sets[0]?.weightKg).toBeNull();
  });

  it('ignores unknown plans and days', () => {
    const data = planData();
    expect(startSession(data, { sessionId: 's', planId: 'p1', dayId: 'x' }, T0, counter('i'))).toBe(
      data,
    );
  });

  it('logs, adds and removes sets', () => {
    let data = startSession(
      planData(),
      { sessionId: 's1', planId: 'p1', dayId: 'd1' },
      T0,
      counter('id'),
    );
    const exerciseId = data.sessions[0]?.exercises[0]?.id ?? '';
    const setId = data.sessions[0]?.exercises[0]?.sets[2]?.id ?? '';
    data = updateLoggedSet(data, 's1', exerciseId, setId, { reps: 5, weightKg: 102.5, done: true });
    data = addLoggedSet(data, 's1', exerciseId, 'extra');
    let sets = data.sessions[0]?.exercises[0]?.sets ?? [];
    expect(sets.at(-1)).toEqual({
      id: 'extra',
      weightKg: 102.5,
      reps: 5,
      durationSec: null,
      done: false,
    });
    data = removeLoggedSet(data, 's1', exerciseId, sets[0]?.id ?? '');
    sets = data.sessions[0]?.exercises[0]?.sets ?? [];
    expect(sets).toHaveLength(3);
    expect(userDataSchema.safeParse(data).success).toBe(true);
  });

  it('ticks sets off, filling empty reps or duration from a single-value target', () => {
    let data = startSession(
      planData(),
      { sessionId: 's1', planId: 'p1', dayId: 'd1' },
      T0,
      counter('id'),
    );
    const [squatEx, plankEx] = data.sessions[0]?.exercises ?? [];
    const squatSets = squatEx?.sets ?? [];
    data = setLoggedSetDone(data, 's1', squatEx?.id ?? '', squatSets[0]?.id ?? '', true);
    data = updateLoggedSet(data, 's1', squatEx?.id ?? '', squatSets[1]?.id ?? '', { reps: 3 });
    data = setLoggedSetDone(data, 's1', squatEx?.id ?? '', squatSets[1]?.id ?? '', true);
    data = setLoggedSetDone(data, 's1', plankEx?.id ?? '', plankEx?.sets[0]?.id ?? '', true);
    let session = data.sessions[0];
    expect(session?.exercises[0]?.sets.map((s) => [s.done, s.reps, s.durationSec])).toEqual([
      [true, 5, null],
      [true, 3, null],
      [false, null, null],
    ]);
    expect(session?.exercises[1]?.sets[0]).toMatchObject({
      done: true,
      durationSec: 60,
      reps: null,
    });
    // Un-ticking keeps the values; ticking an already done set changes nothing.
    data = setLoggedSetDone(data, 's1', squatEx?.id ?? '', squatSets[0]?.id ?? '', false);
    session = data.sessions[0];
    expect(session?.exercises[0]?.sets[0]).toMatchObject({ done: false, reps: 5 });
    expect(setLoggedSetDone(data, 's1', squatEx?.id ?? '', squatSets[1]?.id ?? '', true)).toBe(
      data,
    );
  });

  it('leaves reps empty when the target is a range', () => {
    let data = addPlanExercise(
      planData(),
      'p1',
      'd2',
      { id: 'e9', exercise: squat, target: { sets: 1, reps: '8-12' } },
      T0,
    );
    data = startSession(data, { sessionId: 's1', planId: 'p1', dayId: 'd2' }, T0, counter('id'));
    const exercise = data.sessions[0]?.exercises[0];
    data = setLoggedSetDone(data, 's1', exercise?.id ?? '', exercise?.sets[0]?.id ?? '', true);
    expect(data.sessions[0]?.exercises[0]?.sets[0]).toMatchObject({ done: true, reps: null });
  });

  it('finishes and deletes sessions, clearing the active one', () => {
    let data = startSession(
      planData(),
      { sessionId: 's1', planId: 'p1', dayId: 'd1' },
      T0,
      counter('id'),
    );
    data = finishSession(data, 's1', T1);
    expect(data.activeSessionId).toBeNull();
    expect(data.sessions[0]?.finishedAt).toBe(T1);
    expect(finishSession(data, 's1', T2)).toBe(data);
    data = startSession(data, { sessionId: 's2', planId: 'p1', dayId: 'd2' }, T2, counter('x'));
    expect(data.activeSessionId).toBe('s2');
    data = deleteSession(data, 's2');
    expect(data.activeSessionId).toBeNull();
    expect(data.sessions.map((session) => session.id)).toEqual(['s1']);
  });
});

describe('autofill from last time', () => {
  type Values = [number | null, number | null, number | null];

  /** The weight, reps and seconds of each set of the active session's exercise at `index`. */
  function values(data: UserData, index: number): Values[] {
    return (activeSession(data)?.exercises[index]?.sets ?? []).map((set) => [
      set.weightKg,
      set.reps,
      set.durationSec,
    ]);
  }

  /**
   * Starts day d1 as session `sessionId`, logs `logged` onto its exercise at
   * `index` (one patch per set row, adding rows as needed) and finishes it.
   */
  function logAndFinish(
    data: UserData,
    sessionId: string,
    index: number,
    logged: Partial<LoggedSet>[],
    now: [string, string],
  ): UserData {
    const ids = counter(`${sessionId}-`);
    let next = startSession(data, { sessionId, planId: 'p1', dayId: 'd1' }, now[0], ids);
    const exerciseId = activeSession(next)?.exercises[index]?.id ?? '';
    for (const [row, patch] of logged.entries()) {
      if (row >= (activeSession(next)?.exercises[index]?.sets.length ?? 0)) {
        next = addLoggedSet(next, sessionId, exerciseId, ids());
      }
      const setId = activeSession(next)?.exercises[index]?.sets[row]?.id ?? '';
      next = updateLoggedSet(next, sessionId, exerciseId, setId, patch);
    }
    return finishSession(next, sessionId, now[1]);
  }

  it("fills set n from last time's set n and later sets from its final set", () => {
    let data = logAndFinish(
      planData(),
      's1',
      0,
      [
        { weightKg: 60, reps: 8, done: true },
        { weightKg: 62.5, reps: 6, done: true },
        // Not ticked off: not part of last time.
        { weightKg: 70, reps: 1, done: false },
      ],
      [T0, T1],
    );
    data = startSession(data, { sessionId: 's2', planId: 'p1', dayId: 'd1' }, T2, counter('x'));
    expect(userDataSchema.safeParse(data).success).toBe(true);
    // The plan has 3 sets; last time 2 were done.
    expect(values(data, 0)).toEqual([
      [60, 8, null],
      [62.5, 6, null],
      [62.5, 6, null],
    ]);
    const exercise = activeSession(data)?.exercises[0];
    data = addLoggedSet(data, 's2', exercise?.id ?? '', 'added');
    expect(values(data, 0).at(-1)).toEqual([62.5, 6, null]);
    expect(activeSession(data)?.exercises[0]?.sets.at(-1)).toMatchObject({
      id: 'added',
      done: false,
    });
  });

  it("fills sets added later from last time's set at their position", () => {
    let data = logAndFinish(
      planData(),
      's1',
      0,
      [
        { weightKg: 60, reps: 8, done: true },
        { weightKg: 60, reps: 8, done: true },
        { weightKg: 60, reps: 8, done: true },
        { weightKg: 50, reps: 12, done: true },
      ],
      [T0, T1],
    );
    data = startSession(data, { sessionId: 's2', planId: 'p1', dayId: 'd1' }, T2, counter('x'));
    const exerciseId = activeSession(data)?.exercises[0]?.id ?? '';
    // Edited in this workout: an added set still copies last time's.
    const third = activeSession(data)?.exercises[0]?.sets[2]?.id ?? '';
    data = updateLoggedSet(data, 's2', exerciseId, third, { weightKg: 65, reps: 5 });
    data = addLoggedSet(data, 's2', exerciseId, 'fourth');
    data = addLoggedSet(data, 's2', exerciseId, 'fifth');
    expect(values(data, 0).slice(3)).toEqual([
      [50, 12, null],
      [50, 12, null],
    ]);
  });

  it('fills field by field, the amount the exercise is logged in only', () => {
    // Squat: no weight entered last time; plank: seconds (and stray reps).
    let data = logAndFinish(planData(), 's1', 0, [{ reps: 10, done: true }], [T0, T1]);
    data = logAndFinish(
      data,
      's2',
      1,
      [{ weightKg: 10, durationSec: 45, reps: 3, done: true }],
      [T2, T3],
    );
    data = startSession(
      data,
      { sessionId: 's3', planId: 'p1', dayId: 'd1' },
      '2026-01-15T10:00:00.000Z',
      counter('x'),
    );
    // The squat's weight is the target's (100 kg).
    expect(values(data, 0)).toEqual([
      [100, 10, null],
      [100, 10, null],
      [100, 10, null],
    ]);
    expect(values(data, 1)).toEqual([
      [10, null, 45],
      [10, null, 45],
    ]);
  });

  it('fills as before for an exercise never done: target weight, no reps', () => {
    let data = startSession(
      planData(),
      { sessionId: 's1', planId: 'p1', dayId: 'd1' },
      T0,
      counter('x'),
    );
    expect(values(data, 0)).toEqual([
      [100, null, null],
      [100, null, null],
      [100, null, null],
    ]);
    const exerciseId = activeSession(data)?.exercises[0]?.id ?? '';
    const first = activeSession(data)?.exercises[0]?.sets[2]?.id ?? '';
    data = updateLoggedSet(data, 's1', exerciseId, first, { weightKg: 90, reps: 4 });
    // Add set copies the previous row.
    data = addLoggedSet(data, 's1', exerciseId, 'added');
    expect(values(data, 0).at(-1)).toEqual([90, 4, null]);
  });

  it('logs autofilled values as they are when ticked', () => {
    let data = logAndFinish(planData(), 's1', 0, [{ weightKg: 60, reps: 8, done: true }], [T0, T1]);
    data = startSession(data, { sessionId: 's2', planId: 'p1', dayId: 'd1' }, T2, counter('x'));
    const exercise = activeSession(data)?.exercises[0];
    data = setLoggedSetDone(data, 's2', exercise?.id ?? '', exercise?.sets[0]?.id ?? '', true);
    expect(activeSession(data)?.exercises[0]?.sets[0]).toMatchObject({
      weightKg: 60,
      reps: 8,
      done: true,
    });
  });

  it('fills the rows of a new superset round from last time', () => {
    let data = supersetWithNext(planData(), 'p1', 'd1', 'e1', 'ss', T0);
    data = logAndFinish(data, 's1', 0, [{ weightKg: 80, reps: 6, done: true }], [T0, T1]);
    data = startSession(data, { sessionId: 's2', planId: 'p1', dayId: 'd1' }, T2, counter('x'));
    expect(activeSession(data)?.exercises.map((exercise) => exercise.supersetId)).toEqual([
      'ss',
      'ss',
    ]);
    data = addLoggedRound(data, 's2', 'ss', counter('round'));
    expect(values(data, 0).at(-1)).toEqual([80, 6, null]);
    // The plank was never done: its new row copies the previous one.
    expect(values(data, 1).at(-1)).toEqual([null, null, null]);
  });
});

describe('selectors', () => {
  function logged(): UserData {
    const ids = counter('id');
    let data = startSession(planData(), { sessionId: 's1', planId: 'p1', dayId: 'd1' }, T0, ids);
    const first = data.sessions[0]?.exercises[0];
    data = updateLoggedSet(data, 's1', first?.id ?? '', first?.sets[0]?.id ?? '', {
      reps: 5,
      weightKg: 60,
      done: true,
    });
    data = updateLoggedSet(data, 's1', first?.id ?? '', first?.sets[1]?.id ?? '', {
      reps: 4,
      weightKg: 60,
      done: false,
    });
    data = finishSession(data, 's1', T1);
    data = startSession(data, { sessionId: 's2', planId: 'p1', dayId: 'd1' }, T2, ids);
    const second = data.sessions[1]?.exercises[0];
    data = updateLoggedSet(data, 's2', second?.id ?? '', second?.sets[0]?.id ?? '', {
      reps: 5,
      weightKg: 70,
      done: true,
    });
    return data;
  }

  it('finds the last finished session with done sets for an exercise', () => {
    let data = logged();
    // s2 is still in progress: last time is s1, with only its done set.
    let last = lastTimeFor(data.sessions, squat, 's2');
    expect(last?.session.id).toBe('s1');
    expect(last?.sets.map((set) => set.weightKg)).toEqual([60]);
    data = finishSession(data, 's2', T3);
    last = lastTimeFor(data.sessions, squat);
    expect(last?.session.id).toBe('s2');
    expect(last?.sets.map((set) => set.weightKg)).toEqual([70]);
    expect(lastTimeFor(data.sessions, squat, 's2')?.session.id).toBe('s1');
    // No set of the plank was done.
    expect(lastTimeFor(data.sessions, plank)).toBeNull();
    expect(
      lastTimeFor(data.sessions, { kind: 'custom', customExerciseId: 'barbell-squat', name: 'x' }),
    ).toBeNull();
  });

  it('lists history newest first, finished sessions only', () => {
    let data = logged();
    expect(history(data.sessions).map((session) => session.id)).toEqual(['s1']);
    data = finishSession(data, 's2', T3);
    expect(history(data.sessions).map((session) => session.id)).toEqual(['s2', 's1']);
  });

  it('compares references by id, not name', () => {
    expect(sameExercise(squat, { ...squat, name: 'Back squat' })).toBe(true);
    expect(sameExercise(squat, plank)).toBe(false);
  });

  it('counts days and exercises', () => {
    const plan = planData().plans[0];
    expect(plan && planStats(plan)).toEqual({ days: 2, exercises: 2 });
  });
});

describe('custom exercises', () => {
  const input = {
    name: '  Zercher carry ',
    notes: ' hold the bar in the elbows ',
    equipment: 'barbell' as const,
    primaryMuscles: ['quadriceps', 'quadriceps'] as const,
    secondaryMuscles: ['quadriceps', 'abdominals'] as const,
    instructions: [' Pick up the bar ', '', 'Walk'],
  };

  it('normalises input', () => {
    expect(
      normalizeCustomExerciseInput({
        ...input,
        primaryMuscles: [...input.primaryMuscles],
        secondaryMuscles: [...input.secondaryMuscles],
      }),
    ).toEqual({
      name: 'Zercher carry',
      notes: 'hold the bar in the elbows',
      equipment: 'barbell',
      primaryMuscles: ['quadriceps'],
      secondaryMuscles: ['abdominals'],
      instructions: ['Pick up the bar', 'Walk'],
    });
  });

  it('creates, updates (renaming plan snapshots) and deletes', () => {
    let data = createCustomExercise(planData(), 'c1', input, T0);
    data = addPlanExercise(
      data,
      'p1',
      'd2',
      {
        id: 'e3',
        exercise: { kind: 'custom', customExerciseId: 'c1', name: 'Zercher carry' },
        target: { sets: 3, reps: '10' },
      },
      T0,
    );
    expect(userDataSchema.safeParse(data).success).toBe(true);
    data = updateCustomExercise(data, 'c1', { ...input, name: 'Zercher walk' }, T1);
    expect(data.customExercises[0]).toMatchObject({
      name: 'Zercher walk',
      updatedAt: T1,
      createdAt: T0,
    });
    expect(data.plans[0]?.days[1]?.exercises[0]?.exercise.name).toBe('Zercher walk');
    expect(updateCustomExercise(data, 'nope', input, T1)).toBe(data);
    data = deleteCustomExercise(data, 'c1');
    expect(data.customExercises).toEqual([]);
    // The plan keeps the name snapshot.
    expect(data.plans[0]?.days[1]?.exercises[0]?.exercise.name).toBe('Zercher walk');
  });
});

describe('settings', () => {
  it('sets the unit and catalog meta', () => {
    const data = emptyUserData();
    expect(setUnit(data, 'kg')).toBe(data);
    expect(setUnit(data, 'lb').settings.unit).toBe('lb');
    expect(setCatalogMeta(data, { revision: null })).toBe(data);
    expect(setCatalogMeta(data, { lastCheckedAt: T0 }).catalogMeta).toEqual({
      lastCheckedAt: T0,
      revision: null,
    });
  });

  it('defaults the rest to 90 s and sets it', () => {
    const data = emptyUserData();
    expect(data.settings.defaultRestSec).toBe(90);
    expect(setDefaultRest(data, 90)).toBe(data);
    const changed = setDefaultRest(data, 120);
    expect(changed.settings).toEqual({ unit: 'kg', defaultRestSec: 120 });
    expect(userDataSchema.safeParse(changed).success).toBe(true);
  });

  it('accepts a default rest of 0 to 3600 whole seconds', () => {
    const settings = emptyUserData().settings;
    for (const value of [0, 1, 3600]) {
      const parsed = userDataSchema.safeParse(setDefaultRest(emptyUserData(), value));
      expect(parsed.success, String(value)).toBe(true);
    }
    for (const value of [-1, 3601, 1.5]) {
      const data = { ...emptyUserData(), settings: { ...settings, defaultRestSec: value } };
      expect(userDataSchema.safeParse(data).success, String(value)).toBe(false);
    }
  });
});

describe('targets', () => {
  it('defaults timed targets for static exercises', () => {
    expect(defaultTarget('static')).toEqual({ sets: 3, durationSec: 30 });
    expect(defaultTarget('push')).toEqual({ sets: 3, reps: '10' });
    expect(defaultTarget()).toEqual({ sets: 3, reps: '10' });
  });

  it('formats targets and durations', () => {
    expect(formatTarget({ sets: 3, reps: '8-12', weightKg: 60 }, 'kg')).toBe('3 × 8–12 · 60 kg');
    expect(formatTarget({ sets: 3, reps: '8-12', weightKg: 60 }, 'lb')).toBe('3 × 8–12 · 132.3 lb');
    expect(formatTarget({ sets: 2, durationSec: 90 }, 'kg')).toBe('2 × 1 min 30 s');
    expect(formatDuration(45)).toBe('45 s');
    expect(formatDuration(120)).toBe('2 min');
  });

  it('adds the rest time when there is one', () => {
    expect(formatTargetWithRest({ sets: 3, reps: '8', weightKg: 60, restSec: 90 }, 'kg')).toBe(
      '3 × 8 · 60 kg · Rest 1 min 30 s',
    );
    expect(formatTargetWithRest({ sets: 2, durationSec: 45, restSec: 0 }, 'kg')).toBe(
      '2 × 45 s · Rest 0 s',
    );
    expect(formatTargetWithRest({ sets: 3, reps: '8-12' }, 'kg')).toBe('3 × 8–12');
  });
});
