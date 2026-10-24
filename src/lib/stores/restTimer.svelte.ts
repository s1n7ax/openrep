/**
 * The rest countdown of the workout screen: which set started it and when it
 * reaches zero. Kept here rather than in the screen so it keeps running while
 * an exercise's page is opened from the workout; it is not saved.
 */

export interface Rest {
  sessionId: string;
  /** The exercise and set whose tick started it. */
  sessionExerciseId: string;
  setId: string;
  /** Length in whole seconds. */
  seconds: number;
  /** When it reaches zero, in milliseconds since the epoch (`Date.now()`). */
  endsAt: number;
}

/**
 * Whole seconds left at `now` (ms since the epoch), rounded up so the
 * countdown shows its full length first and 0 only once it is over. Never
 * more than its length, nor less than 0.
 */
export function restSecondsLeft(rest: Rest, now: number): number {
  const left = Math.ceil((rest.endsAt - now) / 1000);
  return Math.max(0, Math.min(rest.seconds, left));
}

class RestTimer {
  #current = $state.raw<Rest | null>(null);

  /** The running (or just finished) countdown, if any. */
  get current(): Rest | null {
    return this.#current;
  }

  /** Starts a countdown of `rest.seconds` from `now`, replacing any other. */
  start(rest: Omit<Rest, 'endsAt'>, now: number = Date.now()): void {
    this.#current = { ...rest, endsAt: now + rest.seconds * 1000 };
  }

  stop(): void {
    this.#current = null;
  }

  /** Whether the countdown was started by ticking set `setId` of exercise `sessionExerciseId`. */
  startedBy(sessionExerciseId: string, setId: string): boolean {
    return this.#current?.sessionExerciseId === sessionExerciseId && this.#current.setId === setId;
  }
}

export const restTimer = new RestTimer();
