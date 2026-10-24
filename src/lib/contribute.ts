/**
 * Contributing to the open catalog from the app: a plan becomes a schedule
 * file, a custom exercise an exercise file. Submit opens GitHub's "new file"
 * page in the repository with the file name, content and commit message
 * filled in; GitHub then offers to fork and open a pull request.
 *
 * GitHub documents the `filename` parameter but not `value`, so the content
 * is also copied to the clipboard, and a URL that would be too long leaves
 * `value` out ("paste the copied content").
 */
import type { Exercise } from './schema/exercise.ts';
import { exerciseSchema } from './schema/exercise.ts';
import {
  scheduleSchema,
  type Schedule,
  type ScheduleEntry,
  type ScheduleItem,
  type ScheduleSupersetExercise,
} from './schema/schedule.ts';
import type { CustomExercise, Plan, PlanExercise } from './schema/userData.ts';
import { normalizeCustomExerciseInput } from './userData/customExercises.ts';
import { dayBlocks } from './userData/plans.ts';

/** The project's public repository. */
export const REPOSITORY_URL = 'https://github.com/s1n7ax/openrep';

/** GitHub's page for adding a file to the repository's main branch. */
export const NEW_FILE_URL = `${REPOSITORY_URL}/new/main`;

/** Longest submit URL that still carries the file content (`value`). */
export const MAX_SUBMIT_URL_LENGTH = 6000;

/** Longest slug part of a generated id. */
const MAX_SLUG_LENGTH = 48;

/** Why something cannot be submitted yet. */
export type ContributionProblem =
  /** The plan has no day with exercises. */
  | 'no-exercises'
  /** The custom exercise has no primary muscle. */
  | 'no-primary-muscle'
  /** The custom exercise has no instruction step. */
  | 'no-steps'
  /** The built file does not pass the data format's validation. */
  | 'invalid';

/** A plan or custom exercise cannot be turned into a valid data file. */
export class ContributionInvalidError extends Error {
  override name = 'ContributionInvalidError';
  readonly problem: ContributionProblem;

  constructor(problem: ContributionProblem, message: string, options?: ErrorOptions) {
    super(message, options);
    this.problem = problem;
  }
}

/** "Push / Pull (Legs!)" → "push-pull-legs"; "" when nothing usable is left. */
export function slugify(text: string): string {
  const slug = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  if (slug.length <= MAX_SLUG_LENGTH) return slug;
  const cut = slug.slice(0, MAX_SLUG_LENGTH);
  const lastDash = cut.lastIndexOf('-');
  return (lastDash > 0 ? cut.slice(0, lastDash) : cut).replace(/-+$/, '');
}

/** Six random lowercase letters and digits, for unique ids. */
export function randomSuffix(): string {
  const alphabet = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), (byte) =>
    alphabet.charAt(byte % alphabet.length),
  ).join('');
}

export interface PlanToScheduleContext {
  customExercises: readonly CustomExercise[];
  findExercise: (id: string) => Exercise | undefined;
  /** Appended to the slug of the plan name to make the schedule id unique. */
  suffix: string;
}

/**
 * The schedule file for a plan. Exercises in the catalog are referenced by
 * id; custom exercises (and catalog exercises that no longer exist) become
 * name-only entries. Weights are personal and left out; days without
 * exercises are skipped. A plan with supersets gives a version 2 file with
 * them; any other plan a version 1 file.
 *
 * @throws {ContributionInvalidError} when no day has exercises, or the result
 *   does not validate.
 */
export function planToSchedule(plan: Plan, context: PlanToScheduleContext): Schedule {
  const { customExercises, findExercise, suffix } = context;
  const days = plan.days
    .map((day, index) => ({ day, index }))
    .filter(({ day }) => day.exercises.length > 0);
  if (days.length === 0) {
    throw new ContributionInvalidError('no-exercises', 'The plan has no exercises');
  }

  function entryName(entry: PlanExercise): string {
    const ref = entry.exercise;
    const current =
      ref.kind === 'custom'
        ? customExercises.find((custom) => custom.id === ref.customExerciseId)?.name
        : undefined;
    return (current ?? ref.name).trim() || 'Exercise';
  }

  /** The exercise as an entry without sets and rest (those of a superset's exercises are shared). */
  function exerciseFields(entry: PlanExercise): ScheduleSupersetExercise {
    const ref = entry.exercise;
    const catalogId =
      ref.kind === 'catalog' && findExercise(ref.exerciseId) ? ref.exerciseId : undefined;
    const fields: ScheduleSupersetExercise =
      catalogId !== undefined ? { exerciseId: catalogId } : { name: entryName(entry) };
    if (entry.reps !== undefined) fields.reps = entry.reps;
    if (entry.durationSec !== undefined) fields.durationSec = entry.durationSec;
    const notes = entry.notes?.trim();
    if (notes) fields.notes = notes;
    return fields;
  }

  function scheduleEntry(entry: PlanExercise): ScheduleEntry {
    const { exerciseId, name, reps, durationSec, notes } = exerciseFields(entry);
    const scheduleEntry: ScheduleEntry =
      exerciseId !== undefined ? { exerciseId, sets: entry.sets } : { name, sets: entry.sets };
    if (reps !== undefined) scheduleEntry.reps = reps;
    if (durationSec !== undefined) scheduleEntry.durationSec = durationSec;
    if (entry.restSec !== undefined) scheduleEntry.restSec = entry.restSec;
    if (notes !== undefined) scheduleEntry.notes = notes;
    return scheduleEntry;
  }

  const name = plan.name.trim() || 'Untitled plan';
  const header = {
    id: `${slugify(name) || 'schedule'}-${suffix}`,
    name,
    description: `A ${days.length}-day plan shared from the OpenRep app.`,
  };
  const grouped = days.map(({ day, index }) => ({
    name: day.name.trim() || `Day ${index + 1}`,
    exercises: day.exercises,
    blocks: dayBlocks(day),
  }));
  const hasSupersets = grouped.some((day) => day.blocks.some((block) => block.kind === 'superset'));
  const schedule: Schedule = hasSupersets
    ? {
        formatVersion: 2,
        ...header,
        days: grouped.map((day) => ({
          name: day.name,
          exercises: day.blocks.map((block): ScheduleItem => {
            if (block.kind === 'exercise') return scheduleEntry(block.entry);
            const { restSec } = block.superset;
            return {
              superset: {
                rounds: block.entries[0]!.sets,
                ...(restSec === undefined ? {} : { restSec }),
                exercises: block.entries.map(exerciseFields),
              },
            };
          }),
        })),
      }
    : {
        formatVersion: 1,
        ...header,
        days: grouped.map((day) => ({
          name: day.name,
          exercises: day.exercises.map(scheduleEntry),
        })),
      };

  const result = scheduleSchema.safeParse(schedule);
  if (!result.success) {
    throw new ContributionInvalidError(
      'invalid',
      `Schedule is not valid: ${result.error.message}`,
      {
        cause: result.error,
      },
    );
  }
  return result.data;
}

/** Whether a custom exercise has what an exercise file needs (a primary muscle and a step). */
export function canSubmitCustomExercise(custom: CustomExercise): boolean {
  return custom.primaryMuscles.length > 0 && custom.instructions.some((step) => step.trim() !== '');
}

export interface CustomExerciseToExerciseContext {
  findExercise: (id: string) => Exercise | undefined;
  /** Appended to the id when the slug of the name is already a catalog id. */
  suffix: string;
}

/**
 * The exercise file for a custom exercise (`source.name = "community"`). The
 * category defaults to strength and the level to beginner; reviewers adjust
 * them in the pull request. Notes are personal and left out.
 *
 * @throws {ContributionInvalidError} without a primary muscle or a step, or
 *   when the result does not validate.
 */
export function customExerciseToExercise(
  custom: CustomExercise,
  context: CustomExerciseToExerciseContext,
): Exercise {
  const clean = normalizeCustomExerciseInput(custom);
  if (clean.primaryMuscles.length === 0) {
    throw new ContributionInvalidError('no-primary-muscle', 'Add at least one primary muscle');
  }
  if (clean.instructions.length === 0) {
    throw new ContributionInvalidError('no-steps', 'Add at least one step');
  }
  const slug = slugify(clean.name) || 'exercise';
  const exercise: Exercise = {
    formatVersion: 1,
    id: context.findExercise(slug) ? `${slug}-${context.suffix}` : slug,
    name: clean.name || 'Exercise',
    aliases: [],
    category: 'strength',
    level: 'beginner',
    force: null,
    mechanic: null,
    equipment: clean.equipment,
    primaryMuscles: [...clean.primaryMuscles],
    secondaryMuscles: [...clean.secondaryMuscles],
    instructions: [...clean.instructions],
    images: [],
    source: { name: 'community' },
  };
  const result = exerciseSchema.safeParse(exercise);
  if (!result.success) {
    throw new ContributionInvalidError(
      'invalid',
      `Exercise is not valid: ${result.error.message}`,
      {
        cause: result.error,
      },
    );
  }
  return result.data;
}

/** A data file to propose to the repository. */
export interface Contribution {
  /** Path in the repository, e.g. `data/schedules/push-pull-legs-x1y2z3.json`. */
  path: string;
  /** The file content (JSON with a trailing newline). */
  json: string;
  /** Commit message. */
  message: string;
}

function fileContent(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function scheduleContribution(schedule: Schedule): Contribution {
  return {
    path: `data/schedules/${schedule.id}.json`,
    json: fileContent(schedule),
    message: `Add schedule: ${schedule.name}`,
  };
}

export function exerciseContribution(exercise: Exercise): Contribution {
  return {
    path: `data/exercises/${exercise.id}.json`,
    json: fileContent(exercise),
    message: `Add exercise: ${exercise.name}`,
  };
}

/**
 * The GitHub "new file" URL for a contribution. `includesContent` is false
 * when the content was left out because the URL would be longer than
 * `MAX_SUBMIT_URL_LENGTH`; the user then pastes the copied content.
 */
export function buildSubmitUrl(contribution: Contribution): {
  url: string;
  includesContent: boolean;
} {
  const enc = encodeURIComponent;
  const base = `${NEW_FILE_URL}?filename=${enc(contribution.path).replace(/%2F/g, '/')}`;
  const message = `&message=${enc(contribution.message)}`;
  const withContent = `${base}&value=${enc(contribution.json)}${message}`;
  return withContent.length <= MAX_SUBMIT_URL_LENGTH
    ? { url: withContent, includesContent: true }
    : { url: `${base}${message}`, includesContent: false };
}
