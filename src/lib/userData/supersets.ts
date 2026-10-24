/**
 * Supersets of a plan day or a session. Their exercises are stored as one
 * flat list in which a superset's exercises are next to each other and carry
 * its id; these helpers group that list into blocks (one exercise, or one
 * superset's exercises), lay out a superset's sets round by round, and keep
 * the grouping consistent after a change.
 */
import type { Superset } from '../schema/userData.ts';

/** What grouping needs of an exercise of a day or session. */
export interface Groupable {
  id: string;
  supersetId?: string | undefined;
}

/** One exercise on its own, or the exercises of one superset, in day order. */
export type Block<T extends Groupable> =
  | {
      kind: 'exercise';
      entry: T;
      /** Position of the exercise in the day's list. */
      index: number;
    }
  | {
      kind: 'superset';
      superset: Superset;
      /** "A" for the day's first superset, "B" for the next, … */
      letter: string;
      /** At least two. */
      entries: T[];
    };

/** 0 → "A", 25 → "Z", 26 → "AA", like spreadsheet columns. */
export function supersetLetter(index: number): string {
  let letters = '';
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) {
    letters = String.fromCharCode(65 + ((n - 1) % 26)) + letters;
  }
  return letters;
}

/**
 * The blocks of a day or session. Two or more adjacent exercises with the
 * same `supersetId` whose superset exists form a superset block; any other
 * exercise is a block of its own, even when it names a superset.
 */
export function groupBlocks<T extends Groupable>(
  entries: readonly T[],
  supersets: readonly Superset[] | undefined,
): Block<T>[] {
  const byId = new Map((supersets ?? []).map((superset) => [superset.id, superset] as const));
  const blocks: Block<T>[] = [];
  let letters = 0;
  for (let index = 0; index < entries.length;) {
    const entry = entries[index]!;
    const superset = entry.supersetId === undefined ? undefined : byId.get(entry.supersetId);
    let end = index + 1;
    while (superset && end < entries.length && entries[end]!.supersetId === superset.id) end += 1;
    if (superset && end - index >= 2) {
      blocks.push({
        kind: 'superset',
        superset,
        letter: supersetLetter(letters),
        entries: entries.slice(index, end),
      });
      letters += 1;
    } else {
      blocks.push({ kind: 'exercise', entry, index });
    }
    index = end;
  }
  return blocks;
}

/** The exercises of `blocks`, in order. */
export function flattenBlocks<T extends Groupable>(blocks: readonly Block<T>[]): T[] {
  return blocks.flatMap((block) => (block.kind === 'exercise' ? [block.entry] : block.entries));
}

/** A key for `block` that is unique among the blocks of its day or session. */
export function blockKey<T extends Groupable>(block: Block<T>): string {
  return block.kind === 'exercise' ? `exercise-${block.entry.id}` : `superset-${block.superset.id}`;
}

/** Whether `block` holds the exercise with id `id`. */
export function blockHasEntry<T extends Groupable>(block: Block<T>, id: string): boolean {
  return block.kind === 'exercise'
    ? block.entry.id === id
    : block.entries.some((entry) => entry.id === id);
}

/** "A1", "A2", …: the label of the exercise at `position` in a superset lettered `letter`. */
export function supersetExerciseLabel(letter: string, position: number): string {
  return `${letter}${position + 1}`;
}

/** One set of a superset's exercise in a round. */
export interface RoundSet<T, S> {
  entry: T;
  /** Position of the exercise in the superset (0 for A1). */
  position: number;
  set: S;
  /** Position of the set among the exercise's sets. */
  setIndex: number;
}

/**
 * A superset's logged sets round by round: round n holds the n-th set of each
 * of its exercises that has one, in exercise order. There are as many rounds
 * as the exercise with the most sets has sets.
 */
export function supersetRounds<T extends { sets: readonly unknown[] }>(
  entries: readonly T[],
): RoundSet<T, T['sets'][number]>[][] {
  const count = Math.max(0, ...entries.map((entry) => entry.sets.length));
  return Array.from({ length: count }, (_, setIndex) =>
    entries.flatMap((entry, position) => {
      const set = entry.sets[setIndex];
      return set === undefined ? [] : [{ entry, position, set, setIndex }];
    }),
  );
}

/**
 * The exercise as a standalone one, out of `superset`: it keeps its sets
 * (the round count) and gets the superset's rest as its own.
 */
export function leaveSuperset<T extends Groupable & { restSec?: number | undefined }>(
  entry: T,
  superset: Superset | undefined,
): T {
  const { supersetId: _supersetId, restSec: _restSec, ...rest } = entry;
  const restSec = superset?.restSec;
  return (restSec === undefined ? rest : { ...rest, restSec }) as T;
}

/**
 * Exercises and supersets with the grouping made consistent: a superset with
 * fewer than two adjacent exercises is dropped and its exercise becomes a
 * normal one again (see `leaveSuperset`); an exercise naming a superset that
 * does not exist leaves it. Returns the inputs themselves when nothing changed.
 */
export function normalizeSupersets<T extends Groupable & { restSec?: number | undefined }>(
  entries: T[],
  supersets: Superset[],
): { entries: T[]; supersets: Superset[] } {
  const grouped = groupBlocks(entries, supersets).filter((block) => block.kind === 'superset');
  const used = new Set(grouped.map((block) => block.superset.id));
  const members = new Set(grouped.flatMap((block) => block.entries.map((entry) => entry.id)));
  const byId = new Map(supersets.map((superset) => [superset.id, superset] as const));
  let changed = false;
  const nextEntries = entries.map((entry) => {
    if (entry.supersetId === undefined || members.has(entry.id)) return entry;
    changed = true;
    return leaveSuperset(entry, byId.get(entry.supersetId));
  });
  const nextSupersets = supersets.filter((superset) => used.has(superset.id));
  if (nextSupersets.length !== supersets.length) changed = true;
  return changed ? { entries: nextEntries, supersets: nextSupersets } : { entries, supersets };
}
