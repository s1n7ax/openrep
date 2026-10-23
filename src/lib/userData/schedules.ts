/**
 * Copying a community schedule into the user's plans (see `plans.ts` for the
 * conventions of pure updates).
 */
import type { Exercise } from '../schema/exercise.ts';
import {
  isScheduleSuperset,
  type Schedule,
  type ScheduleDayV2,
  type ScheduleEntry,
  type ScheduleSuperset,
  type ScheduleSupersetExercise,
} from '../schema/schedule.ts';
import type {
  CustomExercise,
  ExerciseRef,
  Plan,
  PlanDay,
  PlanExercise,
  Superset,
  UserData,
} from '../schema/userData.ts';
import { cleanTarget } from './plans.ts';
import { supersetLetter } from './supersets.ts';

export interface CopyScheduleOptions {
  /** Id of the new plan. */
  planId: string;
  /** Makes ids for the days, plan exercises and custom exercises. */
  newId: () => string;
  /** ISO timestamp stored as the plan's (and new custom exercises') creation time. */
  now: string;
  /** Looks up a catalog exercise by id. */
  findExercise: (id: string) => Exercise | undefined;
}

/** Key two custom exercise names are compared by: "  Zercher Squat" ↔ "zercher squat". */
function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** "barbell-squat" → "Barbell squat", for an entry whose id is not in the catalog. */
function nameFromId(id: string): string {
  const text = id.replace(/-/g, ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Adds a new plan built from `schedule` at the end of the plan list and
 * returns the new user data.
 *
 * - Entries naming a catalog exercise reference it (with its current name as
 *   the snapshot). An `exerciseId` missing from the catalog is kept, so the
 *   plan shows the name with a "No longer in catalog" note.
 * - Name-only entries become custom exercises. A custom exercise with the same
 *   name (ignoring case and spacing) is reused instead of creating a duplicate.
 * - Targets keep sets, reps or duration, rest and notes.
 * - Supersets stay supersets: their exercises get the round count as their
 *   sets, and the superset keeps the rest after each round.
 */
export function copyScheduleToPlan(
  data: UserData,
  schedule: Schedule,
  options: CopyScheduleOptions,
): UserData {
  const { newId, now, findExercise } = options;
  const customByName = new Map(
    data.customExercises.map((custom) => [nameKey(custom.name), custom] as const),
  );
  const created: CustomExercise[] = [];

  function refFor(entry: ScheduleSupersetExercise): ExerciseRef {
    if (entry.exerciseId !== undefined) {
      const exercise = findExercise(entry.exerciseId);
      return {
        kind: 'catalog',
        exerciseId: entry.exerciseId,
        name: exercise?.name ?? entry.name?.trim() ?? nameFromId(entry.exerciseId),
      };
    }
    const name = (entry.name ?? '').trim().replace(/\s+/g, ' ');
    let custom = customByName.get(nameKey(name));
    if (!custom) {
      custom = {
        id: newId(),
        name,
        notes: '',
        equipment: null,
        primaryMuscles: [],
        secondaryMuscles: [],
        instructions: [],
        createdAt: now,
        updatedAt: now,
      };
      customByName.set(nameKey(name), custom);
      created.push(custom);
    }
    return { kind: 'custom', customExerciseId: custom.id, name: custom.name };
  }

  function planExercise(
    entry: ScheduleSupersetExercise,
    sets: number,
    restSec: number | undefined,
  ): PlanExercise {
    return {
      id: newId(),
      exercise: refFor(entry),
      ...cleanTarget({
        sets,
        reps: entry.reps,
        durationSec: entry.durationSec,
        restSec,
        notes: entry.notes?.trim(),
      }),
    };
  }

  function planDay(day: ScheduleDayV2): PlanDay {
    const id = newId();
    const exercises: PlanExercise[] = [];
    const supersets: Superset[] = [];
    for (const item of day.exercises) {
      if (!isScheduleSuperset(item)) {
        exercises.push(planExercise(item, item.sets, item.restSec));
        continue;
      }
      const { rounds, restSec, exercises: members } = item.superset;
      const superset: Superset = restSec === undefined ? { id: newId() } : { id: newId(), restSec };
      supersets.push(superset);
      for (const member of members) {
        exercises.push({ ...planExercise(member, rounds, undefined), supersetId: superset.id });
      }
    }
    const name = day.name.trim();
    return supersets.length > 0 ? { id, name, exercises, supersets } : { id, name, exercises };
  }

  // A version 1 day is a version 2 day without supersets.
  const days: readonly ScheduleDayV2[] = schedule.days;
  const plan: Plan = {
    id: options.planId,
    name: schedule.name.trim(),
    days: days.map(planDay),
    createdAt: now,
    updatedAt: now,
  };

  return {
    ...data,
    plans: [...data.plans, plan],
    customExercises:
      created.length > 0 ? [...data.customExercises, ...created] : data.customExercises,
  };
}

/** An item of a schedule day as shown: an exercise, or a superset with its letter. */
export type ScheduleBlock =
  | {
      kind: 'exercise';
      entry: ScheduleEntry;
      /** Position of the exercise among the day's exercises, from 1 (as in a copied plan). */
      number: number;
    }
  | { kind: 'superset'; superset: ScheduleSuperset['superset']; letter: string };

/** The items of a schedule day as shown, supersets lettered A, B, … in order. */
export function scheduleDayBlocks(day: ScheduleDayV2): ScheduleBlock[] {
  let exercises = 0;
  let supersets = 0;
  return day.exercises.map((item) => {
    if (!isScheduleSuperset(item)) {
      exercises += 1;
      return { kind: 'exercise', entry: item, number: exercises };
    }
    exercises += item.superset.exercises.length;
    return { kind: 'superset', superset: item.superset, letter: supersetLetter(supersets++) };
  });
}

/** Number of exercises of a schedule day, counting each exercise of a superset. */
export function scheduleDayExerciseCount(day: ScheduleDayV2): number {
  return day.exercises.reduce(
    (sum, item) => sum + (isScheduleSuperset(item) ? item.superset.exercises.length : 1),
    0,
  );
}

/** Number of exercises across all days of a schedule, counting each exercise of a superset. */
export function scheduleExerciseCount(schedule: Schedule): number {
  const days: readonly ScheduleDayV2[] = schedule.days;
  return days.reduce((sum, day) => sum + scheduleDayExerciseCount(day), 0);
}
