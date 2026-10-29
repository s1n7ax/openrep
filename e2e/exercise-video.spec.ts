/**
 * Verification "Exercise video": the exercise page, the custom exercise page
 * and the exercise list preview show a YouTube icon over the preview; it
 * opens YouTube search results for the exercise's name in the browser
 * (recorded here instead of opened), offline too. The app embeds no player.
 */
import type { Locator, Page } from '@playwright/test';
import { openApp } from './support/app.ts';
import { expect, test } from './support/fixtures.ts';
import { hold } from './support/touch.ts';

test.use({ hasTouch: true });

const CURL = { id: 'dumbbell-bicep-curl', name: 'Dumbbell Bicep Curl' };
const CUSTOM = 'Landmine Press';

test.beforeEach(async ({ page }) => {
  // On the web, @capacitor/browser opens pages with window.open: record them instead.
  await page.addInitScript(() => {
    const opened: string[] = [];
    Object.assign(window, { openedUrls: opened });
    window.open = (url?: string | URL) => {
      opened.push(String(url));
      return null;
    };
  });
});

/** The single URL the app opened. */
async function openedUrl(page: Page): Promise<URL> {
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { openedUrls: string[] }).openedUrls))
    .toHaveLength(1);
  const [url] = await page.evaluate(
    () => (window as unknown as { openedUrls: string[] }).openedUrls,
  );
  return new URL(url!);
}

function expectYouTubeSearch(url: URL, name: string): void {
  expect(`${url.origin}${url.pathname}`).toBe('https://www.youtube.com/results');
  expect(url.searchParams.get('search_query')).toBe(name);
}

/** The button sits over `area`, clear of its 0.5 rem inset. */
async function expectOverlayBottomRight(area: Locator, button: Locator): Promise<void> {
  const [box, control] = [await area.boundingBox(), await button.boundingBox()];
  expect(box, 'the preview on the screen').not.toBeNull();
  expect(control, 'the video button on the screen').not.toBeNull();
  expect(box!.x + box!.width - (control!.x + control!.width)).toBeLessThan(24);
  expect(box!.y + box!.height - (control!.y + control!.height)).toBeLessThan(24);
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
  await page.context().setOffline(true);
  await page.getByTestId('exercise-video').click();

  expectYouTubeSearch(await openedUrl(page), CURL.name);
  await page.context().setOffline(false);
});
