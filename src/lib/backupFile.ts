/**
 * Saving and reading backup files. The file is written by `shareFile.ts`:
 * shared on iOS and Android, downloaded in a browser.
 */
import {
  backupFileName,
  createBackup,
  InvalidBackupError,
  MAX_BACKUP_BYTES,
  parseBackup,
  serializeBackup,
} from './backup.ts';
import type { Backup } from './schema/backup.ts';
import type { UserData } from './schema/userData.ts';
import { shareOrDownload, type ExportOutcome } from './shareFile.ts';

export type { ExportOutcome };

/** Exports all user data as a backup file. Rejects when the file cannot be written or shared. */
export async function exportBackup(data: UserData, now = new Date()): Promise<ExportOutcome> {
  return shareOrDownload(
    backupFileName(now),
    serializeBackup(createBackup(data, now.toISOString())),
    'Save your OpenRep backup',
  );
}

/**
 * Reads and validates a backup file chosen by the user.
 *
 * @throws {InvalidBackupError} when the file is too large or not a valid backup.
 */
export async function readBackupFile(file: Blob): Promise<Backup> {
  if (file.size > MAX_BACKUP_BYTES) {
    throw new InvalidBackupError('too-large', `Backup file is ${file.size} bytes`);
  }
  return parseBackup(await file.text());
}
