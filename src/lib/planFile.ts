/**
 * Plan files: one plan (`openrep-plan-<name>.json`) plus the custom exercises
 * it uses. Building, reading and importing one is pure; `planFileIO.ts` saves
 * and reads the file. The format is described in `llms.txt` and its JSON
 * Schema in `data/schema/plan.v1.json`.
 */
import { slugify } from './contribute.ts';
import {
  planFileSchema,
  type PlanFile,
  type PlanFileCustomExercise,
  type PlanFileExerciseRef,
} from './schema/planFile.ts';
import type {
  CustomExercise,
  ExerciseRef,
  Plan,
  PlanDay,
  PlanExercise,
  Superset,
  UserData,
} from './schema/userData.ts';
import { cleanTarget } from './userData/plans.ts';
import { normalizeSupersets } from './userData/supersets.ts';

/** Largest file accepted for import; real plan files are far smaller. */
export const MAX_PLAN_FILE_BYTES = 5 * 1024 * 1024;

/** Why a file cannot be imported as a plan. */
export type PlanFileProblem =
  /** Larger than `MAX_PLAN_FILE_BYTES`. */
  | 'too-large'
  /** Not JSON (another kind of file, or a damaged one). */
  | 'not-json'
  /** JSON, but not an OpenRep plan file. */
  | 'not-plan'
  /** An OpenRep plan file from a newer app version. */
  | 'newer-version'
  /** An OpenRep plan file whose content is damaged or incomplete. */
  | 'invalid';

/** A file cannot be imported as a plan; nothing was changed. */
export class InvalidPlanFileError extends Error {
  override name = 'InvalidPlanFileError';
  readonly problem: PlanFileProblem;

  constructor(problem: PlanFileProblem, message: string, options?: ErrorOptions) {
    super(message, options);
    this.problem = problem;
  }
}

/** The message shown when a file cannot be imported as a plan. */
export function describePlanFileProblem(problem: PlanFileProblem): string {
  switch (problem) {
    case 'too-large':
      return 'This file is too large to be an OpenRep plan.';
    case 'not-json':
      return 'This file is not an OpenRep plan, or it is damaged.';
    case 'not-plan':
      return 'This file is not an OpenRep plan.';
    case 'newer-version':
      return 'This plan was made by a newer version of OpenRep. Update the app to import it.';
    case 'invalid':
      return 'This plan is damaged or incomplete and cannot be imported.';
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads and validates a plan file's content as a whole.
 *
 * @throws {InvalidPlanFileError} when it is not JSON, not an OpenRep plan
 *   file, from a newer format version, or fails validation.
 */
export function parsePlanFile(text: string): PlanFile {
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new InvalidPlanFileError('not-json', 'Plan file is not valid JSON', { cause: error });
  }
  if (!isRecord(json) || json.app !== 'openrep' || json.kind !== 'plan') {
    throw new InvalidPlanFileError('not-plan', 'File is not an OpenRep plan file');
  }
  if (typeof json.formatVersion === 'number' && json.formatVersion > 1) {
    throw new InvalidPlanFileError(
      'newer-version',
      `Plan file format version ${json.formatVersion} is newer than this app supports`,
    );
  }
  const result = planFileSchema.safeParse(json);
  if (!result.success) {
    throw new InvalidPlanFileError('invalid', `Plan file is not valid: ${result.error.message}`, {
      cause: result.error,
    });
  }
  return result.data;
}

/** Text that is not only whitespace, or `fallback`. */
function textOr(text: string, fallback: string): string {
  return text.trim() === '' ? fallback : text.trim();
}

/**
 * The plan file for `plan`, carrying the custom exercises it refers to.
 * Empty names (the app shows them as "Untitled plan", "Day 1", …) get the
 * same fallbacks, so the file always passes validation.
 */
export function createPlanFile(plan: Plan, customExercises: readonly CustomExercise[]): PlanFile {
  const byId = new Map(customExercises.map((custom) => [custom.id, custom] as const));
  const referenced = new Map<string, PlanFileCustomExercise>();
  for (const day of plan.days) {
    for (const entry of day.exercises) {
      const ref = entry.exercise;
      if (ref.kind !== 'custom' || referenced.has(ref.customExerciseId)) continue;
      const custom = byId.get(ref.customExerciseId);
      if (!custom) continue;
      referenced.set(custom.id, {
        id: custom.id,
        name: textOr(custom.name, textOr(ref.name, 'Exercise')),
        notes: custom.notes,
        equipment: custom.equipment,
        primaryMuscles: [...custom.primaryMuscles],
        secondaryMuscles: [...custom.secondaryMuscles],
        instructions: [...custom.instructions],
        createdAt: custom.createdAt,
        updatedAt: custom.updatedAt,
      });
    }
  }
  const file: PlanFile = {
    app: 'openrep',
    kind: 'plan',
    formatVersion: 1,
    plan: {
      id: plan.id,
      name: textOr(plan.name, 'Untitled plan'),
      days: plan.days.map((day, index) => ({
        id: day.id,
        name: textOr(day.name, `Day ${index + 1}`),
        exercises: day.exercises.map((entry) => ({
          id: entry.id,
          exercise: { ...entry.exercise, name: textOr(entry.exercise.name, 'Exercise') },
          ...cleanTarget(entry),
          ...(entry.supersetId === undefined ? {} : { supersetId: entry.supersetId }),
        })),
        ...(day.supersets === undefined ? {} : { supersets: day.supersets }),
      })),
      createdAt: plan.createdAt,
      updatedAt: plan.updatedAt,
    },
    ...(referenced.size === 0 ? {} : { customExercises: [...referenced.values()] }),
  };
  return planFileSchema.parse(file);
}

/** The file's content: JSON with a trailing newline. */
export function serializePlanFile(file: PlanFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

/** `openrep-plan-push-pull-legs.json`, from the plan's name. */
export function planFileName(plan: Plan): string {
  return `openrep-plan-${slugify(plan.name) || 'plan'}.json`;
}

export interface ImportPlanOptions {
  /** Makes the ids of the new plan, its days, exercises, supersets and custom exercises. */
  newId: () => string;
  /** ISO timestamp stored as the plan's (and new custom exercises') time. */
  now: string;
}

/** What an import added, for the message shown afterwards. */
export interface ImportedPlan {
  data: UserData;
  planId: string;
}

/** Key two custom exercise names are compared by: "  Zercher Squat" ↔ "zercher squat". */
function nameKey(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** A custom exercise as the plan file gives it, with the app's defaults filled in. */
function customExerciseFromFile(
  custom: PlanFileCustomExercise,
  id: string,
  now: string,
): CustomExercise {
  return {
    id,
    name: custom.name.trim().replace(/\s+/g, ' '),
    notes: custom.notes ?? '',
    equipment: custom.equipment ?? null,
    primaryMuscles: [...(custom.primaryMuscles ?? [])],
    secondaryMuscles: [...(custom.secondaryMuscles ?? [])],
    instructions: [...(custom.instructions ?? [])],
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Puts a superset's exercises next to each other, keeping the order of their
 * first member: the app groups a superset only when its exercises are adjacent.
 */
function orderSupersetMembers(exercises: readonly PlanExercise[]): PlanExercise[] {
  const placed = new Set<string>();
  const ordered: PlanExercise[] = [];
  for (const entry of exercises) {
    const supersetId = entry.supersetId;
    if (supersetId === undefined) {
      ordered.push(entry);
      continue;
    }
    if (placed.has(supersetId)) continue;
    placed.add(supersetId);
    for (const member of exercises) {
      if (member.supersetId === supersetId) ordered.push(member);
    }
  }
  return ordered;
}

/**
 * Adds the plan of `file` at the end of the plan list and returns the new user
 * data with the id of the plan it added.
 *
 * - Every id is replaced by a fresh one, so importing twice (or importing a
 *   file whose ids collide with existing records) is safe; supersets keep
 *   their exercises grouped.
 * - A custom exercise of the file is reused when one of the user's has the
 *   same name (ignoring case and spacing), and added otherwise.
 * - A reference to a custom exercise the file does not define is resolved by
 *   name, and added as a custom exercise when the user has none either.
 */
export function importPlanFile(
  data: UserData,
  file: PlanFile,
  options: ImportPlanOptions,
): ImportedPlan {
  const { newId, now } = options;
  const customByName = new Map(
    data.customExercises.map((custom) => [nameKey(custom.name), custom] as const),
  );
  const created: CustomExercise[] = [];
  const byFileId = new Map<string, CustomExercise>();

  function addCustom(custom: PlanFileCustomExercise): CustomExercise {
    const existing = customByName.get(nameKey(custom.name));
    if (existing) return existing;
    const added = customExerciseFromFile(custom, newId(), now);
    customByName.set(nameKey(added.name), added);
    created.push(added);
    return added;
  }

  for (const custom of file.customExercises ?? []) {
    const resolved = addCustom(custom);
    if (custom.id !== undefined) byFileId.set(custom.id, resolved);
  }

  function refFor(ref: PlanFileExerciseRef): ExerciseRef {
    if (ref.kind === 'catalog') {
      return {
        kind: 'catalog',
        exerciseId: ref.exerciseId,
        name: textOr(ref.name, ref.exerciseId),
      };
    }
    const known =
      byFileId.get(ref.customExerciseId) ?? customByName.get(nameKey(ref.name)) ?? undefined;
    const custom = known ?? addCustom({ id: ref.customExerciseId, name: ref.name });
    return { kind: 'custom', customExerciseId: custom.id, name: textOr(custom.name, ref.name) };
  }

  function planDay(day: PlanFile['plan']['days'][number], index: number): PlanDay {
    const supersetIds = new Map<string, string>();
    const supersets: Superset[] = (day.supersets ?? []).map((superset) => {
      const id = newId();
      supersetIds.set(superset.id, id);
      return superset.restSec === undefined ? { id } : { id, restSec: superset.restSec };
    });

    const exercises: PlanExercise[] = day.exercises.map((entry) => {
      const supersetId =
        entry.supersetId === undefined ? undefined : supersetIds.get(entry.supersetId);
      return {
        id: newId(),
        exercise: refFor(entry.exercise),
        ...cleanTarget(entry),
        ...(supersetId === undefined ? {} : { supersetId }),
      };
    });

    // A supersetId naming no superset of the day is dropped: the exercise is a normal one.
    const normalized = normalizeSupersets(orderSupersetMembers(exercises), supersets);
    return {
      id: newId(),
      name: textOr(day.name, `Day ${index + 1}`),
      exercises: normalized.entries,
      ...(normalized.supersets.length === 0 ? {} : { supersets: normalized.supersets }),
    };
  }

  const planId = newId();
  const plan: Plan = {
    id: planId,
    name: textOr(file.plan.name, 'Imported plan'),
    days: file.plan.days.map(planDay),
    createdAt: now,
    updatedAt: now,
  };
  return {
    data: {
      ...data,
      plans: [...data.plans, plan],
      customExercises:
        created.length === 0 ? data.customExercises : [...data.customExercises, ...created],
    },
    planId,
  };
}
