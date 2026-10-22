/**
 * Pure updates of the user's custom exercises (see `plans.ts` for the conventions).
 */
import type { Equipment, Muscle } from '../schema/common.ts';
import type { CustomExercise, ExerciseRef, UserData } from '../schema/userData.ts';

/** What the user edits on a custom exercise. */
export interface CustomExerciseInput {
  name: string;
  notes: string;
  equipment: Equipment | null;
  primaryMuscles: readonly Muscle[];
  secondaryMuscles: readonly Muscle[];
  instructions: readonly string[];
}

/**
 * Tidies user input: trims the name, notes and steps, drops empty steps and
 * repeated muscles, and removes secondary muscles that are also primary.
 */
export function normalizeCustomExerciseInput(input: CustomExerciseInput): CustomExerciseInput {
  const primaryMuscles = [...new Set(input.primaryMuscles)];
  return {
    name: input.name.trim(),
    notes: input.notes.trim(),
    equipment: input.equipment,
    primaryMuscles,
    secondaryMuscles: [...new Set(input.secondaryMuscles)].filter(
      (muscle) => !primaryMuscles.includes(muscle),
    ),
    instructions: input.instructions.map((step) => step.trim()).filter((step) => step !== ''),
  };
}

function fields(input: CustomExerciseInput) {
  const clean = normalizeCustomExerciseInput(input);
  return {
    name: clean.name,
    notes: clean.notes,
    equipment: clean.equipment,
    primaryMuscles: [...clean.primaryMuscles],
    secondaryMuscles: [...clean.secondaryMuscles],
    instructions: [...clean.instructions],
  };
}

export function createCustomExercise(
  data: UserData,
  id: string,
  input: CustomExerciseInput,
  now: string,
): UserData {
  const exercise: CustomExercise = { id, ...fields(input), createdAt: now, updatedAt: now };
  return { ...data, customExercises: [...data.customExercises, exercise] };
}

function renameRef(ref: ExerciseRef, id: string, name: string): ExerciseRef {
  return ref.kind === 'custom' && ref.customExerciseId === id ? { ...ref, name } : ref;
}

/**
 * Replaces a custom exercise's fields. Plans referencing it get the new name
 * as their snapshot, so they keep showing it if the exercise is deleted later.
 */
export function updateCustomExercise(
  data: UserData,
  id: string,
  input: CustomExerciseInput,
  now: string,
): UserData {
  const existing = data.customExercises.find((exercise) => exercise.id === id);
  if (!existing) return data;
  const updated: CustomExercise = { ...existing, ...fields(input), updatedAt: now };
  return {
    ...data,
    customExercises: data.customExercises.map((exercise) =>
      exercise.id === id ? updated : exercise,
    ),
    plans:
      existing.name === updated.name
        ? data.plans
        : data.plans.map((plan) => ({
            ...plan,
            days: plan.days.map((day) => ({
              ...day,
              exercises: day.exercises.map((entry) => ({
                ...entry,
                exercise: renameRef(entry.exercise, id, updated.name),
              })),
            })),
          })),
  };
}

/** Removes a custom exercise. Plans and sessions keep showing its name snapshot. */
export function deleteCustomExercise(data: UserData, id: string): UserData {
  const customExercises = data.customExercises.filter((exercise) => exercise.id !== id);
  return customExercises.length === data.customExercises.length
    ? data
    : { ...data, customExercises };
}
