/**
 * Saving and reading backup files. On iOS and Android the backup is written
 * to the app's cache directory and handed to the share sheet (save to files,
 * send to a drive, …); in a browser it is downloaded.
 */
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
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

/** How an export ended: shared (native), downloaded (web) or cancelled from the share sheet. */
export type ExportOutcome = 'shared' | 'downloaded' | 'cancelled';

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking right away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Whether the share sheet was dismissed (the plugins reject with "Share canceled"). */
function isShareCancel(error: unknown): boolean {
  return error instanceof Error && /cancel/i.test(error.message);
}

/**
 * Exports all user data as a backup file. Rejects when the file cannot be
 * written or shared.
 */
export async function exportBackup(data: UserData, now = new Date()): Promise<ExportOutcome> {
  const name = backupFileName(now);
  const text = serializeBackup(createBackup(data, now.toISOString()));
  if (!Capacitor.isNativePlatform()) {
    download(name, text);
    return 'downloaded';
  }
  const { uri } = await Filesystem.writeFile({
    path: name,
    data: text,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });
  try {
    await Share.share({ title: name, files: [uri], dialogTitle: 'Save your OpenRep backup' });
    return 'shared';
  } catch (error) {
    if (isShareCancel(error)) return 'cancelled';
    throw error;
  }
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
