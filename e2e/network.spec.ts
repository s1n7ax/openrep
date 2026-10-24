/**
 * Verification "Network": during a full flow the app only requests its own
 * files and the catalog; the page's Content-Security-Policy allows nothing
 * else; no analytics, ads or tracking packages are used.
 */
import { readFile } from 'node:fs/promises';
import { bundledCatalog, openApp } from './support/app.ts';
import { APP_ORIGIN, REMOTE_CATALOG_ORIGIN, REMOTE_CATALOG_URL } from './support/env.ts';
import { expect, test } from './support/fixtures.ts';
import { copySchedule, startDay } from './support/plans.ts';
import { viewer, waitForFrameAfter } from './support/viewer.ts';
import { tickSet, typeWeight } from './support/workout.ts';

/** Where exercise images not bundled with the app come from (see src/lib/catalog/urls.ts). */
const REMOTE_IMAGE_ORIGIN = 'https://raw.githubusercontent.com';

function isAllowed(url: string): boolean {
  if (url.startsWith('data:') || url.startsWith(`blob:${APP_ORIGIN}/`)) return true;
  const { origin } = new URL(url);
  return origin === APP_ORIGIN || origin === REMOTE_CATALOG_ORIGIN;
}

test('a full flow only talks to the app itself and the catalog', async ({ page, request }) => {
  test.setTimeout(120_000);
  const catalog = await bundledCatalog(request);
  const requests: string[] = [];
  page.on('request', (request) => requests.push(request.url()));
  await page.route(REMOTE_CATALOG_URL, (route) =>
    route.fulfill({ json: catalog, headers: { 'access-control-allow-origin': '*' } }),
  );

  // Plans.
  await openApp(page);
  await copySchedule(page, 'beginner-full-body');

  // An exercise page with its 3D view and photos.
  await page.getByTestId('plan-exercise').first().locator('a').click();
  await waitForFrameAfter(page, 0);
  await expect(viewer(page)).toHaveAttribute('data-animated', 'true');
  for (const photo of await page.getByTestId('exercise-photos').locator('img').all()) {
    await photo.scrollIntoViewIfNeeded();
    await expect
      .poll(() => photo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth))
      .toBeGreaterThan(0);
  }

  // A workout.
  await page.goBack();
  await startDay(page, 0);
  const exercise = page.getByTestId('workout-exercise').first();
  await typeWeight(exercise, 0, '40');
  await tickSet(exercise, 0);
  await page.getByTestId('workout-finish').click();
  // Goblet Squat is 10-12 reps: the tick logs the range's low end.
  await expect(page.getByTestId('history-set').first()).toContainText('40 kg × 10');

  // Settings: catalog update and backup export.
  await page.getByTestId('tab-settings').click();
  await page.getByTestId('catalog-update').click();
  await expect(page.getByTestId('catalog-update-result')).toHaveText('The catalog is up to date.');
  await Promise.all([page.waitForEvent('download'), page.getByTestId('backup-export').click()]);

  expect(requests).toContain(REMOTE_CATALOG_URL);
  expect(requests.filter((url) => !isAllowed(url))).toEqual([]);
});

test('the Content-Security-Policy only allows the app, the catalog and image origins', async ({
  page,
}) => {
  await openApp(page);
  const policy = await page
    .locator('meta[http-equiv="Content-Security-Policy"]')
    .getAttribute('content');
  expect(policy).toBeTruthy();
  const directives = new Map(
    policy!.split(';').map((directive) => {
      const [name = '', ...sources] = directive.trim().split(/\s+/);
      return [name, sources] as const;
    }),
  );
  const remote = [REMOTE_CATALOG_ORIGIN, REMOTE_IMAGE_ORIGIN];
  expect(directives.get('default-src')).toEqual(["'self'"]);
  expect(directives.get('script-src')).toEqual(["'self'"]);
  expect(directives.get('connect-src')).toEqual(["'self'", 'data:', 'blob:', ...remote]);
  expect(directives.get('img-src')).toEqual(["'self'", 'data:', 'blob:', ...remote]);
});

test('no analytics, advertising or tracking packages are used', async () => {
  const pkg = JSON.parse(await readFile('package.json', 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const names = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
  const tracking =
    /analytic|tracking|telemetry|firebase|sentry|bugsnag|datadog|newrelic|mixpanel|amplitude|segment|posthog|hotjar|appsflyer|adjust|branch-|onesignal|admob|adsense|gtag|google-ads|facebook|crashlytics/i;
  expect(names.filter((name) => tracking.test(name))).toEqual([]);
});
