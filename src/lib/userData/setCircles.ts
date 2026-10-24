/**
 * The set circles of the workout screen: what a circle shows, which set is
 * next, how reps and seconds step and read, and how circles break into lines.
 */
import {
  MAX_LOGGED_REPS,
  MAX_LOGGED_SECONDS,
  type LoggedSet,
  type PlanTarget,
} from '../schema/userData.ts';
import { supersetRounds, type RoundSet } from './supersets.ts';
import { plannedReps } from './targets.ts';

/** Whether an exercise is done for reps or held for seconds. */
export type AmountKind = 'reps' | 'time';

type Target = Pick<PlanTarget, 'reps' | 'durationSec'>;
type Amounts = Pick<LoggedSet, 'reps' | 'durationSec'>;

/** Reps or seconds one − / + press changes. */
export const AMOUNT_STEP: Readonly<Record<AmountKind, number>> = { reps: 1, time: 5 };

/** The most reps or seconds a logged set takes. */
export const AMOUNT_MAX: Readonly<Record<AmountKind, number>> = {
  reps: MAX_LOGGED_REPS,
  time: MAX_LOGGED_SECONDS,
};

/** Seconds for a timed target, reps otherwise. */
export function amountKind(target: Target): AmountKind {
  return target.durationSec !== undefined ? 'time' : 'reps';
}

/** The reps or seconds (as `kind` says) logged for `set`; null when none were entered. */
export function loggedAmount(set: Amounts, kind: AmountKind): number | null {
  return kind === 'time' ? set.durationSec : set.reps;
}

/**
 * The planned amount, shown while none is entered and logged by a tick (see
 * `setLoggedSetDone`): "8", "10" for a range "10-12", "30"; "—" when the
 * target has none.
 */
export function plannedAmount(target: Target): string {
  const planned = amountKind(target) === 'time' ? target.durationSec : plannedReps(target.reps);
  return planned === undefined || planned === null ? '—' : String(planned);
}

/** What a set's circle shows: the reps or seconds logged, else the planned ones. */
export function shownAmount(set: Amounts, target: Target): string {
  const logged = loggedAmount(set, amountKind(target));
  return logged === null ? plannedAmount(target) : String(logged);
}

/** What − / + start from while nothing is entered: the target (a range's low end), else 0. */
export function amountBase(target: Target): number {
  if (amountKind(target) === 'time') return target.durationSec ?? 0;
  return plannedReps(target.reps) ?? 0;
}

/** An amount (`null` for none entered) after one − (`direction` -1) or + (1) press, within 0 and the most a set takes. */
export function stepAmount(value: number | null, target: Target, direction: 1 | -1): number {
  const kind = amountKind(target);
  const from = value ?? amountBase(target);
  return Math.min(AMOUNT_MAX[kind], Math.max(0, from + direction * AMOUNT_STEP[kind]));
}

/**
 * Reads reps or seconds typed by the user: null when the field is empty,
 * undefined when it is not a whole number the set takes.
 */
export function parseAmount(text: string, kind: AmountKind): number | null | undefined {
  const trimmed = text.trim();
  if (trimmed === '') return null;
  if (!/^\d+$/.test(trimmed)) return undefined;
  const value = Number(trimmed);
  return value <= AMOUNT_MAX[kind] ? value : undefined;
}

/**
 * The set to do next among the exercises of a block (one exercise, or a
 * superset's): the first not ticked off, round by round; null when all are.
 */
export function nextSet<T extends { sets: readonly LoggedSet[] }>(
  entries: readonly T[],
): RoundSet<T, LoggedSet> | null {
  for (const round of supersetRounds(entries)) {
    const next = round.find((row) => !row.set.done);
    if (next) return next;
  }
  return null;
}

/** The most circles side by side. */
export const MAX_CIRCLES_PER_LINE = 5;

/**
 * How many of `count` circles go side by side: all of them up to
 * `MAX_CIRCLES_PER_LINE`, else as few lines as that allows, filled evenly
 * (6 → 3 and 3, 7 → 4 and 3).
 */
export function circlesPerLine(count: number): number {
  const lines = Math.max(1, Math.ceil(count / MAX_CIRCLES_PER_LINE));
  return Math.max(1, Math.ceil(count / lines));
}

/** The positions 0 … `count` - 1 broken into lines of `circlesPerLine(count)`. */
export function circleLines(count: number): number[][] {
  const perLine = circlesPerLine(count);
  return Array.from({ length: Math.ceil(count / perLine) }, (_, line) =>
    Array.from(
      { length: Math.min(perLine, count - line * perLine) },
      (_, index) => line * perLine + index,
    ),
  );
}
