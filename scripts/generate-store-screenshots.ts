/**
 * Takes the phone screenshots of the store listing
 * (`fastlane/metadata/android/en-US/images/phoneScreenshots/`, 1080 × 1920):
 * an exercise in 3D, a plan, a workout being logged, the history, exercise
 * search and the community schedules. Drives the app through its own Vite dev
 * server in a headless Chromium (Playwright; set PLAYWRIGHT_BROWSERS_PATH if
 * your system needs specific browsers) with every other network request
 * blocked. Run after changing these screens, and commit the files.
 *
 * Usage: `npm run generate:store-screenshots`
 */
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { createServer } from 'vite';
import { LISTING_DIR, REPO_ROOT } from './lib/paths.ts';

/** CSS pixels of the phone; × 3 gives 1080 × 1920, the 9:16 size Google Play recommends. */
const VIEWPORT = { width: 360, height: 640 };
const SCALE = 3;

const outDir = path.join(LISTING_DIR, 'images', 'phoneScreenshots');
await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });

const server = await createServer({
  root: REPO_ROOT,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 5198, strictPort: false },
});
await server.listen();
const baseUrl = server.resolvedUrls?.local[0] ?? 'http://127.0.0.1:5198/';
const appOrigin = new URL(baseUrl).origin;

const browser = await chromium.launch();
const pageErrors: string[] = [];
try {
  const context = await browser.newContext({
    viewport: VIEWPORT,
    deviceScaleFactor: SCALE,
    colorScheme: 'dark',
    locale: 'en-US',
    timezoneId: 'UTC',
  });
  // Catalog updates and anything else off the dev server: the screenshots
  // show the catalog built into the app.
  await context.route(
    (url) => url.origin !== appOrigin,
    (route) => route.abort(),
  );
  const page = await context.newPage();
  page.on('pageerror', (error) => pageErrors.push(error.message));

  let count = 0;
  async function shoot(name: string): Promise<void> {
    // Let the last layout and image loads settle, and hide the text cursor.
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.waitForLoadState('networkidle');
    count++;
    const file = path.join(outDir, `${String(count).padStart(2, '0')}-${name}.png`);
    await page.screenshot({ path: file, animations: 'disabled' });
    console.log(path.relative(REPO_ROOT, file));
  }

  /** Waits until the 3D view has drawn `frames` more frames. */
  async function renderFrames(target: Page, frames: number): Promise<void> {
    const viewer = target.getByTestId('exercise-viewer');
    const before = Number((await viewer.getAttribute('data-frame', { timeout: 30_000 })) ?? 0);
    await target.waitForFunction(
      (until) =>
        Number(
          document.querySelector('[data-testid="exercise-viewer"]')?.getAttribute('data-frame') ??
            0,
        ) >= until,
      before + frames,
      { timeout: 60_000 },
    );
  }

  await page.goto(baseUrl);

  // The exercise page of a core exercise, mid-movement.
  await page.goto(`${baseUrl}#/exercises/barbell-squat`);
  await page.getByTestId('exercise-name').waitFor();
  await renderFrames(page, 40);
  await shoot('exercise-3d');

  // A plan copied from a starter schedule.
  await page.goto(`${baseUrl}#/schedules`);
  await page.locator('[data-testid="schedule-card"][data-schedule-id="push-pull-legs"]').click();
  await page.getByTestId('schedule-copy').click();
  await page.getByTestId('plan-day').first().waitFor();
  await shoot('plan');

  // A workout of its first day with two sets logged.
  await page.getByTestId('plan-day').first().getByTestId('day-start').click();
  const exercise = page.getByTestId('workout-exercise').first();
  await exercise.waitFor();
  for (const [index, [weight, reps]] of [
    ['60', '8'],
    ['60', '8'],
  ].entries()) {
    const set = exercise.getByTestId('set-row').nth(index);
    await set.getByTestId('set-weight').fill(weight!);
    await set.getByTestId('set-reps').fill(reps!);
    await set.getByTestId('set-done').check();
  }
  await shoot('workout');

  await page.getByTestId('workout-finish').click();
  await page.getByTestId('history-set').first().waitFor();
  await page.getByTestId('tab-history').click();
  await page.getByTestId('history-row').first().waitFor();
  await shoot('history');

  // Search by an alternative name.
  await page.getByTestId('tab-exercises').click();
  await page.getByTestId('exercise-search').fill('skull crusher');
  await page.getByTestId('exercise-row').first().waitFor();
  await shoot('search');

  await page.getByTestId('tab-schedules').click();
  await page.getByTestId('schedule-card').first().waitFor();
  await shoot('schedules');
} finally {
  await browser.close();
  await server.close();
}
if (pageErrors.length > 0) {
  console.error(`Errors in the page:\n  ${[...new Set(pageErrors)].join('\n  ')}`);
  process.exit(1);
}
