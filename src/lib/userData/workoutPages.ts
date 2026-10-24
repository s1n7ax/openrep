/**
 * The workout screen shows a session one block (exercise or superset) per
 * page, then a page to finish it. These helpers say where it opens, which
 * exercise of a superset is next, and whether going back would lose anything.
 */
import type { Session, SessionExercise } from '../schema/userData.ts';
import { lastSetsFor, prefilledSet } from './sessions.ts';
import { blockEntries, supersetRounds, type Block } from './supersets.ts';

/**
 * The page a workout opens on: the first block with a set not ticked off,
 * or `blocks.length` (the finish page) when every set is.
 */
export function firstOpenPage(blocks: readonly Block<SessionExercise>[]): number {
  const index = blocks.findIndex((block) =>
    blockEntries(block).some((entry) => entry.sets.some((set) => !set.done)),
  );
  return index === -1 ? blocks.length : index;
}

/**
 * The position in a superset (0 for A1) of the exercise whose set comes
 * next: that of the first row, round by round, not ticked off; 0 when every
 * row is.
 */
export function nextSupersetPosition(entries: readonly SessionExercise[]): number {
  for (const round of supersetRounds(entries)) {
    const next = round.find((row) => !row.set.done);
    if (next) return next.position;
  }
  return 0;
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
