/**
 * Running the app as on Android, for its hardware back button and the share
 * sheet. The page gets the part of Capacitor's native bridge the listeners of
 * the App and ShareTarget plugins use, so the app's own wiring runs:
 * `androidBack` sends the `backButton` event to the listeners it registered,
 * and `shareToApp` the `shared` event.
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

export interface AndroidOptions {
  /** Text shared to the app as it launches, kept until the app listens (as the native plugin does). */
  launchShare?: string;
}

/** Makes the app run as on Android. Call before opening it. */
export async function asAndroid(page: Page, options: AndroidOptions = {}): Promise<void> {
  await page.addInitScript(({ launchShare }) => {
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
        {
          name: 'ShareTarget',
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
        if (options.eventName === 'shared' && launchShare !== undefined) {
          const text = launchShare;
          launchShare = undefined;
          setTimeout(() => callback({ text }));
        }
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
  }, options);
}

/** Presses Android's back button (the app must run as on Android: `asAndroid`). */
export async function androidBack(page: Page): Promise<void> {
  const listeners = await page.evaluate(
    () => (window as unknown as AndroidWindow).appEvent?.('backButton', { canGoBack: true }) ?? 0,
  );
  expect(listeners, 'back button listeners').toBe(1);
}

/** Shares `text` to the running app from another app (the app must run as on Android: `asAndroid`). */
export async function shareToApp(page: Page, text: string): Promise<void> {
  const listeners = await page.evaluate(
    (shared) => (window as unknown as AndroidWindow).appEvent?.('shared', { text: shared }) ?? 0,
    text,
  );
  expect(listeners, 'share listeners').toBe(1);
}
