/**
 * Saving and reading plan files (`openrep-plan-<name>.json`). The file is
 * written by `shareFile.ts`: shared on iOS and Android, downloaded in a browser.
 */
import {
  createPlanFile,
  InvalidPlanFileError,
  MAX_PLAN_FILE_BYTES,
  parsePlanFile,
  planFileName,
  serializePlanFile,
} from './planFile.ts';
import type { PlanFile } from './schema/planFile.ts';
import type { CustomExercise, Plan } from './schema/userData.ts';
import { shareOrDownload, type ExportOutcome } from './shareFile.ts';

/**
 * Exports `plan`, with the custom exercises it uses, as a plan file. Rejects
 * when the file cannot be written or shared.
 */
export async function exportPlanFile(
  plan: Plan,
  customExercises: readonly CustomExercise[],
): Promise<ExportOutcome> {
  return shareOrDownload(
    planFileName(plan),
    serializePlanFile(createPlanFile(plan, customExercises)),
    'Save your OpenRep plan',
  );
}

/**
 * Reads and validates a plan file chosen by the user.
 *
 * @throws {InvalidPlanFileError} when the file is too large or not a valid plan file.
 */
export async function readPlanFile(file: Blob): Promise<PlanFile> {
  if (file.size > MAX_PLAN_FILE_BYTES) {
    throw new InvalidPlanFileError('too-large', `Plan file is ${file.size} bytes`);
  }
  return parsePlanFile(await file.text());
}
