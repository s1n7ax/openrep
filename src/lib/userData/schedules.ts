/**
 * Copying a community schedule into the user's plans (see `plans.ts` for the
 * conventions of pure updates).
 */
import type { Exercise } from '../schema/exercise.ts';
import type { Schedule, ScheduleEntry } from '../schema/schedule.ts';
import type { CustomExercise, ExerciseRef, Plan, UserData } from '../schema/userData.ts';
import { cleanTarget } from './plans.ts';

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

  function refFor(entry: ScheduleEntry): ExerciseRef {
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

  const plan: Plan = {
    id: options.planId,
    name: schedule.name.trim(),
    days: schedule.days.map((day) => ({
      id: newId(),
      name: day.name.trim(),
      exercises: day.exercises.map((entry) => ({
        id: newId(),
        exercise: refFor(entry),
        ...cleanTarget({
          sets: entry.sets,
          reps: entry.reps,
          durationSec: entry.durationSec,
          restSec: entry.restSec,
          notes: entry.notes?.trim(),
        }),
      })),
    })),
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

/** Number of exercises across all days of a schedule. */
export function scheduleExerciseCount(schedule: Schedule): number {
  return schedule.days.reduce((sum, day) => sum + day.exercises.length, 0);
}
