/**
 * The `test` every spec uses: Playwright's, plus a check that the page had
 * no uncaught exception and logged no error.
 */
import { test as base, expect } from '@playwright/test';
import { REMOTE_CATALOG_ORIGIN } from './env.ts';

export { expect };

export const test = base.extend<{ pageErrors: string[] }>({
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
});
