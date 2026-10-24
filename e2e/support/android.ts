/**
 * Running the app as on Android, for its hardware back button. The page gets
 * the part of Capacitor's native bridge the App plugin's listeners use, so
 * the app's own back-button wiring runs, and `androidBack` sends the
 * `backButton` event to the listeners it registered.
 */
import type { Page } from '@playwright/test';
import { expect } from './fixtures.ts';

type Callback = (data: unknown) => void;

interface AndroidWindow {
  CapacitorCustomPlatform?: { name: string };
  Capacitor?: object;
  /** Sends a native event of the App plugin to its listeners; returns how many there are. */
  appEvent?: (event: string, data: unknown) => number;
}

/** Makes the app run as on Android. Call before opening it. */
export async function asAndroid(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const win = window as unknown as AndroidWindow;
    const listeners = new Map<string, Callback[]>();
    win.CapacitorCustomPlatform = { name: 'android' };
    // Read by @capacitor/core when it loads: App listeners go to the "native" side.
    win.Capacitor = {
      PluginHeaders: [
        {
          name: 'App',
          methods: [
            { name: 'addListener', rtype: 'callback' },
            { name: 'removeListener', rtype: 'promise' },
          ],
        },
      ],
      nativeCallback(
        _plugin: string,
        _method: string,
        options: { eventName: string },
        callback: Callback,
      ) {
        listeners.set(options.eventName, [...(listeners.get(options.eventName) ?? []), callback]);
        return options.eventName;
      },
      nativePromise() {
        return Promise.resolve();
      },
    };
    win.appEvent = (event, data) => {
      const callbacks = listeners.get(event) ?? [];
      for (const callback of callbacks) callback(data);
      return callbacks.length;
    };
  });
}

/** Presses Android's back button (the app must run as on Android: `asAndroid`). */
export async function androidBack(page: Page): Promise<void> {
  const listeners = await page.evaluate(
    () => (window as unknown as AndroidWindow).appEvent?.('backButton', { canGoBack: true }) ?? 0,
  );
  expect(listeners, 'back button listeners').toBe(1);
}
