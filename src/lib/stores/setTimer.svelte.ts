/**
 * The countdown of a timed set on the workout screen (a plank held for
 * 30 s): which set it runs for and when it reaches zero, when the set ticks
 * itself off. Kept here, like the rest countdown, so it keeps running while
 * an exercise's page is opened from the workout; it is not saved.
 */

export interface TimedSet {
  sessionId: string;
  /** The exercise and set being held. */
  sessionExerciseId: string;
  setId: string;
  /** Length in whole seconds. */
  seconds: number;
  /** When it reaches zero, in milliseconds since the epoch (`Date.now()`). */
  endsAt: number;
}

/** Whole seconds held at `now` (ms since the epoch), rounded down; never more than its length, nor less than 0. */
export function heldSeconds(timed: TimedSet, now: number): number {
  const held = Math.floor((now - (timed.endsAt - timed.seconds * 1000)) / 1000);
  return Math.max(0, Math.min(timed.seconds, held));
}

class SetTimer {
  #current = $state.raw<TimedSet | null>(null);

  /** The running countdown, if any. */
  get current(): TimedSet | null {
    return this.#current;
  }

  /** Starts a countdown of `timed.seconds` from `now`, replacing any other. */
  start(timed: Omit<TimedSet, 'endsAt'>, now: number = Date.now()): void {
    this.#current = { ...timed, endsAt: now + timed.seconds * 1000 };
  }

  stop(): void {
    this.#current = null;
  }
}

export const setTimer = new SetTimer();
