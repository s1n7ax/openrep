import { defineConfig, devices } from '@playwright/test';

/** Fixed port for the preview server the e2e tests run against. */
const PORT = 4173;
const BASE_URL = `http://127.0.0.1:${PORT}`;

// Browsers are resolved by Playwright itself, which honours PLAYWRIGHT_BROWSERS_PATH
// (for example a nix-provided browser set) when it is set.
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: BASE_URL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: {
    command: `npm run build && npm run preview -- --host 127.0.0.1 --port ${PORT} --strictPort`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
  },
});
