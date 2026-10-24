import { describe, expect, it } from 'vitest';
import { createBackup, parseBackup, serializeBackup } from '../backup.ts';
import { emptyUserData, userDataSchema, type PlanDay, type UserData } from '../schema/userData.ts';
import {
  addPlanExercise,
  createPlan,
  dayBlocks,
  deletePlanExercise,
  movePlanExercise,
  moveSuperset,
  removeFromSuperset,
  setSupersetRest,
  setSupersetRounds,
  supersetWithNext,
  ungroupSuperset,
  updatePlanExerciseTarget,
} from './plans.ts';
import { activeSession, lastTimeFor } from './selectors.ts';
import {
  addLoggedRound,
  finishSession,
  removeLastLoggedSet,
  setLoggedSetDone,
  startSession,
} from './sessions.ts';
import { groupBlocks, normalizeSupersets, supersetLetter, supersetRounds } from './supersets.ts';
import { formatSupersetExerciseTarget, formatSupersetSummary } from './targets.ts';
import { sessionSetCounts } from './workoutText.ts';

const T0 = '2026-01-01T10:00:00.000Z';
const T1 = '2026-01-02T10:00:00.000Z';

const bench = {
  kind: 'catalog',
  exerciseId: 'barbell-bench-press-medium-grip',
  name: 'Bench Press',
} as const;
const flyes = { kind: 'catalog', exerciseId: 'dumbbell-flyes', name: 'Dumbbell Flyes' } as const;
const pushdown = {
  kind: 'catalog',
  exerciseId: 'triceps-pushdown',
  name: 'Triceps Pushdown',
} as const;
const plank = { kind: 'catalog', exerciseId: 'plank', name: 'Plank' } as const;

function counter(prefix: string) {
  let next = 0;
  return () => `${prefix}${next++}`;
}

/** Plan "p1", day "d1": e1 Bench (3 × 8, rest 90), e2 Flyes (4 × 12), e3 Pushdown, e4 Plank. */
function seeded(): UserData {
  let data = createPlan(
    emptyUserData(),
    { id: 'p1', name: 'Push', firstDay: { id: 'd1', name: 'Push' } },
    T0,
  );
  const add = (
    id: string,
    exercise: typeof bench | typeof flyes | typeof pushdown | typeof plank,
    target: object,
  ) => {
    data = addPlanExercise(data, 'p1', 'd1', { id, exercise, target: { sets: 3, ...target } }, T0);
  };
  add('e1', bench, { reps: '8', weightKg: 60, restSec: 90, notes: 'Pause at the chest' });
  add('e2', flyes, { sets: 4, reps: '12', restSec: 45 });
  add('e3', pushdown, { reps: '10-12', restSec: 60 });
  add('e4', plank, { durationSec: 30 });
  return data;
}

function day(data: UserData): PlanDay {
  return data.plans[0]!.days[0]!;
}

function ids(data: UserData): string[] {
  return day(data).exercises.map((entry) => entry.id);
}

/** The day's blocks as ids: "e3" for an exercise, "A[e1,e2]" for a superset. */
function shape(data: UserData): string[] {
  return dayBlocks(day(data)).map((block) =>
    block.kind === 'exercise'
      ? block.entry.id
      : `${block.letter}[${block.entries.map((entry) => entry.id).join(',')}]`,
  );
}

/** `data` with day "d1"'s exercises naming the given supersets, as a hand-edited backup could. */
function withSupersetIds(data: UserData, supersetIds: Record<string, string>): UserData {
  const plan = data.plans[0]!;
  const exercises = day(data).exercises.map((entry) => {
    const supersetId = supersetIds[entry.id];
    return supersetId === undefined ? entry : { ...entry, supersetId };
  });
  return { ...data, plans: [{ ...plan, days: [{ ...day(data), exercises }] }] };
}

/** Bench and Flyes grouped (superset "s1"), then rounds 3 and rest 90 s. */
function grouped(): UserData {
  return supersetWithNext(seeded(), 'p1', 'd1', 'e1', 's1', T1);
}

describe('supersetLetter and groupBlocks', () => {
  it('letters supersets like spreadsheet columns', () => {
    expect([0, 1, 25, 26, 27, 51, 52].map(supersetLetter)).toEqual([
      'A',
      'B',
      'Z',
      'AA',
      'AB',
      'AZ',
      'BA',
    ]);
  });

  it('groups adjacent exercises of an existing superset and letters supersets in order', () => {
    const entries = [
      { id: 'a', supersetId: 's1' },
      { id: 'b', supersetId: 's1' },
      { id: 'c' },
      { id: 'd', supersetId: 's2' },
      { id: 'e', supersetId: 's2' },
      { id: 'f', supersetId: 's2' },
    ];
    const blocks = groupBlocks(entries, [{ id: 's2' }, { id: 's1', restSec: 90 }]);
    expect(blocks.map((block) => block.kind)).toEqual(['superset', 'exercise', 'superset']);
    expect(blocks[0]).toMatchObject({ letter: 'A', superset: { id: 's1', restSec: 90 } });
    expect(blocks[1]).toMatchObject({ entry: { id: 'c' }, index: 2 });
    expect(blocks[2]).toMatchObject({ letter: 'B', superset: { id: 's2' } });
    expect(blocks[2]?.kind === 'superset' && blocks[2].entries.map((e) => e.id)).toEqual([
      'd',
      'e',
      'f',
    ]);
  });

  it('shows a lone or unknown superset exercise on its own', () => {
    const entries = [{ id: 'a', supersetId: 's1' }, { id: 'b' }, { id: 'c', supersetId: 'gone' }];
    const blocks = groupBlocks(entries, [{ id: 's1' }]);
    expect(blocks.map((block) => block.kind)).toEqual(['exercise', 'exercise', 'exercise']);
    expect(groupBlocks([{ id: 'a' }, { id: 'b' }], undefined)).toHaveLength(2);
  });

  it('dissolves supersets with fewer than two exercises', () => {
    const entries = [
      { id: 'a', sets: 3, supersetId: 's1' },
      { id: 'b', sets: 3, restSec: 30 },
      { id: 'c', sets: 3, supersetId: 'gone' },
    ];
    const normal = normalizeSupersets(entries, [{ id: 's1', restSec: 90 }]);
    expect(normal).toEqual({
      entries: [
        { id: 'a', sets: 3, restSec: 90 },
        { id: 'b', sets: 3, restSec: 30 },
        { id: 'c', sets: 3 },
      ],
      supersets: [],
    });
    const fine = [
      { id: 'a', sets: 3, supersetId: 's1' },
      { id: 'b', sets: 3, supersetId: 's1' },
    ];
    const supersets = [{ id: 's1' }];
    const same = normalizeSupersets(fine, supersets);
    expect(same.entries).toBe(fine);
    expect(same.supersets).toBe(supersets);
  });

  it('lays out logged sets round by round', () => {
    const rounds = supersetRounds([
      { id: 'a', sets: ['a1', 'a2', 'a3'] },
      { id: 'b', sets: ['b1', 'b2'] },
    ]);
    expect(rounds.map((round) => round.map((row) => row.set))).toEqual([
      ['a1', 'b1'],
      ['a2', 'b2'],
      ['a3'],
    ]);
    expect(rounds[2]?.[0]).toMatchObject({ position: 0, setIndex: 2 });
    expect(supersetRounds([])).toEqual([]);
  });
});

describe('superset plan updates', () => {
  it('groups two exercises with the first one’s sets as rounds and its rest after each round', () => {
    const data = grouped();
    expect(shape(data)).toEqual(['A[e1,e2]', 'e3', 'e4']);
    const [e1, e2] = day(data).exercises;
    expect(e1).toEqual({
      id: 'e1',
      exercise: bench,
      sets: 3,
      reps: '8',
      weightKg: 60,
      notes: 'Pause at the chest',
      supersetId: 's1',
    });
    expect(e2).toEqual({ id: 'e2', exercise: flyes, sets: 3, reps: '12', supersetId: 's1' });
    expect(day(data).supersets).toEqual([{ id: 's1', restSec: 90 }]);
    expect(data.plans[0]?.updatedAt).toBe(T1);
    expect(userDataSchema.safeParse(data).success).toBe(true);
  });

  it('sets the round count of every exercise and the rest after each round', () => {
    let data = setSupersetRounds(grouped(), 'p1', 'd1', 's1', 5, T1);
    expect(day(data).exercises.map((entry) => entry.sets)).toEqual([5, 5, 3, 3]);
    data = setSupersetRest(data, 'p1', 'd1', 's1', 120, T1);
    expect(day(data).supersets).toEqual([{ id: 's1', restSec: 120 }]);
    data = setSupersetRest(data, 'p1', 'd1', 's1', undefined, T1);
    expect(day(data).supersets).toEqual([{ id: 's1' }]);
    expect(setSupersetRounds(data, 'p1', 'd1', 's1', 5, T1)).toBe(data);
    expect(setSupersetRest(data, 'p1', 'd1', 'nope', 30, T1)).toBe(data);
  });

  it('builds a tri-set and adds exercises to either end of a superset', () => {
    let data = supersetWithNext(grouped(), 'p1', 'd1', 'e2', 'unused', T1);
    expect(shape(data)).toEqual(['A[e1,e2,e3]', 'e4']);
    expect(day(data).exercises[2]).toEqual({
      id: 'e3',
      exercise: pushdown,
      sets: 3,
      reps: '10-12',
      supersetId: 's1',
    });
    expect(day(data).supersets).toEqual([{ id: 's1', restSec: 90 }]);

    // An exercise before a superset joins it at the start.
    data = movePlanExercise(data, 'p1', 'd1', 'e4', -1, T1);
    expect(shape(data)).toEqual(['e4', 'A[e1,e2,e3]']);
    data = supersetWithNext(data, 'p1', 'd1', 'e4', 'unused', T1);
    expect(shape(data)).toEqual(['A[e4,e1,e2,e3]']);
    expect(day(data).supersets).toEqual([{ id: 's1', restSec: 90 }]);
    expect(day(data).exercises[0]).toMatchObject({ sets: 3, durationSec: 30, supersetId: 's1' });
  });

  it('merges two supersets into the first', () => {
    let data = supersetWithNext(grouped(), 'p1', 'd1', 'e3', 's2', T1);
    expect(shape(data)).toEqual(['A[e1,e2]', 'B[e3,e4]']);
    data = setSupersetRounds(data, 'p1', 'd1', 's2', 4, T1);
    data = supersetWithNext(data, 'p1', 'd1', 'e1', 'unused', T1);
    expect(shape(data)).toEqual(['A[e1,e2,e3,e4]']);
    expect(day(data).supersets).toEqual([{ id: 's1', restSec: 90 }]);
    expect(day(data).exercises.map((entry) => entry.sets)).toEqual([3, 3, 3, 3]);
  });

  it('does nothing without a next block', () => {
    const data = grouped();
    expect(supersetWithNext(data, 'p1', 'd1', 'e4', 's9', T1)).toBe(data);
    expect(supersetWithNext(data, 'p1', 'd1', 'nope', 's9', T1)).toBe(data);
  });

  it('ungroups a superset into normal exercises in the same order', () => {
    let data = supersetWithNext(grouped(), 'p1', 'd1', 'e2', 'unused', T1);
    data = ungroupSuperset(data, 'p1', 'd1', 's1', T1);
    expect(shape(data)).toEqual(['e1', 'e2', 'e3', 'e4']);
    expect(day(data)).not.toHaveProperty('supersets');
    expect(day(data).exercises.slice(0, 3)).toEqual([
      {
        id: 'e1',
        exercise: bench,
        sets: 3,
        reps: '8',
        weightKg: 60,
        notes: 'Pause at the chest',
        restSec: 90,
      },
      { id: 'e2', exercise: flyes, sets: 3, reps: '12', restSec: 90 },
      { id: 'e3', exercise: pushdown, sets: 3, reps: '10-12', restSec: 90 },
    ]);
    expect(ungroupSuperset(data, 'p1', 'd1', 's1', T1)).toBe(data);
  });

  it('takes an exercise out of a superset, after it', () => {
    let data = supersetWithNext(grouped(), 'p1', 'd1', 'e2', 'unused', T1);
    data = removeFromSuperset(data, 'p1', 'd1', 'e1', T1);
    expect(shape(data)).toEqual(['A[e2,e3]', 'e1', 'e4']);
    expect(day(data).exercises[2]).toMatchObject({ id: 'e1', sets: 3, restSec: 90 });
    expect(day(data).exercises[2]).not.toHaveProperty('supersetId');
    expect(removeFromSuperset(data, 'p1', 'd1', 'e4', T1)).toBe(data);
  });

  it('turns a superset left with one exercise into a normal exercise', () => {
    // Taking one out of two.
    let data = removeFromSuperset(grouped(), 'p1', 'd1', 'e2', T1);
    expect(shape(data)).toEqual(['e1', 'e2', 'e3', 'e4']);
    expect(day(data)).not.toHaveProperty('supersets');
    expect(day(data).exercises[0]).toMatchObject({ id: 'e1', sets: 3, restSec: 90 });
    expect(day(data).exercises[0]).not.toHaveProperty('supersetId');

    // Deleting one of two.
    data = deletePlanExercise(grouped(), 'p1', 'd1', 'e1', T1);
    expect(shape(data)).toEqual(['e2', 'e3', 'e4']);
    expect(day(data)).not.toHaveProperty('supersets');
    expect(day(data).exercises[0]).toEqual({
      id: 'e2',
      exercise: flyes,
      sets: 3,
      reps: '12',
      restSec: 90,
    });
  });

  it('moves exercises within a superset, and other exercises and supersets past whole blocks', () => {
    let data = grouped();
    data = movePlanExercise(data, 'p1', 'd1', 'e2', -1, T1);
    expect(shape(data)).toEqual(['A[e2,e1]', 'e3', 'e4']);
    // Not out of the superset.
    expect(movePlanExercise(data, 'p1', 'd1', 'e2', -1, T1)).toBe(data);
    expect(movePlanExercise(data, 'p1', 'd1', 'e1', 1, T1)).toBe(data);
    // A normal exercise jumps over the whole superset.
    data = movePlanExercise(data, 'p1', 'd1', 'e3', -1, T1);
    expect(shape(data)).toEqual(['e3', 'A[e2,e1]', 'e4']);
    // The whole superset moves.
    data = moveSuperset(data, 'p1', 'd1', 's1', 1, T1);
    expect(shape(data)).toEqual(['e3', 'e4', 'A[e2,e1]']);
    expect(moveSuperset(data, 'p1', 'd1', 's1', 1, T1)).toBe(data);
    data = moveSuperset(data, 'p1', 'd1', 's1', -1, T1);
    expect(shape(data)).toEqual(['e3', 'A[e2,e1]', 'e4']);
    expect(ids(data)).toEqual(['e3', 'e2', 'e1', 'e4']);
  });

  it('keeps an exercise in its superset, with the round count and no rest, when its target changes', () => {
    const data = updatePlanExerciseTarget(
      grouped(),
      'p1',
      'd1',
      'e2',
      { sets: 9, durationSec: 40, weightKg: 12, restSec: 30, notes: 'Slow' },
      T1,
    );
    expect(day(data).exercises[1]).toEqual({
      id: 'e2',
      exercise: flyes,
      sets: 3,
      durationSec: 40,
      weightKg: 12,
      notes: 'Slow',
      supersetId: 's1',
    });
  });

  it('edits an exercise naming a superset it is not grouped into as a normal exercise', () => {
    // e3 names a superset that does not exist; e4 names s1 but is not next to it.
    let data = withSupersetIds(grouped(), { e3: 'gone', e4: 's1' });
    expect(shape(data)).toEqual(['A[e1,e2]', 'e3', 'e4']);
    data = updatePlanExerciseTarget(
      data,
      'p1',
      'd1',
      'e3',
      { sets: 4, reps: '10', restSec: 90 },
      T1,
    );
    expect(day(data).exercises[2]).toEqual({
      id: 'e3',
      exercise: pushdown,
      sets: 4,
      reps: '10',
      restSec: 90,
    });
    // The round count of s1 is only the sets of the exercises it groups.
    data = setSupersetRounds(data, 'p1', 'd1', 's1', 5, T1);
    expect(day(data).exercises.map((entry) => entry.sets)).toEqual([5, 5, 4, 3]);
    data = updatePlanExerciseTarget(
      data,
      'p1',
      'd1',
      'e4',
      { sets: 2, durationSec: 45, restSec: 30 },
      T1,
    );
    expect(day(data).exercises[3]).toEqual({
      id: 'e4',
      exercise: plank,
      sets: 2,
      durationSec: 45,
      restSec: 30,
    });
    expect(shape(data)).toEqual(['A[e1,e2]', 'e3', 'e4']);
  });
});

describe('superset workouts', () => {
  /** The grouped day started as session "w1", with ids from a counter. */
  function started(data = grouped()): UserData {
    return startSession(data, { sessionId: 'w1', planId: 'p1', dayId: 'd1' }, T1, counter('x'));
  }

  it('starts with the day’s supersets and one set per round for each exercise', () => {
    const data = started();
    const session = activeSession(data)!;
    expect(session.supersets).toEqual([{ id: 's1', restSec: 90 }]);
    expect(session.exercises.map((exercise) => exercise.supersetId)).toEqual([
      's1',
      's1',
      undefined,
      undefined,
    ]);
    expect(session.exercises[1]?.target).toEqual({ sets: 3, reps: '12' });
    expect(session.exercises.map((exercise) => exercise.sets.length)).toEqual([3, 3, 3, 3]);
    const blocks = groupBlocks(session.exercises, session.supersets);
    expect(blocks.map((block) => block.kind)).toEqual(['superset', 'exercise', 'exercise']);
    expect(userDataSchema.safeParse(data).success).toBe(true);
  });

  it('starts a day without supersets exactly as before', () => {
    const session = activeSession(started(seeded()))!;
    expect(session).not.toHaveProperty('supersets');
    for (const exercise of session.exercises) expect(exercise).not.toHaveProperty('supersetId');
  });

  it('adds a round: one set to each exercise of the superset', () => {
    let data = started();
    const rounds = (current: UserData) => {
      const session = activeSession(current)!;
      const superset = groupBlocks(session.exercises, session.supersets)[0]!;
      return superset.kind === 'superset' ? supersetRounds(superset.entries) : [];
    };
    // Ticking all six rows of the three rounds.
    for (const round of rounds(data)) {
      for (const row of round) {
        data = setLoggedSetDone(data, 'w1', row.entry.id, row.set.id, true);
      }
    }
    expect(sessionSetCounts(activeSession(data)!)).toEqual({ done: 6, total: 12 });
    data = addLoggedRound(data, 'w1', 's1', counter('r'));
    expect(rounds(data)).toHaveLength(4);
    expect(rounds(data)[3]?.map((row) => [row.entry.id, row.set.id])).toEqual([
      ['x0', 'r0'],
      ['x4', 'r1'],
    ]);
    expect(rounds(data)[3]?.[0]?.set).toMatchObject({ weightKg: 60, reps: 8, done: false });
    expect(sessionSetCounts(activeSession(data)!)).toEqual({ done: 6, total: 14 });
    expect(addLoggedRound(data, 'w1', 'nope', counter('q'))).toBe(data);
  });

  it('keeps rounds when a set of one exercise is removed', () => {
    let data = started();
    const session = activeSession(data)!;
    data = removeLastLoggedSet(data, 'w1', session.exercises[1]!.id);
    const after = activeSession(data)!;
    const superset = groupBlocks(after.exercises, after.supersets)[0]!;
    expect(
      superset.kind === 'superset' && supersetRounds(superset.entries).map((r) => r.length),
    ).toEqual([2, 2, 1]);
  });

  it('shows last time for each exercise of a superset', () => {
    let data = started();
    const session = activeSession(data)!;
    for (const exercise of session.exercises.slice(0, 2)) {
      data = setLoggedSetDone(data, 'w1', exercise.id, exercise.sets[0]!.id, true);
    }
    data = finishSession(data, 'w1', T1);
    expect(lastTimeFor(data.sessions, bench)?.sets).toHaveLength(1);
    expect(lastTimeFor(data.sessions, flyes)?.sets).toEqual([
      expect.objectContaining({ reps: 12, done: true }),
    ]);
  });
});

describe('supersets in backups', () => {
  it('survive a backup round trip', () => {
    let data = grouped();
    data = startSession(data, { sessionId: 'w1', planId: 'p1', dayId: 'd1' }, T1, counter('x'));
    data = finishSession(data, 'w1', T1);
    const restored = parseBackup(serializeBackup(createBackup(data, T1))).data;
    expect(restored).toEqual(data);
    expect(restored.plans[0]?.days[0]?.supersets).toEqual([{ id: 's1', restSec: 90 }]);
    expect(restored.sessions[0]?.supersets).toEqual([{ id: 's1', restSec: 90 }]);
  });
});

describe('superset text', () => {
  it('formats the summary of a superset', () => {
    expect(formatSupersetSummary(3, 90)).toBe('3 rounds · rest 90 s after each round');
    expect(formatSupersetSummary(1, undefined)).toBe('1 round');
    expect(formatSupersetSummary(4, 0)).toBe('4 rounds · rest 0 s after each round');
  });

  it('formats what an exercise of a superset does each round', () => {
    expect(formatSupersetExerciseTarget({ reps: '8-12', weightKg: 60 }, 'kg')).toBe(
      '8–12 reps · 60 kg',
    );
    expect(formatSupersetExerciseTarget({ reps: '1' }, 'kg')).toBe('1 rep');
    expect(formatSupersetExerciseTarget({ durationSec: 90, weightKg: 20 }, 'lb')).toBe(
      '1 min 30 s · 44.1 lb',
    );
  });
});
