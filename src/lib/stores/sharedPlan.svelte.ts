/**
 * Text shared to the app (see `shareTarget.ts`), waiting for the import screen
 * to show it as a plan to preview and add.
 */
import { paths, router } from '../router.ts';

class SharedPlan {
  #text = $state<string | null>(null);

  /** Keeps `text` for the import screen and opens it. */
  receive(text: string): void {
    this.#text = text;
    router.navigate(paths.scheduleCreatorPaste());
  }

  /** The text waiting to be shown, once; null when there is none. */
  take(): string | null {
    const text = this.#text;
    this.#text = null;
    return text;
  }
}

export const sharedPlan = new SharedPlan();
