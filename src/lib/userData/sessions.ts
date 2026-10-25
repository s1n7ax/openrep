/**
 * Pure updates of workout sessions (see `plans.ts` for the conventions).
 */
import type {
  ExerciseRef,
  LoggedSet,
  PlanTarget,
  Session,
  SessionExercise,
  UserData,
} from '../schema/userData.ts';
import { cleanTarget } from './plans.ts';
import { lastTimeFor } from './selectors.ts';
import { blockEntries, blockHasEntry, groupBlocks, supersetRounds } from './supersets.ts';
import { plannedReps } from './targets.ts';

function updateSession(
  data: UserData,
  sessionId: string,
  update: (session: Session) => Session,
): UserData {
  let changed = false;
  const sessions = data.sessions.map((session) => {
    if (session.id !== sessionId) return session;
    const next = update(session);
    if (next !== session) changed = true;
    return next;
  });
  return changed ? { ...data, sessions } : data;
}

function updateSessionExercise(
  data: UserData,
  sessionId: string,
  sessionExerciseId: string,
  update: (exercise: SessionExercise) => SessionExercise,
): UserData {
  return updateSession(data, sessionId, (session) => {
    let changed = false;
    const exercises = session.exercises.map((exercise) => {
      if (exercise.id !== sessionExerciseId) return exercise;
      const next = update(exercise);
      if (next !== exercise) changed = true;
      return next;
    });
    return changed ? { ...session, exercises } : session;
  });
}

/** The values a set row holds. */
export type SetValues = Pick<LoggedSet, 'weightKg' | 'reps' | 'durationSec'>;

/**
 * The values the set row at `index` of an exercise starts with, given the
 * sets done last time (`lastTimeFor`): last time's set at that index, or its
 * final set past its end. Field by field, a value last time did not have is
 * what a first time gets: the target weight, and no reps or seconds (ticking
 * fills them from the target). Only the amount the exercise is logged in is
 * copied: seconds for a timed target, reps otherwise.
 */
export function prefilledSet(
  target: PlanTarget,
  lastSets: readonly LoggedSet[],
  index: number,
): SetValues {
  const last = lastSets[Math.min(index, lastSets.length - 1)];
  const timed = target.durationSec !== undefined;
  return {
    weightKg: last?.weightKg ?? target.weightKg ?? null,
    reps: timed ? null : (last?.reps ?? null),
    durationSec: timed ? (last?.durationSec ?? null) : null,
  };
}

/** The sets of `exercise` done the last time it was logged before session `sessionId`, if any. */
export function lastSetsFor(
  sessions: readonly Session[],
  exercise: ExerciseRef,
  sessionId: string,
): LoggedSet[] {
  return lastTimeFor(sessions, exercise, sessionId)?.sets ?? [];
}

/**
 * Starts a workout from a plan day and makes it the active session. Each
 * exercise gets one set row per target set, filled with what was done last
 * time (see `prefilledSet`); an exercise never done before gets the target
 * weight and no reps. Plan and day names and the day's supersets are stored
 * as snapshots. Returns the input unchanged when the plan or day does not
 * exist. Callers finish or delete any active session first; this one
 * replaces it as the active one.
 */
export function startSession(
  data: UserData,
  init: { sessionId: string; planId: string; dayId: string },
  now: string,
  newId: () => string,
): UserData {
  const plan = data.plans.find((candidate) => candidate.id === init.planId);
  const day = plan?.days.find((candidate) => candidate.id === init.dayId);
  if (!plan || !day) return data;
  const session: Session = {
    id: init.sessionId,
    planId: plan.id,
    planName: plan.name,
    dayId: day.id,
    dayName: day.name,
    startedAt: now,
    finishedAt: null,
    exercises: day.exercises.map((entry) => {
      const { id: _id, exercise, supersetId, ...rest } = entry;
      const target = cleanTarget(rest);
      const lastSets = lastSetsFor(data.sessions, exercise, init.sessionId);
      const sessionExercise: SessionExercise = {
        id: newId(),
        exercise,
        target,
        sets: Array.from({ length: entry.sets }, (_, index) => ({
          id: newId(),
          ...prefilledSet(target, lastSets, index),
          done: false,
        })),
      };
      if (supersetId !== undefined) sessionExercise.supersetId = supersetId;
      return sessionExercise;
    }),
  };
  if (day.supersets !== undefined && day.supersets.length > 0) {
    session.supersets = day.supersets.map((superset) => ({ ...superset }));
  }
  return { ...data, sessions: [...data.sessions, session], activeSessionId: session.id };
}

/** Changes the weight, reps, duration or done state of one logged set. */
export function updateLoggedSet(
  data: UserData,
  sessionId: string,
  sessionExerciseId: string,
  setId: string,
  patch: Partial<Omit<LoggedSet, 'id'>>,
): UserData {
  return updateSessionExercise(data, sessionId, sessionExerciseId, (exercise) => {
    let changed = false;
    const sets = exercise.sets.map((set) => {
      if (set.id !== setId) return set;
      changed = true;
      return { ...set, ...patch, id: set.id };
    });
    return changed ? { ...exercise, sets } : exercise;
  });
}

/**
 * Changes the weight of one logged set. A set not done passes its new weight
 * on to every later set of the exercise that is not done either, so straight
 * sets take one change; a done set's weight changes alone, as correcting the
 * log plans nothing.
 */
export function setLoggedWeight(
  data: UserData,
  sessionId: string,
  sessionExerciseId: string,
  setId: string,
  weightKg: number | null,
): UserData {
  return updateSessionExercise(data, sessionId, sessionExerciseId, (exercise) => {
    const index = exercise.sets.findIndex((set) => set.id === setId);
    const changedSet = exercise.sets[index];
    if (!changedSet) return exercise;
    let changed = false;
    const sets = exercise.sets.map((set, position) => {
      const applies = position === index || (!changedSet.done && position > index && !set.done);
      if (!applies || set.weightKg === weightKg) return set;
      changed = true;
      return { ...set, weightKg };
    });
    return changed ? { ...exercise, sets } : exercise;
  });
}

/**
 * The values of a set row appended to `exercise` (`lastSets` as for
 * `prefilledSet`): filled like a row made at the start when the exercise was
 * done before, else with the previous row's values.
 */
export function addedSetValues(
  exercise: SessionExercise,
  lastSets: readonly LoggedSet[],
): SetValues {
  const previous = exercise.sets.at(-1);
  return lastSets.length > 0
    ? prefilledSet(exercise.target, lastSets, exercise.sets.length)
    : {
        weightKg: previous?.weightKg ?? exercise.target.weightKg ?? null,
        reps: previous?.reps ?? null,
        durationSec: previous?.durationSec ?? null,
      };
}

/** The exercise with a set row appended, not done, filled as `addedSetValues` says. */
function withNewSet(
  exercise: SessionExercise,
  setId: string,
  lastSets: readonly LoggedSet[],
): SessionExercise {
  const values = addedSetValues(exercise, lastSets);
  return { ...exercise, sets: [...exercise.sets, { id: setId, ...values, done: false }] };
}

/**
 * Appends a set row, not done: filled with last time's set at its position
 * (its final set past its end) when the exercise was done before, else with
 * the previous row's values.
 */
export function addLoggedSet(
  data: UserData,
  sessionId: string,
  sessionExerciseId: string,
  setId: string,
): UserData {
  return updateSessionExercise(data, sessionId, sessionExerciseId, (exercise) =>
    withNewSet(exercise, setId, lastSetsFor(data.sessions, exercise.exercise, sessionId)),
  );
}

/** Adds a round to a superset: one set row (as `addLoggedSet`) to each of its exercises. */
export function addLoggedRound(
  data: UserData,
  sessionId: string,
  supersetId: string,
  newId: () => string,
): UserData {
  return updateSession(data, sessionId, (session) => {
    let changed = false;
    const exercises = session.exercises.map((exercise) => {
      if (exercise.supersetId !== supersetId) return exercise;
      changed = true;
      return withNewSet(
        exercise,
        newId(),
        lastSetsFor(data.sessions, exercise.exercise, sessionId),
      );
    });
    return changed ? { ...session, exercises } : session;
  });
}

/** Removes the last set of an exercise; an exercise keeps at least one. */
export function removeLastLoggedSet(
  data: UserData,
  sessionId: string,
  sessionExerciseId: string,
): UserData {
  return updateSessionExercise(data, sessionId, sessionExerciseId, (exercise) =>
    exercise.sets.length > 1 ? { ...exercise, sets: exercise.sets.slice(0, -1) } : exercise,
  );
}

/**
 * Removes a superset's last round: the set each of its exercises has in that
 * round (see `supersetRounds`). A superset keeps at least one round.
 */
export function removeLastLoggedRound(
  data: UserData,
  sessionId: string,
  supersetId: string,
): UserData {
  return updateSession(data, sessionId, (session) => {
    const rounds = Math.max(
      0,
      ...session.exercises
        .filter((exercise) => exercise.supersetId === supersetId)
        .map((exercise) => exercise.sets.length),
    );
    if (rounds <= 1) return session;
    let changed = false;
    const exercises = session.exercises.map((exercise) => {
      if (exercise.supersetId !== supersetId || exercise.sets.length < rounds) return exercise;
      changed = true;
      return { ...exercise, sets: exercise.sets.slice(0, -1) };
    });
    return changed ? { ...session, exercises } : session;
  });
}

/** Marks a session finished; it is no longer the active session. */
export function finishSession(data: UserData, sessionId: string, now: string): UserData {
  const next = updateSession(data, sessionId, (session) =>
    session.finishedAt === null ? { ...session, finishedAt: now } : session,
  );
  return next.activeSessionId === sessionId ? { ...next, activeSessionId: null } : next;
}

/** Removes a session (discarding a workout or deleting it from history). */
export function deleteSession(data: UserData, sessionId: string): UserData {
  const sessions = data.sessions.filter((session) => session.id !== sessionId);
  if (sessions.length === data.sessions.length) return data;
  return {
    ...data,
    sessions,
    activeSessionId: data.activeSessionId === sessionId ? null : data.activeSessionId,
  };
}

/** `set` ticked off, its empty reps or seconds filled from `target` (see `setLoggedSetDone`). */
function tickedSet(set: LoggedSet, target: PlanTarget): LoggedSet {
  return {
    ...set,
    done: true,
    reps: set.reps ?? plannedReps(target.reps),
    durationSec: set.durationSec ?? target.durationSec ?? null,
  };
}

/**
 * Ticks a set off (or un-ticks it), keeping the sets done in an unbroken
 * line from the first set of its exercise or superset. Ticking also ticks
 * every set before it that is not done; un-ticking also un-ticks every set
 * after it that is. A superset's sets go in the order they are done: round
 * by round, A1 before A2 (see `supersetRounds`). Ticking fills empty reps
 * from the reps target, a range's low end ("10-12" → 10, see `plannedReps`),
 * and an empty duration from a timed target, so a set done as planned takes
 * one tap.
 */
export function setLoggedSetDone(
  data: UserData,
  sessionId: string,
  sessionExerciseId: string,
  setId: string,
  done: boolean,
): UserData {
  return updateSession(data, sessionId, (session) => {
    const block = groupBlocks(session.exercises, session.supersets).find((candidate) =>
      blockHasEntry(candidate, sessionExerciseId),
    );
    if (!block) return session;
    const order = supersetRounds(blockEntries(block)).flat();
    const index = order.findIndex(
      ({ entry, set }) => entry.id === sessionExerciseId && set.id === setId,
    );
    if (index === -1) return session;
    const changing = new Set(
      (done ? order.slice(0, index + 1) : order.slice(index))
        .map(({ set }) => set)
        .filter((set) => set.done !== done),
    );
    if (changing.size === 0) return session;
    const exercises = session.exercises.map((exercise) =>
      exercise.sets.some((set) => changing.has(set))
        ? {
            ...exercise,
            sets: exercise.sets.map((set) => {
              if (!changing.has(set)) return set;
              return done ? tickedSet(set, exercise.target) : { ...set, done };
            }),
          }
        : exercise,
    );
    return { ...session, exercises };
  });
}
