import type * as z from 'zod';
import { animationSchema, type Animation } from '../schema/animation.ts';
import { exerciseSchema, type Exercise } from '../schema/exercise.ts';
import { scheduleSchema, type Schedule } from '../schema/schedule.ts';

/** A file of the data directory. */
export interface DataFile {
  /** Path relative to the data directory with "/" separators, e.g. `exercises/pushups.json`. */
  path: string;
  content: string;
}

/** The raw content of a data directory (`data/`). */
export interface DataSet {
  /** Files directly in `exercises/` (the `images/` folder excluded). */
  exercises: DataFile[];
  /** Files in `animations/`. */
  animations: DataFile[];
  /** Files in `schedules/`. */
  schedules: DataFile[];
  /** Image files under `exercises/images/`, relative to `exercises/`, e.g. `images/pushups/0.webp`. */
  images: string[];
}

export interface ValidationIssue {
  /** Path of the offending file relative to the data directory. */
  file: string;
  message: string;
}

/** The files that passed their schema. */
export interface ValidatedData {
  exercises: Exercise[];
  animations: Animation[];
  schedules: Schedule[];
}

export interface ValidationResult {
  /** Every problem found; the data is valid when this is empty. */
  issues: ValidationIssue[];
  data: ValidatedData;
}

/** Formats a zod issue path like `days[0].exercises[1].reps`. */
export function formatIssuePath(path: readonly PropertyKey[]): string {
  let result = '';
  for (const key of path) {
    if (typeof key === 'number') result += `[${key}]`;
    else result += result === '' ? String(key) : `.${String(key)}`;
  }
  return result;
}

function fileBaseName(filePath: string): string {
  return filePath.slice(filePath.lastIndexOf('/') + 1);
}

/** Parses and schema-checks every file of one kind, reporting issues. */
function parseFiles<T>(
  files: DataFile[],
  schema: z.ZodType<T>,
  idOf: (item: T) => string,
  idField: string,
  issues: ValidationIssue[],
): { file: DataFile; item: T }[] {
  const parsed: { file: DataFile; item: T }[] = [];
  for (const file of files) {
    const report = (message: string) => issues.push({ file: file.path, message });
    const baseName = fileBaseName(file.path);
    if (!baseName.endsWith('.json')) {
      report('unexpected file: only .json files belong in this folder');
      continue;
    }
    let json: unknown;
    try {
      json = JSON.parse(file.content);
    } catch (error) {
      report(`invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }
    const result = schema.safeParse(json);
    if (!result.success) {
      for (const issue of result.error.issues) {
        const where = formatIssuePath(issue.path);
        report(where === '' ? issue.message : `${where}: ${issue.message}`);
      }
      continue;
    }
    const id = idOf(result.data);
    if (baseName !== `${id}.json`) {
      report(`file name must be "${id}.json" to match ${idField} "${id}"`);
    }
    parsed.push({ file, item: result.data });
  }
  return parsed;
}

/** Reports items that share an id, naming the first file that used it. */
function checkUnique<T>(
  parsed: { file: DataFile; item: T }[],
  idOf: (item: T) => string,
  idField: string,
  issues: ValidationIssue[],
): void {
  const seen = new Map<string, string>();
  for (const { file, item } of parsed) {
    const id = idOf(item);
    const first = seen.get(id);
    if (first === undefined) seen.set(id, file.path);
    else issues.push({ file: file.path, message: `${idField} "${id}" is already used by ${first}` });
  }
}

/**
 * Validates the whole data directory: every file parses and matches its
 * schema, file names equal ids, ids are unique, images exist, and animations
 * and schedules only reference existing exercises.
 */
export function validateData(set: DataSet): ValidationResult {
  const issues: ValidationIssue[] = [];

  const exercises = parseFiles(set.exercises, exerciseSchema, (e) => e.id, 'id', issues);
  const animations = parseFiles(
    set.animations,
    animationSchema,
    (a) => a.exerciseId,
    'exerciseId',
    issues,
  );
  const schedules = parseFiles(set.schedules, scheduleSchema, (s) => s.id, 'id', issues);

  checkUnique(exercises, (e) => e.id, 'id', issues);
  checkUnique(animations, (a) => a.exerciseId, 'exerciseId', issues);
  checkUnique(schedules, (s) => s.id, 'id', issues);

  const images = new Set(set.images);
  for (const { file, item } of exercises) {
    item.images.forEach((image, index) => {
      if (!images.has(image)) {
        issues.push({ file: file.path, message: `images[${index}]: file not found: ${image}` });
      }
    });
  }

  const exerciseIds = new Set(exercises.map(({ item }) => item.id));
  for (const { file, item } of animations) {
    if (!exerciseIds.has(item.exerciseId)) {
      issues.push({
        file: file.path,
        message: `exerciseId: no exercise with id "${item.exerciseId}"`,
      });
    }
  }
  for (const { file, item } of schedules) {
    item.days.forEach((day, dayIndex) => {
      day.exercises.forEach((entry, entryIndex) => {
        if (entry.exerciseId !== undefined && !exerciseIds.has(entry.exerciseId)) {
          issues.push({
            file: file.path,
            message: `days[${dayIndex}].exercises[${entryIndex}].exerciseId: no exercise with id "${entry.exerciseId}"`,
          });
        }
      });
    });
  }

  issues.sort((a, b) => (a.file < b.file ? -1 : a.file > b.file ? 1 : 0));
  return {
    issues,
    data: {
      exercises: exercises.map(({ item }) => item),
      animations: animations.map(({ item }) => item),
      schedules: schedules.map(({ item }) => item),
    },
  };
}
