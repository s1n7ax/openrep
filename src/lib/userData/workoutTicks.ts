/**
 * What ticking a set off starts on the workout screen: a rest countdown
 * before the next set, and a celebration when the tick completes an exercise
 * (or a superset).
 */
import type { Session } from '../schema/userData.ts';
import { blockEntries, blockHasEntry, blockKey, groupBlocks, supersetRounds } from './supersets.ts';

export interface TickOutcome {
  /** Seconds of rest to count down; null for none. */
  restSec: number | null;
  /** Key (`blockKey`) of the exercise or superset the tick completed; null when it completed none. */
  completed: string | null;
}

const NOTHING: TickOutcome = { restSec: null, completed: null };

/**
 * What ticking off set `setId` of exercise `sessionExerciseId` starts, given
 * `session` as it is after the tick.
 *
 * The rest is the exercise's rest from the plan, or for an exercise of a
 * superset the superset's rest, else `defaultRestSec`. A lone exercise rests
 * after every set. A superset rests after a round only: when the ticked row
 * is the last of its round, or the tick leaves no row of its round unticked.
 * There is no rest after the workout's last row, once every set of the
 * workout is ticked off, or when the rest is 0 s.
 *
 * The tick completes its exercise when it leaves none of its sets unticked;
 * an exercise of a superset counts only once every row of the superset is
 * ticked off, so a superset completes once.
 */
export function tickOutcome(
  session: Session,
  sessionExerciseId: string,
  setId: string,
  defaultRestSec: number,
): TickOutcome {
  const blocks = groupBlocks(session.exercises, session.supersets);
  const blockIndex = blocks.findIndex((block) => blockHasEntry(block, sessionExerciseId));
  const block = blocks[blockIndex];
  if (!block) return NOTHING;
  const entries = blockEntries(block);
  const entry = entries.find((candidate) => candidate.id === sessionExerciseId);
  const setIndex = entry?.sets.findIndex((set) => set.id === setId) ?? -1;
  if (!entry || setIndex === -1 || !entry.sets[setIndex]!.done) return NOTHING;

  let restSec: number;
  let endsRound: boolean;
  let lastOfBlock: boolean;
  if (block.kind === 'exercise') {
    restSec = entry.target.restSec ?? defaultRestSec;
    endsRound = true;
    lastOfBlock = setIndex === entry.sets.length - 1;
  } else {
    const rounds = supersetRounds(block.entries);
    const round = rounds[setIndex] ?? [];
    const lastOfRound = round.at(-1)?.set.id === setId;
    restSec = block.superset.restSec ?? defaultRestSec;
    endsRound = lastOfRound || round.every((row) => row.set.done);
    lastOfBlock = lastOfRound && setIndex === rounds.length - 1;
  }
  const lastOfWorkout = lastOfBlock && blockIndex === blocks.length - 1;
  const allDone = session.exercises.every((exercise) => exercise.sets.every((set) => set.done));
  const rests = endsRound && !lastOfWorkout && !allDone && restSec > 0;

  const completed = entries.every((member) => member.sets.every((set) => set.done));
  return { restSec: rests ? restSec : null, completed: completed ? blockKey(block) : null };
}
