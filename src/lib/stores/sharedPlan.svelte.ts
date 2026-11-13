/**
 * Text shared to the app (see `shareTarget.ts`), waiting for the import screen
 * to show it as a plan to preview and add.
 */
import { paths, router } from '../router.ts';
import type { Share } from '../shareTarget.ts';

class SharedPlan {
  #pending = $state<Share | null>(null);

  /** Keeps a share (null: unreadable) for the import screen and opens it. */
  receive(text: string | null): void {
    this.#pending = { text };
    router.navigate(paths.scheduleCreatorPaste());
  }

  /** The share waiting to be shown, once; null when there is none. */
  take(): Share | null {
    const pending = this.#pending;
    this.#pending = null;
    return pending;
  }
}

export const sharedPlan = new SharedPlan();
