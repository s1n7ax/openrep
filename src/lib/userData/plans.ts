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
  UserData,
} from '../schema/userData.ts';
import { moveById } from './reorder.ts';

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

/** Replaces the target (sets, reps or duration, weight, rest, notes) of a day's exercise. */
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
      return { id: entry.id, exercise: entry.exercise, ...cleanTarget(target) };
    });
    return changed ? { ...day, exercises } : day;
  });
}

export function deletePlanExercise(
  data: UserData,
  planId: string,
  dayId: string,
  planExerciseId: string,
  now: string,
): UserData {
  return updateDay(data, planId, dayId, now, (day) => {
    const exercises = day.exercises.filter((entry) => entry.id !== planExerciseId);
    return exercises.length === day.exercises.length ? day : { ...day, exercises };
  });
}

/** Moves an exercise up (-1) or down (1) within its day. */
export function movePlanExercise(
  data: UserData,
  planId: string,
  dayId: string,
  planExerciseId: string,
  delta: number,
  now: string,
): UserData {
  return updateDay(data, planId, dayId, now, (day) => {
    const exercises = moveById(day.exercises, planExerciseId, delta);
    return exercises === day.exercises ? day : { ...day, exercises };
  });
}
