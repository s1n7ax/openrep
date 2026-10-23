/**
 * Verification "Offline": with the network off after the first launch, plans,
 * exercise pages (3D and photos) and logging a workout all work.
 *
 * The installed app reads its own files from the device, so they are served
 * from the build output here; `context.setOffline(true)` then cuts every
 * network request, as with no connection on a phone.
 */
import { openApp, serveAppFromDisk } from './support/app.ts';
import { expect, test } from './support/fixtures.ts';
import { copySchedule, startDay } from './support/plans.ts';
import { viewer, waitForFrameAfter } from './support/viewer.ts';

test(
  'plans, exercise pages, 3D and logging work offline',
  { tag: '@smoke' },
  async ({ page, context }) => {
    test.setTimeout(120_000);
    await serveAppFromDisk(context);
    await openApp(page);

    await context.setOffline(true);
    expect(await page.evaluate(() => navigator.onLine)).toBe(false);

    // A plan.
    await copySchedule(page, 'beginner-full-body');
    await expect(page.getByTestId('plan-exercise-name').first()).toHaveText('Goblet Squat');

    // An exercise page: the 3D view renders and the photos load.
    await page.getByTestId('plan-exercise').first().locator('a').click();
    await expect(page.getByTestId('exercise-name')).toHaveText('Goblet Squat');
    await expect(viewer(page)).toHaveAttribute('data-animated', 'true');
    // It keeps rendering: the movement plays.
    await waitForFrameAfter(page, await waitForFrameAfter(page, 0));
    const photos = page.getByTestId('exercise-photos').locator('img');
    await expect(photos).toHaveCount(2);
    for (const photo of await photos.all()) {
      await photo.scrollIntoViewIfNeeded();
      await expect
        .poll(() =>
          photo.evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth),
        )
        .toBeGreaterThan(0);
    }

    // Log a workout and finish it.
    await page.goBack();
    await startDay(page, 0);
    const set = page.getByTestId('workout-exercise').first().getByTestId('set-row').first();
    await set.getByTestId('set-weight').fill('20');
    await set.getByTestId('set-reps').fill('12');
    await set.getByTestId('set-done').check();
    await page.getByTestId('workout-finish').click();
    await expect(page.getByTestId('history-set').first()).toContainText('20 kg × 12');
    await page.getByTestId('tab-history').click();
    await expect(page.getByTestId('history-row')).toHaveCount(1);

    // A catalog update just reports being offline.
    await page.getByTestId('tab-settings').click();
    await page.getByTestId('catalog-update').click();
    await expect(page.getByTestId('catalog-update-result')).toHaveText(
      'Offline – using the saved catalog.',
    );
  },
);
