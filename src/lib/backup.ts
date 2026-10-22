/**
 * Backups: one JSON file (`openrep-backup-YYYY-MM-DD.json`) holding all user
 * data. Building, naming and validating it is pure; `backupFile.ts` saves,
 * shares and reads the file.
 */
import { backupSchema, type Backup } from './schema/backup.ts';
import type { UserData } from './schema/userData.ts';

/** Largest file accepted for import; real backups are far smaller. */
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;

/** Why a file cannot be restored. */
export type BackupProblem =
  /** Larger than `MAX_BACKUP_BYTES`. */
  | 'too-large'
  /** Not JSON (another kind of file, or a damaged one). */
  | 'not-json'
  /** JSON, but not an OpenRep backup. */
  | 'not-backup'
  /** An OpenRep backup from a newer app version. */
  | 'newer-version'
  /** An OpenRep backup whose content is damaged or incomplete. */
  | 'invalid';

/** A file cannot be restored as a backup; nothing was changed. */
export class InvalidBackupError extends Error {
  override name = 'InvalidBackupError';
  readonly problem: BackupProblem;

  constructor(problem: BackupProblem, message: string, options?: ErrorOptions) {
    super(message, options);
    this.problem = problem;
  }
}

/** The message shown when a file cannot be restored. */
export function describeBackupProblem(problem: BackupProblem): string {
  switch (problem) {
    case 'too-large':
      return 'This file is too large to be an OpenRep backup.';
    case 'not-json':
      return 'This file is not an OpenRep backup, or it is damaged.';
    case 'not-backup':
      return 'This file is not an OpenRep backup.';
    case 'newer-version':
      return 'This backup was made by a newer version of OpenRep. Update the app to restore it.';
    case 'invalid':
      return 'This backup is damaged or incomplete and cannot be restored.';
  }
}

/** A backup of `data`, stamped with `exportedAt` (ISO timestamp). */
export function createBackup(data: UserData, exportedAt: string): Backup {
  return { app: 'openrep', kind: 'backup', formatVersion: 1, exportedAt, data };
}

/** The backup file's content. */
export function serializeBackup(backup: Backup): string {
  return `${JSON.stringify(backup, null, 2)}\n`;
}

/** `openrep-backup-2026-10-21.json`, with the local date of `date`. */
export function backupFileName(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return `openrep-backup-${day}.json`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Reads and validates a backup file's content as a whole.
 *
 * @throws {InvalidBackupError} when it is not JSON, not an OpenRep backup,
 *   from a newer format version, or fails validation.
 */
export function parseBackup(text: string): Backup {
  let json: unknown;
  try {
    json = JSON.parse(text.replace(/^\uFEFF/, ''));
  } catch (error) {
    throw new InvalidBackupError('not-json', 'Backup file is not valid JSON', { cause: error });
  }
  if (!isRecord(json) || json.app !== 'openrep' || json.kind !== 'backup') {
    throw new InvalidBackupError('not-backup', 'File is not an OpenRep backup');
  }
  if (typeof json.formatVersion === 'number' && json.formatVersion > 1) {
    throw new InvalidBackupError(
      'newer-version',
      `Backup format version ${json.formatVersion} is newer than this app supports`,
    );
  }
  const result = backupSchema.safeParse(json);
  if (!result.success) {
    throw new InvalidBackupError('invalid', `Backup is not valid: ${result.error.message}`, {
      cause: result.error,
    });
  }
  return result.data;
}

/** What a backup holds, shown before restoring it. */
export interface BackupSummary {
  plans: number;
  customExercises: number;
  sessions: number;
}

export function summarizeBackup(data: UserData): BackupSummary {
  return {
    plans: data.plans.length,
    customExercises: data.customExercises.length,
    sessions: data.sessions.filter((session) => session.finishedAt !== null).length,
  };
}

function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "2 plans, 1 custom exercise and 14 workouts". */
export function describeBackupSummary(summary: BackupSummary): string {
  return `${count(summary.plans, 'plan', 'plans')}, ${count(
    summary.customExercises,
    'custom exercise',
    'custom exercises',
  )} and ${count(summary.sessions, 'workout', 'workouts')}`;
}
