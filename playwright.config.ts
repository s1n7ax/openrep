import { defineConfig, devices } from '@playwright/test';
import { APP_ORIGIN, APP_PORT, E2E_OUT_DIR, REMOTE_CATALOG_URL } from './e2e/support/env.ts';

// Browsers are resolved by Playwright itself, which honours PLAYWRIGHT_BROWSERS_PATH
// (for example a nix-provided browser set) when it is set.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: APP_ORIGIN,
    locale: 'en-US',
    timezoneId: 'UTC',
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      // A phone-sized window: the app is made for phones, and software WebGL
      // in headless Chromium renders a small 3D view much faster.
      use: { ...devices['Desktop Chrome'], viewport: { width: 412, height: 915 } },
    },
  ],
  webServer: {
    // A build of its own whose catalog updates come from REMOTE_CATALOG_URL,
    // which the tests answer with `page.route`.
    command:
      `npm run build -- --outDir ${E2E_OUT_DIR} && ` +
      `npm run preview -- --outDir ${E2E_OUT_DIR} --host 127.0.0.1 --port ${APP_PORT} --strictPort`,
    env: { VITE_CATALOG_URL: REMOTE_CATALOG_URL },
    url: APP_ORIGIN,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
