/**
 * Read-only lookups over user data.
 */
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

/** What was done for an exercise the last time it was logged. */
export interface LastTime {
  session: Session;
  /** The sets marked done, in order. */
  sets: LoggedSet[];
}

/**
 * The most recent finished session (by start time) in which `ref` has at
 * least one set marked done, with those sets. `excludeSessionId` skips a
 * session, e.g. the one being logged.
 */
export function lastTimeFor(
  sessions: readonly Session[],
  ref: ExerciseRef,
  excludeSessionId?: string,
): LastTime | null {
  for (const session of history(sessions)) {
    if (session.id === excludeSessionId) continue;
    for (const exercise of session.exercises) {
      if (!sameExercise(exercise.exercise, ref)) continue;
      const sets = exercise.sets.filter((set) => set.done);
      if (sets.length > 0) return { session, sets };
    }
  }
  return null;
}

/** Number of days and of exercises across all days. */
export function planStats(plan: Plan): { days: number; exercises: number } {
  return {
    days: plan.days.length,
    exercises: plan.days.reduce((sum, day) => sum + day.exercises.length, 0),
  };
}
