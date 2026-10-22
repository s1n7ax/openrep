/**
 * Loading and saving the user data document (`openrep/userdata.json` in the
 * app's private data directory).
 */
import { userDataSchema, emptyUserData, type UserData } from '../schema/userData.ts';
import { readWithFallback, writeFileAtomically, type TextFiles } from './files.ts';

export const USER_DATA_DIR = 'openrep';
export const USER_DATA_FILE = 'userdata.json';

/** A saved user data file could not be read, and could not be moved aside either. */
export class UserDataUnreadableError extends Error {
  override name = 'UserDataUnreadableError';
}

export interface LoadedUserData {
  data: UserData;
  /**
   * Name of the file an unreadable copy was kept as (in `USER_DATA_DIR`), or
   * null when nothing was unreadable. The app shows a banner when set.
   */
  corruptFile: string | null;
}

/** Parses and validates user data text. Throws when it is not valid JSON or not valid user data. */
export function parseUserData(text: string): UserData {
  return userDataSchema.parse(JSON.parse(text));
}

/** `userdata.corrupt-2026-01-31T10-15-00-000Z.json`: a timestamp safe in file names. */
export function corruptFileName(now: Date, suffix = ''): string {
  return `userdata.corrupt-${now.toISOString().replace(/[:.]/g, '-')}${suffix}.json`;
}

/**
 * Loads user data, preferring `userdata.json` and falling back to the
 * temporary file of an interrupted save. Copies that cannot be read or
 * validated are renamed to `userdata.corrupt-<timestamp>.json` so nothing is
 * lost; when no valid copy remains, it starts from empty data. A first launch
 * (no file) gives empty data.
 *
 * @throws {UserDataUnreadableError} when an unreadable copy cannot be moved
 *   aside: saving would then overwrite it, so the caller must not save.
 */
export async function loadUserDataFile(files: TextFiles, now: Date): Promise<LoadedUserData> {
  const result = await readWithFallback(files, USER_DATA_DIR, USER_DATA_FILE, parseUserData);
  let corruptFile: string | null = null;
  for (const [index, { name, error }] of result.invalid.entries()) {
    console.error(`Saved user data "${name}" could not be read:`, error);
    const kept = corruptFileName(now, index === 0 ? '' : `-${index}`);
    try {
      await files.rename(`${USER_DATA_DIR}/${name}`, `${USER_DATA_DIR}/${kept}`);
    } catch (renameError) {
      console.error(`Could not keep unreadable user data as "${kept}":`, renameError);
      throw new UserDataUnreadableError(
        `Saved user data "${name}" is unreadable and could not be moved aside`,
        { cause: renameError },
      );
    }
    corruptFile ??= kept;
  }
  return { data: result.value ?? emptyUserData(), corruptFile };
}

/** Saves user data crash-safely. Rejects with the file system's error when it fails. */
export async function saveUserDataFile(files: TextFiles, data: UserData): Promise<void> {
  await writeFileAtomically(files, USER_DATA_DIR, USER_DATA_FILE, JSON.stringify(data));
}
