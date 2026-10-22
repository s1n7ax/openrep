/**
 * App lifecycle wiring with `@capacitor/app`: save when the app goes to the
 * background, and Android's hardware back button.
 */
import { App } from '@capacitor/app';
import { Capacitor, type PluginListenerHandle } from '@capacitor/core';
import { router } from './router.ts';

export interface LifecycleHandlers {
  /** The app is going to the background (or the page is being hidden / unloaded). */
  onPause: () => void;
}

/**
 * Registers the lifecycle listeners. Returns a function removing them.
 *
 * - `pause` (native; on the web the plugin maps it to `visibilitychange`)
 *   and `pagehide` (web reloads) call `onPause`.
 * - Android back closes the top dialog, exits at a tab root and otherwise
 *   goes back (see `router.handleBackButton`).
 */
export function setupLifecycle({ onPause }: LifecycleHandlers): () => void {
  const handles: Promise<PluginListenerHandle>[] = [App.addListener('pause', onPause)];
  if (Capacitor.isNativePlatform()) {
    handles.push(
      App.addListener('backButton', () =>
        router.handleBackButton(() => {
          App.exitApp().catch((error: unknown) => console.error('Could not exit the app:', error));
        }),
      ),
    );
  }
  window.addEventListener('pagehide', onPause);
  return () => {
    window.removeEventListener('pagehide', onPause);
    for (const handle of handles) {
      handle
        .then((listener) => listener.remove())
        .catch((error: unknown) => console.error('Could not remove a listener:', error));
    }
  };
}
