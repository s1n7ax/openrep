/**
 * Read-only lookups over user data.
 */
import { MUSCLES, type Muscle } from '../schema/common.ts';
import type {
  CustomExercise,
  ExerciseRef,
  LoggedSet,
  Plan,
  PlanDay,
  Session,
  UserData,
} from '../schema/userData.ts';

export function findPlan(data: UserData, planId: string): Plan | undefined {
  return data.plans.find((plan) => plan.id === planId);
}

/**
 * The plan `planId` when a prompt can build on it: it exists and has a day
 * (a plan file needs one).
 */
export function planToBuildOn(plans: readonly Plan[], planId: string | null): Plan | undefined {
  return plans.find((plan) => plan.id === planId && plan.days.length > 0);
}

export function findDay(plan: Plan | undefined, dayId: string): PlanDay | undefined {
  return plan?.days.find((day) => day.id === dayId);
}

export function findCustomExercise(data: UserData, id: string): CustomExercise | undefined {
  return data.customExercises.find((exercise) => exercise.id === id);
}

export function findSession(data: UserData, sessionId: string): Session | undefined {
  return data.sessions.find((session) => session.id === sessionId);
}

/** The workout in progress, if any. */
export function activeSession(data: UserData): Session | undefined {
  return data.activeSessionId === null ? undefined : findSession(data, data.activeSessionId);
}

/** Whether two references point at the same exercise (names are ignored). */
export function sameExercise(a: ExerciseRef, b: ExerciseRef): boolean {
  if (a.kind === 'catalog' && b.kind === 'catalog') return a.exerciseId === b.exerciseId;
  if (a.kind === 'custom' && b.kind === 'custom') return a.customExerciseId === b.customExerciseId;
  return false;
}

/** Finished sessions, newest first. */
export function history(sessions: readonly Session[]): Session[] {
  return sessions
    .filter((session) => session.finishedAt !== null)
    .sort((a, b) => (a.startedAt < b.startedAt ? 1 : a.startedAt > b.startedAt ? -1 : 0));
}

/** What was done for an exercise in one finished session. */
export interface PastSets {
  session: Session;
  /** The sets marked done, in order. */
  sets: LoggedSet[];
}

/**
 * The history of `ref`: every finished session in which it has at least one
 * set marked done, newest first (by start time), with those sets.
 * `excludeSessionId` skips a session, e.g. the one being logged.
 */
export function exerciseHistory(
  sessions: readonly Session[],
  ref: ExerciseRef,
  excludeSessionId?: string,
): PastSets[] {
  return history(sessions).flatMap((session) => {
    if (session.id === excludeSessionId) return [];
    for (const exercise of session.exercises) {
      if (!sameExercise(exercise.exercise, ref)) continue;
      const sets = exercise.sets.filter((set) => set.done);
      if (sets.length > 0) return [{ session, sets }];
    }
    return [];
  });
}

/**
 * The most recent finished session (by start time) in which `ref` has at
 * least one set marked done, with those sets: the first of its history (see
 * `exerciseHistory`).
 */
export function lastTimeFor(
  sessions: readonly Session[],
  ref: ExerciseRef,
  excludeSessionId?: string,
): PastSets | null {
  return exerciseHistory(sessions, ref, excludeSessionId)[0] ?? null;
}

/** The best set of one exercise, for `recentBestSets`. */
export interface BestSet {
  name: string;
  set: LoggedSet;
}

/** Order of two sets by how impressive they are: heaviest, then most reps, then longest. */
function compareSets(a: LoggedSet, b: LoggedSet): number {
  return (
    (b.weightKg ?? 0) - (a.weightKg ?? 0) ||
    (b.reps ?? 0) - (a.reps ?? 0) ||
    (b.durationSec ?? 0) - (a.durationSec ?? 0)
  );
}

/**
 * The best set of each exercise over the finished sessions started at or after
 * `since` (ISO timestamp), most recently trained first, at most `limit`. Only
 * sets marked done with reps or a time count: a failed lift has neither.
 */
export function recentBestSets(
  sessions: readonly Session[],
  since: string,
  limit: number,
): BestSet[] {
  const best = new Map<string, BestSet>();
  for (const session of history(sessions)) {
    if (session.startedAt < since) break;
    for (const { exercise, sets } of session.exercises) {
      const key =
        exercise.kind === 'catalog'
          ? `catalog:${exercise.exerciseId}`
          : `custom:${exercise.customExerciseId}`;
      const logged = sets.filter((set) => set.done && (set.reps || set.durationSec));
      const previous = best.get(key);
      const top = [...logged, ...(previous ? [previous.set] : [])].sort(compareSets)[0];
      if (top) best.set(key, { name: previous?.name ?? exercise.name, set: top });
    }
  }
  return [...best.values()].slice(0, limit);
}

/** Number of days and of exercises across all days. */
export function planStats(plan: Plan): { days: number; exercises: number } {
  return {
    days: plan.days.length,
    exercises: plan.days.reduce((sum, day) => sum + day.exercises.length, 0),
  };
}

/**
 * The day of `plan` to do next: the one after the day of its most recently
 * started finished workout, in plan order, back to the first after the last.
 * A workout of a day since removed is passed over for the one before it;
 * without any, it is the first day. Days without exercises (which cannot be
 * started) are skipped; undefined when every day is one.
 */
export function nextPlanDay(plan: Plan, sessions: readonly Session[]): PlanDay | undefined {
  const startable = (day: PlanDay) => day.exercises.length > 0;
  for (const session of history(sessions)) {
    if (session.planId !== plan.id) continue;
    const index = plan.days.findIndex((day) => day.id === session.dayId);
    if (index === -1) continue;
    const after = [...plan.days.slice(index + 1), ...plan.days.slice(0, index + 1)];
    return after.find(startable);
  }
  return plan.days.find(startable);
}

/** The muscles a day trains, each once, in the catalog's order. */
export interface DayMuscles {
  /** Primary muscles of any of its exercises. */
  primary: Muscle[];
  /** Secondary muscles of its exercises that are no exercise's primary. */
  secondary: Muscle[];
}

interface Trains {
  primaryMuscles: readonly Muscle[];
  secondaryMuscles: readonly Muscle[];
}

/**
 * The muscles the exercises of `day` train: catalog exercises found by
 * `findExercise`, custom ones in `customExercises`. An exercise no longer
 * there adds none.
 */
export function dayMuscles(
  day: PlanDay,
  findExercise: (id: string) => Trains | undefined,
  customExercises: readonly CustomExercise[],
): DayMuscles {
  const primary = new Set<Muscle>();
  const secondary = new Set<Muscle>();
  for (const { exercise: ref } of day.exercises) {
    const exercise =
      ref.kind === 'catalog'
        ? findExercise(ref.exerciseId)
        : customExercises.find((custom) => custom.id === ref.customExerciseId);
    for (const muscle of exercise?.primaryMuscles ?? []) primary.add(muscle);
    for (const muscle of exercise?.secondaryMuscles ?? []) secondary.add(muscle);
  }
  return {
    primary: MUSCLES.filter((muscle) => primary.has(muscle)),
    secondary: MUSCLES.filter((muscle) => secondary.has(muscle) && !primary.has(muscle)),
  };
}
