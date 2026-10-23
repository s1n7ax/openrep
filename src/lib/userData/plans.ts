/**
 * Pure updates of the plans in user data. Each returns new user data and
 * leaves its input untouched; an update aimed at a plan, day or exercise
 * that does not exist returns the input unchanged. `now` is an ISO
 * timestamp stored as the plan's `updatedAt`.
 */
import type {
  ExerciseRef,
  Plan,
  PlanDay,
  PlanExercise,
  PlanTarget,
  Superset,
  UserData,
} from '../schema/userData.ts';
import { moveById, moveItem } from './reorder.ts';
import {
  blockHasEntry,
  flattenBlocks,
  groupBlocks,
  leaveSuperset,
  normalizeSupersets,
  type Block,
} from './supersets.ts';

function updatePlan(
  data: UserData,
  planId: string,
  now: string,
  update: (plan: Plan) => Plan,
): UserData {
  let changed = false;
  const plans = data.plans.map((plan) => {
    if (plan.id !== planId) return plan;
    const next = update(plan);
    if (next === plan) return plan;
    changed = true;
    return { ...next, updatedAt: now };
  });
  return changed ? { ...data, plans } : data;
}

function updateDay(
  data: UserData,
  planId: string,
  dayId: string,
  now: string,
  update: (day: PlanDay) => PlanDay,
): UserData {
  return updatePlan(data, planId, now, (plan) => {
    let changed = false;
    const days = plan.days.map((day) => {
      if (day.id !== dayId) return day;
      const next = update(day);
      if (next !== day) changed = true;
      return next;
    });
    return changed ? { ...plan, days } : plan;
  });
}

/** The day's exercises grouped into blocks (see `supersets.ts`). */
export function dayBlocks(day: PlanDay): Block<PlanExercise>[] {
  return groupBlocks(day.exercises, day.supersets);
}

/**
 * The day with `exercises` and `supersets`, the grouping made consistent: a
 * superset left with one exercise is dropped and that exercise becomes a
 * normal one again. `supersets` is left out when there is none.
 */
function withExercises(
  day: PlanDay,
  exercises: PlanExercise[],
  supersets: Superset[] = day.supersets ?? [],
): PlanDay {
  const normal = normalizeSupersets(exercises, supersets);
  const { supersets: _supersets, ...rest } = day;
  return normal.supersets.length > 0
    ? { ...rest, exercises: normal.entries, supersets: normal.supersets }
    : { ...rest, exercises: normal.entries };
}

/** The target fields of `target` without the ones left undefined. */
export function cleanTarget(target: PlanTarget): PlanTarget {
  const clean: PlanTarget = { sets: target.sets };
  if (target.reps !== undefined) clean.reps = target.reps;
  if (target.durationSec !== undefined) clean.durationSec = target.durationSec;
  if (target.weightKg !== undefined) clean.weightKg = target.weightKg;
  if (target.restSec !== undefined) clean.restSec = target.restSec;
  if (target.notes !== undefined && target.notes.trim() !== '') clean.notes = target.notes;
  return clean;
}

/** Adds a plan at the end of the list, with one empty day when `firstDay` is given. */
export function createPlan(
  data: UserData,
  init: { id: string; name: string; firstDay?: { id: string; name: string } },
  now: string,
): UserData {
  const plan: Plan = {
    id: init.id,
    name: init.name,
    days: init.firstDay ? [{ id: init.firstDay.id, name: init.firstDay.name, exercises: [] }] : [],
    createdAt: now,
    updatedAt: now,
  };
  return { ...data, plans: [...data.plans, plan] };
}

export function renamePlan(data: UserData, planId: string, name: string, now: string): UserData {
  return updatePlan(data, planId, now, (plan) => (plan.name === name ? plan : { ...plan, name }));
}

/** Removes a plan. Logged sessions keep their plan name snapshot. */
export function deletePlan(data: UserData, planId: string): UserData {
  const plans = data.plans.filter((plan) => plan.id !== planId);
  return plans.length === data.plans.length ? data : { ...data, plans };
}

/** Moves a plan up (-1) or down (1) in the list. */
export function movePlan(data: UserData, planId: string, delta: number): UserData {
  const plans = moveById(data.plans, planId, delta);
  return plans === data.plans ? data : { ...data, plans };
}

export function addDay(
  data: UserData,
  planId: string,
  day: { id: string; name: string },
  now: string,
): UserData {
  return updatePlan(data, planId, now, (plan) => ({
    ...plan,
    days: [...plan.days, { id: day.id, name: day.name, exercises: [] }],
  }));
}

export function renameDay(
  data: UserData,
  planId: string,
  dayId: string,
  name: string,
  now: string,
): UserData {
  return updateDay(data, planId, dayId, now, (day) => (day.name === name ? day : { ...day, name }));
}

export function deleteDay(data: UserData, planId: string, dayId: string, now: string): UserData {
  return updatePlan(data, planId, now, (plan) => {
    const days = plan.days.filter((day) => day.id !== dayId);
    return days.length === plan.days.length ? plan : { ...plan, days };
  });
}

/** Moves a day up (-1) or down (1) within its plan. */
export function moveDay(
  data: UserData,
  planId: string,
  dayId: string,
  delta: number,
  now: string,
): UserData {
  return updatePlan(data, planId, now, (plan) => {
    const days = moveById(plan.days, dayId, delta);
    return days === plan.days ? plan : { ...plan, days };
  });
}

/** Appends an exercise with its target to a day. */
export function addPlanExercise(
  data: UserData,
  planId: string,
  dayId: string,
  entry: { id: string; exercise: ExerciseRef; target: PlanTarget },
  now: string,
): UserData {
  const planExercise: PlanExercise = {
    id: entry.id,
    exercise: entry.exercise,
    ...cleanTarget(entry.target),
  };
  return updateDay(data, planId, dayId, now, (day) => ({
    ...day,
    exercises: [...day.exercises, planExercise],
  }));
}

/**
 * Replaces the target (sets, reps or duration, weight, rest, notes) of a day's
 * exercise. An exercise of a superset keeps the superset's round count as its
 * sets and has no rest of its own.
 */
export function updatePlanExerciseTarget(
  data: UserData,
  planId: string,
  dayId: string,
  planExerciseId: string,
  target: PlanTarget,
  now: string,
): UserData {
  return updateDay(data, planId, dayId, now, (day) => {
    let changed = false;
    const exercises = day.exercises.map((entry) => {
      if (entry.id !== planExerciseId) return entry;
      changed = true;
      const { id, exercise, supersetId } = entry;
      if (supersetId === undefined) return { id, exercise, ...cleanTarget(target) };
      const memberTarget = cleanTarget({ ...target, sets: entry.sets, restSec: undefined });
      return { id, exercise, ...memberTarget, supersetId };
    });
    return changed ? { ...day, exercises } : day;
  });
}

/** Removes an exercise from a day; a superset left with one exercise is dissolved. */
export function deletePlanExercise(
  data: UserData,
  planId: string,
  dayId: string,
  planExerciseId: string,
  now: string,
): UserData {
  return updateDay(data, planId, dayId, now, (day) => {
    const exercises = day.exercises.filter((entry) => entry.id !== planExerciseId);
    return exercises.length === day.exercises.length ? day : withExercises(day, exercises);
  });
}

/**
 * Moves an exercise up (-1) or down (1). An exercise of a superset moves
 * within the superset; any other exercise moves past the next block, a whole
 * superset at once, never into it.
 */
export function movePlanExercise(
  data: UserData,
  planId: string,
  dayId: string,
  planExerciseId: string,
  delta: number,
  now: string,
): UserData {
  return updateDay(data, planId, dayId, now, (day) => {
    const blocks = dayBlocks(day);
    const index = blocks.findIndex((block) => blockHasEntry(block, planExerciseId));
    const block = blocks[index];
    if (!block) return day;
    if (block.kind === 'exercise') {
      const moved = moveItem(blocks, index, delta);
      return moved === blocks ? day : { ...day, exercises: flattenBlocks(moved) };
    }
    const entries = moveById(block.entries, planExerciseId, delta);
    if (entries === block.entries) return day;
    const next = blocks.map((candidate) =>
      candidate === block ? { ...block, entries } : candidate,
    );
    return { ...day, exercises: flattenBlocks(next) };
  });
}

/** Moves a whole superset up (-1) or down (1) past the next block. */
export function moveSuperset(
  data: UserData,
  planId: string,
  dayId: string,
  supersetId: string,
  delta: number,
  now: string,
): UserData {
  return updateDay(data, planId, dayId, now, (day) => {
    const blocks = dayBlocks(day);
    const index = blocks.findIndex(
      (block) => block.kind === 'superset' && block.superset.id === supersetId,
    );
    const moved = moveItem(blocks, index, delta);
    return moved === blocks ? day : { ...day, exercises: flattenBlocks(moved) };
  });
}

/** `entry` as an exercise of the superset `supersetId`: `rounds` sets and no rest of its own. */
function joinSuperset(entry: PlanExercise, supersetId: string, rounds: number): PlanExercise {
  const { restSec: _restSec, ...rest } = entry;
  return { ...rest, sets: rounds, supersetId };
}

/**
 * Joins the block holding the exercise `planExerciseId` with the next block
 * into one superset ("superset with next"):
 *
 * - two exercises become a new superset `supersetId` with the first one's
 *   sets as the round count and its rest as the rest after each round;
 * - an exercise joins the adjacent superset, which keeps its round count and rest;
 * - two supersets merge into the first, which keeps its round count and rest.
 *
 * Exercises joining a superset take its round count as their sets and lose
 * their own rest. Nothing changes when there is no next block.
 */
export function supersetWithNext(
  data: UserData,
  planId: string,
  dayId: string,
  planExerciseId: string,
  supersetId: string,
  now: string,
): UserData {
  return updateDay(data, planId, dayId, now, (day) => {
    const blocks = dayBlocks(day);
    const index = blocks.findIndex((block) => blockHasEntry(block, planExerciseId));
    const first = blocks[index];
    const second = blocks[index + 1];
    if (!first || !second) return day;
    const existing =
      first.kind === 'superset' ? first : second.kind === 'superset' ? second : undefined;
    const lead = first.kind === 'superset' ? first.entries[0]! : first.entry;
    const target: Superset = existing
      ? existing.superset
      : lead.restSec === undefined
        ? { id: supersetId }
        : { id: supersetId, restSec: lead.restSec };
    const rounds = existing ? existing.entries[0]!.sets : lead.sets;
    const joined = [first, second].flatMap((block) =>
      (block.kind === 'exercise' ? [block.entry] : block.entries).map((entry) =>
        joinSuperset(entry, target.id, rounds),
      ),
    );
    const exercises = [
      ...flattenBlocks(blocks.slice(0, index)),
      ...joined,
      ...flattenBlocks(blocks.slice(index + 2)),
    ];
    const merged = new Set(
      [first, second].flatMap((block) => (block.kind === 'superset' ? [block.superset.id] : [])),
    );
    const supersets = (day.supersets ?? []).filter(
      (superset) => superset.id === target.id || !merged.has(superset.id),
    );
    return withExercises(day, exercises, existing ? supersets : [...supersets, target]);
  });
}

/**
 * Takes an exercise out of its superset: it becomes a normal exercise right
 * after the superset, with the round count as its sets and the superset's
 * rest. A superset left with one exercise is dissolved the same way.
 */
export function removeFromSuperset(
  data: UserData,
  planId: string,
  dayId: string,
  planExerciseId: string,
  now: string,
): UserData {
  return updateDay(data, planId, dayId, now, (day) => {
    const blocks = dayBlocks(day);
    const index = blocks.findIndex((block) => blockHasEntry(block, planExerciseId));
    const block = blocks[index];
    if (block?.kind !== 'superset') return day;
    const entry = block.entries.find((candidate) => candidate.id === planExerciseId)!;
    const exercises = [
      ...flattenBlocks(blocks.slice(0, index)),
      ...block.entries.filter((candidate) => candidate !== entry),
      leaveSuperset(entry, block.superset),
      ...flattenBlocks(blocks.slice(index + 1)),
    ];
    return withExercises(day, exercises);
  });
}

/**
 * Dissolves a superset: its exercises stay in place as normal exercises, with
 * the round count as their sets and the superset's rest as their own.
 */
export function ungroupSuperset(
  data: UserData,
  planId: string,
  dayId: string,
  supersetId: string,
  now: string,
): UserData {
  return updateDay(data, planId, dayId, now, (day) => {
    const superset = day.supersets?.find((candidate) => candidate.id === supersetId);
    if (!superset) return day;
    const exercises = day.exercises.map((entry) =>
      entry.supersetId === supersetId ? leaveSuperset(entry, superset) : entry,
    );
    const supersets = (day.supersets ?? []).filter((candidate) => candidate !== superset);
    return withExercises(day, exercises, supersets);
  });
}

/** Sets the round count of a superset: the sets of each of its exercises. */
export function setSupersetRounds(
  data: UserData,
  planId: string,
  dayId: string,
  supersetId: string,
  rounds: number,
  now: string,
): UserData {
  return updateDay(data, planId, dayId, now, (day) => {
    let changed = false;
    const exercises = day.exercises.map((entry) => {
      if (entry.supersetId !== supersetId || entry.sets === rounds) return entry;
      changed = true;
      return { ...entry, sets: rounds };
    });
    return changed ? { ...day, exercises } : day;
  });
}

/** Sets the rest after each round of a superset; undefined for none. */
export function setSupersetRest(
  data: UserData,
  planId: string,
  dayId: string,
  supersetId: string,
  restSec: number | undefined,
  now: string,
): UserData {
  return updateDay(data, planId, dayId, now, (day) => {
    let changed = false;
    const supersets = (day.supersets ?? []).map((superset) => {
      if (superset.id !== supersetId || superset.restSec === restSec) return superset;
      changed = true;
      return restSec === undefined ? { id: superset.id } : { id: superset.id, restSec };
    });
    return changed ? { ...day, supersets } : day;
  });
}
