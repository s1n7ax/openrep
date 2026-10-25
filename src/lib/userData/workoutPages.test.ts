import { describe, expect, it } from 'vitest';
import type { LoggedSet, Session, SessionExercise } from '../schema/userData.ts';
import { groupBlocks } from './supersets.ts';
import { firstOpenPage, hasEntries, nextSupersetPosition } from './workoutPages.ts';

function set(id: string, patch: Partial<LoggedSet> = {}): LoggedSet {
  return { id, weightKg: null, reps: null, durationSec: null, done: false, ...patch };
}

function exercise(
  id: string,
  sets: LoggedSet[],
  options: { target?: SessionExercise['target']; supersetId?: string } = {},
): SessionExercise {
  const entry: SessionExercise = {
    id,
    exercise: { kind: 'catalog', exerciseId: 'barbell-squat', name: 'Squat' },
    target: options.target ?? { sets: sets.length, reps: '8' },
    sets,
  };
  if (options.supersetId !== undefined) entry.supersetId = options.supersetId;
  return entry;
}

function session(exercises: SessionExercise[], supersetIds: string[] = []): Session {
  return {
    id: 's1',
    planId: 'p1',
    planName: 'Plan',
    dayId: 'd1',
    dayName: 'Day A',
    startedAt: '2026-01-01T10:00:00.000Z',
    finishedAt: null,
    exercises,
    ...(supersetIds.length > 0 ? { supersets: supersetIds.map((id) => ({ id })) } : {}),
  };
}

function blocks(value: Session) {
  return groupBlocks(value.exercises, value.supersets);
}

describe('firstOpenPage', () => {
  it('opens a new workout on its first exercise', () => {
    const value = session([exercise('e1', [set('a'), set('b')]), exercise('e2', [set('c')])]);
    expect(firstOpenPage(blocks(value))).toBe(0);
  });

  it('skips exercises whose sets are all ticked off', () => {
    const value = session([
      exercise('e1', [set('a', { done: true }), set('b', { done: true })]),
      exercise('e2', [set('c', { done: true }), set('d')]),
    ]);
    expect(firstOpenPage(blocks(value))).toBe(1);
  });

  it('counts a superset as one page', () => {
    const value = session(
      [
        exercise('e1', [set('a', { done: true })], { supersetId: 'x' }),
        exercise('e2', [set('b')], { supersetId: 'x' }),
        exercise('e3', [set('c')]),
      ],
      ['x'],
    );
    expect(firstOpenPage(blocks(value))).toBe(0);
  });

  it('opens on the finish page when every set is ticked off', () => {
    const value = session([exercise('e1', [set('a', { done: true })])]);
    expect(firstOpenPage(blocks(value))).toBe(1);
  });
});

describe('nextSupersetPosition', () => {
  it('is the exercise of the first row not ticked off, round by round', () => {
    const entries = [
      exercise('e1', [set('a', { done: true }), set('b')], { supersetId: 'x' }),
      exercise('e2', [set('c'), set('d')], { supersetId: 'x' }),
    ];
    expect(nextSupersetPosition(entries)).toBe(1);
    entries[1]!.sets[0]!.done = true;
    expect(nextSupersetPosition(entries)).toBe(0);
  });

  it('is the first exercise when nothing or everything is ticked off', () => {
    expect(nextSupersetPosition([exercise('e1', [set('a')]), exercise('e2', [set('b')])])).toBe(0);
    const done = [exercise('e1', [set('a', { done: true })]), exercise('e2', [])];
    expect(nextSupersetPosition(done)).toBe(0);
  });
});

describe('hasEntries', () => {
  const target = { sets: 2, reps: '8', weightKg: 60 };
  const untouched = () =>
    exercise('e1', [set('a', { weightKg: 60 }), set('b', { weightKg: 60 })], { target });

  it('is false for a workout as it started', () => {
    expect(hasEntries(session([untouched()]), [])).toBe(false);
    expect(
      hasEntries(
        session([exercise('e1', [set('a')], { target: { sets: 1, durationSec: 30 } })]),
        [],
      ),
    ).toBe(false);
    // A range shows its low end in the circles, but nothing is entered until a tick.
    expect(
      hasEntries(session([exercise('e1', [set('a')], { target: { sets: 1, reps: '10-12' } })]), []),
    ).toBe(false);
  });

  it('is true once a set is ticked off or a value is typed in', () => {
    for (const patch of [
      { done: true },
      { reps: 8 },
      { durationSec: 30 },
      { weightKg: 62.5 },
      { weightKg: null },
    ]) {
      const entry = untouched();
      entry.sets[1] = { ...entry.sets[1]!, ...patch };
      expect(hasEntries(session([entry]), []), JSON.stringify(patch)).toBe(true);
    }
  });

  it('is true once sets are added or removed', () => {
    const added = untouched();
    added.sets.push(set('c', { weightKg: 60 }));
    expect(hasEntries(session([added]), [])).toBe(true);
    const removed = untouched();
    removed.sets.pop();
    expect(hasEntries(session([removed]), [])).toBe(true);
  });

  it('compares with the values filled in from last time', () => {
    const last: Session = {
      ...session([
        exercise('old', [
          set('x', { weightKg: 60, reps: 8, done: true }),
          set('y', { weightKg: 62.5, reps: 6, done: true }),
        ]),
      ]),
      id: 'old-session',
      finishedAt: '2026-01-01T11:00:00.000Z',
    };
    const filled = () =>
      exercise('e1', [set('a', { weightKg: 60, reps: 8 }), set('b', { weightKg: 62.5, reps: 6 })], {
        target,
      });
    expect(hasEntries(session([filled()]), [last])).toBe(false);
    // Without that history, the same values were typed in.
    expect(hasEntries(session([filled()]), [])).toBe(true);
    const edited = filled();
    edited.sets[1] = { ...edited.sets[1]!, reps: 7 };
    expect(hasEntries(session([edited]), [last])).toBe(true);
  });
});
