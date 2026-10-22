/**
 * Showing an exercise reference from a plan or session: the current name
 * when the exercise still exists, else the name snapshot with a note.
 */
import { href, paths } from './router.ts';
import type { Exercise } from './schema/exercise.ts';
import type { CustomExercise, ExerciseRef } from './schema/userData.ts';

export interface ResolvedExercise {
  name: string;
  /** Link to the exercise page, or null when the exercise no longer exists. */
  link: string | null;
  /** "No longer in catalog" / "Custom exercise deleted", or null. */
  note: string | null;
  /** The catalog exercise, when the reference is to one that exists. */
  exercise: Exercise | null;
  /** The custom exercise, when the reference is to one that exists. */
  custom: CustomExercise | null;
}

export function resolveExerciseRef(
  ref: ExerciseRef,
  findExercise: (id: string) => Exercise | undefined,
  customExercises: readonly CustomExercise[],
): ResolvedExercise {
  if (ref.kind === 'catalog') {
    const exercise = findExercise(ref.exerciseId);
    return exercise
      ? {
          name: exercise.name,
          link: href(paths.exercise(exercise.id)),
          note: null,
          exercise,
          custom: null,
        }
      : { name: ref.name, link: null, note: 'No longer in catalog', exercise: null, custom: null };
  }
  const custom = customExercises.find((candidate) => candidate.id === ref.customExerciseId);
  return custom
    ? { name: custom.name, link: href(paths.custom(custom.id)), note: null, exercise: null, custom }
    : { name: ref.name, link: null, note: 'Custom exercise deleted', exercise: null, custom: null };
}
