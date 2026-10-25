/**
 * The workout screen shows a session one block (exercise or superset) per
 * page, then a page to finish it. These helpers say where it opens, where it
 * moves on to once a block is done, which exercise of a superset is next,
 * and whether going back would lose anything.
 */
import type { Session, SessionExercise } from '../schema/userData.ts';
import { lastSetsFor, prefilledSet } from './sessions.ts';
import { nextSet } from './setCircles.ts';
import { blockEntries, type Block } from './supersets.ts';

/** Whether `block` has a set not ticked off. */
export function hasSetsLeft(block: Block<SessionExercise>): boolean {
  return blockEntries(block).some((entry) => entry.sets.some((set) => !set.done));
}

/**
 * The page a workout opens on: the first block with a set not ticked off,
 * or `blocks.length` (the finish page) when every set is.
 */
export function firstOpenPage(blocks: readonly Block<SessionExercise>[]): number {
  return nextOpenPage(blocks, -1);
}

/**
 * The page to move on to from the block at `index` once it is done: the
 * first block after it with a set not ticked off, or `blocks.length` (the
 * finish page) when none is left after it.
 */
export function nextOpenPage(blocks: readonly Block<SessionExercise>[], index: number): number {
  const next = blocks.findIndex((block, position) => position > index && hasSetsLeft(block));
  return next === -1 ? blocks.length : next;
}

/**
 * The position in a superset (0 for A1) of the exercise whose set comes
 * next: that of the first row, round by round, not ticked off; 0 when every
 * row is.
 */
export function nextSupersetPosition(entries: readonly SessionExercise[]): number {
  return nextSet(entries)?.position ?? 0;
}

/**
 * Whether anything was entered since the workout started: a set ticked off,
 * a weight, reps or seconds other than the row started with (see
 * `prefilledSet`; `sessions` holds the history it was filled from), or sets
 * added or removed.
 */
export function hasEntries(session: Session, sessions: readonly Session[]): boolean {
  return session.exercises.some((exercise) => {
    if (exercise.sets.length !== exercise.target.sets) return true;
    const lastSets = lastSetsFor(sessions, exercise.exercise, session.id);
    return exercise.sets.some((set, index) => {
      if (set.done) return true;
      const start = prefilledSet(exercise.target, lastSets, index);
      return (
        set.weightKg !== start.weightKg ||
        set.reps !== start.reps ||
        set.durationSec !== start.durationSec
      );
    });
  });
}
