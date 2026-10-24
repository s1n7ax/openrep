/**
 * Pure updates of workout sessions (see `plans.ts` for the conventions).
 */
import type { LoggedSet, Session, SessionExercise, UserData } from '../schema/userData.ts';
import { cleanTarget } from './plans.ts';

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

/**
 * Starts a workout from a plan day and makes it the active session. Each
 * exercise gets one empty set row per target set, with the target weight
 * filled in. Plan and day names and the day's supersets are stored as
 * snapshots. Returns the input unchanged when the plan or day does not exist.
 * Callers finish or delete any active session first; this one replaces it as
 * the active one.
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
      const { id: _id, exercise, supersetId, ...target } = entry;
      const sessionExercise: SessionExercise = {
        id: newId(),
        exercise,
        target: cleanTarget(target),
        sets: Array.from({ length: entry.sets }, () => ({
          id: newId(),
          weightKg: entry.weightKg ?? null,
          reps: null,
          durationSec: null,
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

/** The exercise with a set row appended, pre-filled with the previous row's values and not done. */
function withNewSet(exercise: SessionExercise, setId: string): SessionExercise {
  const last = exercise.sets.at(-1);
  const set: LoggedSet = {
    id: setId,
    weightKg: last?.weightKg ?? exercise.target.weightKg ?? null,
    reps: last?.reps ?? null,
    durationSec: last?.durationSec ?? null,
    done: false,
  };
  return { ...exercise, sets: [...exercise.sets, set] };
}

/** Appends a set row, pre-filled with the previous row's values and not done. */
export function addLoggedSet(
  data: UserData,
  sessionId: string,
  sessionExerciseId: string,
  setId: string,
): UserData {
  return updateSessionExercise(data, sessionId, sessionExerciseId, (exercise) =>
    withNewSet(exercise, setId),
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
      return withNewSet(exercise, newId());
    });
    return changed ? { ...session, exercises } : session;
  });
}

export function removeLoggedSet(
  data: UserData,
  sessionId: string,
  sessionExerciseId: string,
  setId: string,
): UserData {
  return updateSessionExercise(data, sessionId, sessionExerciseId, (exercise) => {
    const sets = exercise.sets.filter((set) => set.id !== setId);
    return sets.length === exercise.sets.length ? exercise : { ...exercise, sets };
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

/**
 * Ticks a set off (or un-ticks it). Ticking fills an empty reps field from a
 * single-number reps target ("8", not a range like "8-12") and an empty
 * duration from a timed target, so a set done as planned takes one tap.
 */
export function setLoggedSetDone(
  data: UserData,
  sessionId: string,
  sessionExerciseId: string,
  setId: string,
  done: boolean,
): UserData {
  return updateSessionExercise(data, sessionId, sessionExerciseId, (exercise) => {
    let changed = false;
    const { reps, durationSec } = exercise.target;
    const sets = exercise.sets.map((set) => {
      if (set.id !== setId || set.done === done) return set;
      changed = true;
      if (!done) return { ...set, done };
      return {
        ...set,
        done,
        reps: set.reps ?? (reps !== undefined && /^\d+$/.test(reps) ? Number(reps) : null),
        durationSec: set.durationSec ?? durationSec ?? null,
      };
    });
    return changed ? { ...exercise, sets } : exercise;
  });
}
