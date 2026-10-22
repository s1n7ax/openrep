/**
 * The user's data (plans, custom exercises, sessions, settings) as reactive
 * state, persisted to `openrep/userdata.json` in the app's private data
 * directory: saved 300 ms after the last change and flushed when the app goes
 * to the background.
 *
 * Change it only through `update` with the pure functions in `src/lib/userData/`:
 *
 *     userData.update((data) => renamePlan(data, planId, name, nowIso()));
 */
import { capacitorFiles } from '../persistence/capacitorFiles.ts';
import type { TextFiles } from '../persistence/files.ts';
import { createSaver, type SaveState, type Saver } from '../persistence/saver.ts';
import {
  loadUserDataFile,
  saveUserDataFile,
  UserDataUnreadableError,
} from '../persistence/userDataFile.ts';
import { emptyUserData, type UserData } from '../schema/userData.ts';

/** Quiet time after the last change before saving. */
export const SAVE_DELAY_MS = 300;

/** `update` was called before `load` finished: the change would be lost or overwrite saved data. */
export class UserDataNotLoadedError extends Error {
  override name = 'UserDataNotLoadedError';
}

/**
 * - `ok`: changes are saved.
 * - `disabled`: saved data could not be read nor moved aside, so nothing is
 *   saved this session to avoid overwriting it.
 */
export type PersistenceStatus = 'ok' | 'disabled';

class UserDataStore {
  #data = $state.raw<UserData>(emptyUserData());
  #status = $state<'loading' | 'ready'>('loading');
  #persistence = $state<PersistenceStatus>('ok');
  #saveState = $state<SaveState>('saved');
  /** File an unreadable copy of the saved data was kept as; shown in a banner until dismissed. */
  corruptFile = $state<string | null>(null);
  #saver: Saver<UserData> | null = null;
  #files: TextFiles = capacitorFiles;
  #loading: Promise<void> | null = null;

  get data(): UserData {
    return this.#data;
  }

  get status(): 'loading' | 'ready' {
    return this.#status;
  }

  get persistence(): PersistenceStatus {
    return this.#persistence;
  }

  /** Whether the latest change is on disk (`saved`), waiting, being written, or failed. */
  get saveState(): SaveState {
    return this.#saveState;
  }

  /** Loads the saved data once; later calls return the same promise. */
  load(files: TextFiles = capacitorFiles): Promise<void> {
    this.#loading ??= this.#load(files);
    return this.#loading;
  }

  #createSaver(): Saver<UserData> {
    const files = this.#files;
    return createSaver({
      save: (data) => saveUserDataFile(files, data),
      delayMs: SAVE_DELAY_MS,
      onError: (error) => console.error('Saving user data failed:', error),
      onState: (state) => (this.#saveState = state),
    });
  }

  async #load(files: TextFiles): Promise<void> {
    this.#files = files;
    try {
      const loaded = await loadUserDataFile(files, new Date());
      this.#data = loaded.data;
      this.corruptFile = loaded.corruptFile;
      this.#saver = this.#createSaver();
    } catch (error) {
      // UserDataUnreadableError is the expected case; anything else (a plugin
      // failure) is handled the same way: never risk overwriting saved data.
      const expected = error instanceof UserDataUnreadableError;
      console.error(
        `User data could not be loaded${expected ? '' : ' (unexpected error)'}; changes will not be saved:`,
        error,
      );
      this.#persistence = 'disabled';
      this.#saveState = 'error';
    }
    this.#status = 'ready';
  }

  /**
   * Applies a pure update and schedules saving when the data changed.
   *
   * @throws {UserDataNotLoadedError} when called before `load` finished.
   */
  update(change: (data: UserData) => UserData): void {
    if (this.#status !== 'ready') {
      console.error('User data changed before it was loaded.');
      throw new UserDataNotLoadedError('User data is not loaded yet');
    }
    const next = change(this.#data);
    if (next === this.#data) return;
    this.#data = next;
    this.#saver?.schedule(next);
  }

  /**
   * Replaces all data (backup import) and writes it to disk right away.
   * Resolves once it is saved. When saving was disabled because the saved
   * data could not be read, the restored data replaces that file and saving
   * is turned back on.
   *
   * @throws {UserDataNotLoadedError} when called before `load` finished.
   * Rejects with the file system's error when the data cannot be saved; it
   * is replaced in memory anyway, and saving stays as it was (enabled: the
   * write is retried on the next change; disabled: nothing is written).
   */
  async replaceAll(data: UserData): Promise<void> {
    this.update(() => data);
    if (this.#saver) {
      await this.#saver.save(data);
      return;
    }
    // No saver: saving is disabled. Writing directly cannot overlap a save.
    await saveUserDataFile(this.#files, data);
    this.#saver = this.#createSaver();
    this.#persistence = 'ok';
    this.#saveState = 'saved';
  }

  /** Writes pending changes now; resolves when they are on disk (or failed). */
  flush(): Promise<void> {
    return this.#saver?.flush() ?? Promise.resolve();
  }

  dismissCorruptNotice(): void {
    this.corruptFile = null;
  }
}

export const userData = new UserDataStore();
