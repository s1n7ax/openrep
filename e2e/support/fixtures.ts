/**
 * The `test` every spec uses: Playwright's, plus a check that the page had
 * no uncaught exception and logged no error, and a still 3D view on the
 * workout screen.
 */
import { test as base, expect } from '@playwright/test';
import { REMOTE_CATALOG_ORIGIN } from './env.ts';

export { expect };

export const test = base.extend<{ pageErrors: string[]; stillWorkoutPictures: void }>({
  pageErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];
      page.on('pageerror', (error) => errors.push(`Uncaught: ${error.message}`));
      page.on('console', (message) => {
        if (message.type() !== 'error') return;
        // Chromium itself logs failed requests. Failed catalog downloads are
        // expected (offline, or not served by the test) and the app handles them.
        if (message.location().url.startsWith(REMOTE_CATALOG_ORIGIN)) return;
        errors.push(`console.error: ${message.text()}`);
      });
      await use(errors);
      expect(errors, 'errors in the page').toEqual([]);
    },
    { auto: true },
  ],
  // Software WebGL renders a playing 3D view at a few frames per second and
  // holds up the page meanwhile, so every step on the workout screen would
  // take seconds. Its 3D views are told they are off the screen, so they
  // render a still frame and stop; the exercise page's view plays as usual.
  stillWorkoutPictures: [
    async ({ page }, use) => {
      await page.addInitScript(() => {
        const Observer = window.IntersectionObserver;
        window.IntersectionObserver = class extends Observer {
          constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
            super(
              (entries, observer) =>
                callback(
                  entries.map((entry) =>
                    entry.target.closest('[data-testid="workout-picture"]')
                      ? {
                          target: entry.target,
                          time: entry.time,
                          rootBounds: entry.rootBounds,
                          boundingClientRect: entry.boundingClientRect,
                          intersectionRect: new DOMRectReadOnly(),
                          isIntersecting: false,
                          intersectionRatio: 0,
                        }
                      : entry,
                  ),
                  observer,
                ),
              options,
            );
          }
        };
      });
      await use();
    },
    { auto: true },
  ],
});
