/**
 * Text shared to the app (see `shareTarget.ts`), waiting for the import screen
 * to show it as a plan to preview and add.
 */
import { paths, router } from '../router.ts';

/** A share waiting for the import screen: its text, or null when it could not be read. */
export interface PendingShare {
  text: string | null;
}

class SharedPlan {
  #pending = $state<PendingShare | null>(null);

  /** Keeps a share (null: unreadable) for the import screen and opens it. */
  receive(text: string | null): void {
    this.#pending = { text };
    router.navigate(paths.scheduleCreatorPaste());
  }

  /** The share waiting to be shown, once; null when there is none. */
  take(): PendingShare | null {
    const pending = this.#pending;
    this.#pending = null;
    return pending;
  }
}

export const sharedPlan = new SharedPlan();
