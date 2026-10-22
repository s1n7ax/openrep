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

  function writePending(): Promise<void> {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    if (pending === NOTHING) return chain;
    const value = pending;
    pending = NOTHING;
    writing++;
    report();
    chain = chain.then(async () => {
      try {
        await options.save(value);
        failed = false;
      } catch (error) {
        failed = true;
        // Keep the value for the next attempt unless something newer is waiting.
        if (pending === NOTHING) pending = value;
        options.onError?.(error);
      } finally {
        writing--;
        report();
      }
    });
    return chain;
  }

  return {
    schedule(value) {
      pending = value;
      if (timer !== null) clearTimeout(timer);
      timer = setTimeout(() => void writePending(), options.delayMs);
      report();
    },
    flush: writePending,
  };
}
