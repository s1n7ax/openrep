/**
 * Verification "Exercise video": the exercise page, the custom exercise page
 * and the exercise list preview show a YouTube icon over the preview; it
 * opens YouTube search results for the exercise's name in the browser
 * (recorded here instead of opened), offline too. The app embeds no player.
 */
import type { Locator, Page } from '@playwright/test';
import { openApp } from './support/app.ts';
import { openedUrl, openedUrls, recordOpenedWindows } from './support/external.ts';
import { expect, test } from './support/fixtures.ts';
import { hold } from './support/touch.ts';
import { waitForFrameAfter } from './support/viewer.ts';

test.use({ hasTouch: true });

const CURL = { id: 'dumbbell-bicep-curl', name: 'Dumbbell Bicep Curl' };
const CUSTOM = 'Landmine Press';

test.beforeEach(async ({ page }) => {
  await recordOpenedWindows(page);
});

function expectYouTubeSearch(url: URL, name: string): void {
  expect(`${url.origin}${url.pathname}`).toBe('https://www.youtube.com/results');
  expect(url.searchParams.get('search_query')).toBe(name);
}

/** The button sits inside `area`, inset from its bottom-right corner. */
async function expectOverlayBottomRight(area: Locator, button: Locator): Promise<void> {
  const [box, control] = [await area.boundingBox(), await button.boundingBox()];
  expect(box, 'the preview on the screen').not.toBeNull();
  expect(control, 'the video button on the screen').not.toBeNull();
  const [right, bottom] = [
    box!.x + box!.width - (control!.x + control!.width),
    box!.y + box!.height - (control!.y + control!.height),
  ];
  // Inside the overflow-hidden stage (not clipped away), near its corner.
  expect(right).toBeGreaterThanOrEqual(0);
  expect(right).toBeLessThan(24);
  expect(bottom).toBeGreaterThanOrEqual(0);
  expect(bottom).toBeLessThan(24);
}

/** Creates a custom exercise from the Exercises tab; ends on its page. */
async function createCustom(page: Page, withMuscles: boolean): Promise<void> {
  await page.getByTestId('tab-exercises').click();
  await page.getByTestId('new-custom-exercise').click();
  await page.getByTestId('custom-name').fill(CUSTOM);
  if (withMuscles) await page.getByTestId('custom-primary-shoulders').click();
  await page.getByTestId('custom-save').click();
  await expect(page.getByTestId('custom-title')).toHaveText(CUSTOM);
}

test('the exercise page opens YouTube search for the exercise', async ({ page }) => {
  await openApp(page, `#/exercises/${CURL.id}`);

  const viewer = page.getByTestId('exercise-viewer');
  const video = page.getByTestId('exercise-video');
  await expect(video).toBeVisible();
  await expectOverlayBottomRight(viewer.locator('.stage'), video);
  // The app embeds no player: the video lives on YouTube.
  await expect(page.locator('iframe')).toHaveCount(0);

  await video.click();
  expectYouTubeSearch(await openedUrl(page), CURL.name);
});

test('the exercise list preview opens YouTube search for the exercise', async ({ page }) => {
  await openApp(page, '#/exercises');
  await page.getByTestId('exercise-search').fill('dumbbell bicep curl');
  await hold(page, page.locator(`[data-testid="exercise-row"][data-exercise-id="${CURL.id}"]`));

  const preview = page.getByTestId('exercise-preview');
  const video = preview.getByTestId('exercise-video');
  await expect(video).toBeVisible();
  await expectOverlayBottomRight(preview.getByTestId('preview-photos'), video);

  await video.click();
  expectYouTubeSearch(await openedUrl(page), CURL.name);
});

test('a custom exercise opens YouTube search for its name', async ({ page }) => {
  await openApp(page);
  await createCustom(page, true);

  const video = page.getByTestId('exercise-video');
  await expect(video).toBeVisible();
  await video.click();
  expectYouTubeSearch(await openedUrl(page), CUSTOM);
});

test('a custom exercise without a 3D view still offers the video', async ({ page }) => {
  await openApp(page);
  await createCustom(page, false);
  await expect(page.locator('.no-muscles')).toBeVisible();

  const video = page.getByTestId('exercise-video');
  await expect(video).toBeVisible();
  await video.click();
  expectYouTubeSearch(await openedUrl(page), CUSTOM);
});

test('offline, the video still opens YouTube and lets the browser say so', async ({ page }) => {
  await openApp(page, `#/exercises/${CURL.id}`);
  // Let the 3D view load its figure first: only the video must work offline.
  await waitForFrameAfter(page, 0);
  await page.context().setOffline(true);
  await page.getByTestId('exercise-video').click();

  expectYouTubeSearch(await openedUrl(page), CURL.name);
});

test('a browser that blocks the tab says the video could not be opened', async ({ page }) => {
  // A blocked pop-up, as a browser reports it.
  await page.addInitScript(() => {
    window.open = () => null;
    // The failure is handled and shown; the console line is not the test's subject.
    console.error = () => {};
  });
  await openApp(page, `#/exercises/${CURL.id}`);

  await page.getByTestId('exercise-video').click();
  await expect(page.getByTestId('exercise-video-error')).toHaveText('YouTube could not be opened.');
  expect(await openedUrls(page)).toEqual([]);
});
