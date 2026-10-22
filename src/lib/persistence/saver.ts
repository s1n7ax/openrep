/**
 * Debounced, serialised saving: many quick changes become one write, writes
 * never overlap, and `flush` writes the latest pending value right away (when
 * the app goes to the background).
 */

export type SaveState = 'saved' | 'pending' | 'saving' | 'error';

export interface SaverOptions<T> {
  save: (value: T) => Promise<void>;
  /** Quiet time after the last change before writing. */
  delayMs: number;
  /** Called when a write fails; the value stays pending and is retried on the next change or flush. */
  onError?: (error: unknown) => void;
  /** Called whenever the state changes. */
  onState?: (state: SaveState) => void;
}

export interface Saver<T> {
  /** Records the latest value and (re)starts the quiet-time timer. */
  schedule(value: T): void;
  /** Writes the pending value now, if any, and resolves when all writes are done. */
  flush(): Promise<void>;
  /**
   * Writes `value` now, after any write in progress, and resolves once it is
   * written. Rejects with the save's error when it fails; the value then
   * stays pending and is retried like any failed write.
   */
  save(value: T): Promise<void>;
}

const NOTHING = Symbol('nothing pending');

export function createSaver<T>(options: SaverOptions<T>): Saver<T> {
  let pending: T | typeof NOTHING = NOTHING;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let chain: Promise<void> = Promise.resolve();
  let writing = 0;
  let failed = false;

  function report() {
    const state: SaveState =
      writing > 0 ? 'saving' : pending !== NOTHING ? (failed ? 'error' : 'pending') : 'saved';
    options.onState?.(state);
  }

  /**
   * Writes the pending value, if any, after the writes before it. Resolves
   * when all writes are done, with the error of this write when it failed.
   */
  function writePending(): Promise<{ error: unknown } | null> {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending === NOTHING) return chain.then(() => null);
    const value = pending;
    pending = NOTHING;
    writing++;
    report();
    const write = chain.then(async () => {
      try {
        await options.save(value);
        failed = false;
        return null;
      } catch (error) {
        failed = true;
        // Keep the value for the next attempt unless something newer is waiting.
        if (pending === NOTHING) pending = value;
        options.onError?.(error);
        return { error };
      } finally {
        writing--;
        report();
      }
    });
    chain = write.then(() => undefined);
    return write;
  }

  return {
    schedule(value) {
      pending = value;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => void writePending(), options.delayMs);
      report();
    },
    async flush() {
      await writePending();
    },
    async save(value) {
      pending = value;
      const failure = await writePending();
      if (failure) throw failure.error;
    },
  };
}
