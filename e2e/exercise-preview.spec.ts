/**
 * Verification "Exercise list preview": the exercise lists (the Exercises
 * tab and the plan editor's picker) show 72 px thumbnails; holding a row
 * previews its exercise (the 3D animation, its photos taking turns, or the
 * still figure with its muscles) until the preview is closed, which leaves
 * the list as it was; the preview adds or opens the exercise like a tap,
 * and a tap still does.
 */
import type { Locator, Page } from '@playwright/test';
import { SCROLL_SETTLE_MS } from '../src/lib/hold.ts';
import { androidBack, asAndroid } from './support/android.ts';
import { openApp, readStoredUserData } from './support/app.ts';
import { expect, test } from './support/fixtures.ts';
import { createPlan } from './support/plans.ts';
import { centreOf, fingerDown, hold } from './support/touch.ts';
import { waitForFrameAfter } from './support/viewer.ts';

test.use({ hasTouch: true });

const CURL = { id: 'dumbbell-bicep-curl', name: 'Dumbbell Bicep Curl' };
const GOBLET = { id: 'goblet-squat', name: 'Goblet Squat' };
const HALO = { id: 'kettlebell-halo', name: 'Kettlebell Halo' };
/** The custom exercise of `createCustom`: searching "landmine" finds it, two catalog rows and "Create custom". */
const CUSTOM = 'Landmine Press';

function preview(page: Page): Locator {
  return page.getByTestId('exercise-preview');
}

function exerciseRow(page: Page, id: string): Locator {
  return page.locator(`[data-testid="exercise-row"][data-exercise-id="${id}"]`);
}

/** Creates the custom exercise CUSTOM (shoulders) from the Exercises tab; ends on its page. */
async function createCustom(page: Page): Promise<void> {
  await page.getByTestId('tab-exercises').click();
  await page.getByTestId('new-custom-exercise').click();
  await page.getByTestId('custom-name').fill(CUSTOM);
  await page.getByTestId('custom-primary-shoulders').click();
  await page.getByTestId('custom-save').click();
  await expect(page.getByTestId('custom-title')).toHaveText(CUSTOM);
}

async function search(page: Page, query: string): Promise<void> {
  await page.getByTestId('exercise-search').fill(query);
}

/** Whether the page scrolls sideways. */
function scrollsSideways(page: Page): Promise<boolean> {
  return page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  );
}

/** Size of the thumbnail of every row of the list. */
function thumbnailSizes(page: Page): Promise<{ width: number; height: number }[]> {
  return page
    .locator(
      '[data-testid="custom-row"], [data-testid="exercise-row"], [data-testid="create-custom-from-query"]',
    )
    .locator('.thumb')
    .evaluateAll((thumbs) =>
      thumbs.map((thumb) => {
        const { width, height } = thumb.getBoundingClientRect();
        return { width, height };
      }),
    );
}

/** A catalog row in the middle of the screen, clear of the search and filters. */
async function visibleRow(page: Page): Promise<Locator> {
  for (const row of await page.getByTestId('exercise-row').all()) {
    const box = await row.boundingBox();
    if (box && box.y > 300 && box.y + box.height < 700) return row;
  }
  throw new Error('No row on the screen');
}

/**
 * Waits until the page has gone SCROLL_SETTLE_MS without scrolling: a press
 * any sooner stops the scroll instead of holding a row.
 */
async function scrollSettled(page: Page): Promise<void> {
  await page.evaluate(
    (settleMs) =>
      new Promise<void>((resolve) => {
        let timer = setTimeout(settled, settleMs);
        // Scroll events come with the next frame: one still to come restarts the wait.
        window.addEventListener('scroll', restart, { capture: true, passive: true });
        function restart() {
          clearTimeout(timer);
          timer = setTimeout(settled, settleMs);
        }
        function settled() {
          window.removeEventListener('scroll', restart, { capture: true });
          resolve();
        }
      }),
    SCROLL_SETTLE_MS,
  );
}

/**
 * Starts timing the next press: returns a reader of how long after the
 * finger went down the preview opened (in milliseconds, page time).
 */
async function timeToOpen(page: Page): Promise<() => Promise<number>> {
  await page.evaluate(() => {
    const timing = window as unknown as { pressedAt?: number; openedAfter?: number };
    window.addEventListener('pointerdown', (event) => (timing.pressedAt ??= event.timeStamp), true);
    const dialog = document.querySelector<HTMLDialogElement>('[data-testid="exercise-preview"]')!;
    new MutationObserver(() => {
      if (dialog.open) timing.openedAfter ??= performance.now() - (timing.pressedAt ?? 0);
    }).observe(dialog, { attributes: true, attributeFilter: ['open'] });
  });
  return () =>
    page.evaluate(() => (window as unknown as { openedAfter?: number }).openedAfter ?? NaN);
}

test('every row has a 72 px thumbnail in both lists, on a 360 px phone', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 });
  await openApp(page);
  await createCustom(page);

  await page.getByTestId('tab-exercises').click();
  await search(page, 'landmine');
  await expect(page.getByTestId('custom-row')).toHaveCount(1);
  await expect(page.getByTestId('exercise-row')).toHaveCount(2);
  await expect(page.getByTestId('create-custom-from-query')).toBeVisible();
  expect(await thumbnailSizes(page)).toEqual(Array(4).fill({ width: 72, height: 72 }));
  expect(await scrollsSideways(page)).toBe(false);

  await createPlan(page, 'Thumbnails');
  await page.getByTestId('add-exercise').click();
  await search(page, 'landmine');
  await expect(page.getByTestId('create-custom-from-query')).toBeVisible();
  expect(await thumbnailSizes(page)).toEqual(Array(4).fill({ width: 72, height: 72 }));
  expect(await scrollsSideways(page)).toBe(false);

  // The preview fits too.
  await hold(page, page.getByTestId('custom-row'));
  await expect(preview(page)).toBeVisible();
  expect(await scrollsSideways(page)).toBe(false);
});

test('holding an animated exercise previews its 3D movement and stays open', async ({ page }) => {
  await openApp(page, '#/exercises');
  await search(page, 'goblet squat');

  const openedAfter = await timeToOpen(page);
  const finger = await fingerDown(page, exerciseRow(page, GOBLET.id));
  // Open while the finger is still down, half a second after it went down.
  await expect(preview(page)).toBeVisible();
  const elapsed = await openedAfter();
  expect(elapsed).toBeGreaterThanOrEqual(490);
  expect(elapsed).toBeLessThan(1000);
  // And after it is lifted.
  await finger.lift();
  await expect(preview(page)).toBeVisible();
  await expect(preview(page).getByRole('heading')).toHaveText(GOBLET.name);
  const viewer = preview(page).getByTestId('exercise-viewer');
  await expect(viewer).toHaveAttribute('data-animated', 'true');
  // It keeps rendering: the movement plays.
  await waitForFrameAfter(page, await waitForFrameAfter(page, 0));
  // The hold opened nothing.
  await expect(page).toHaveURL(/#\/exercises$/);

  await preview(page).getByTestId('preview-close').click();
  await expect(preview(page)).toBeHidden();
  await expect(page.getByTestId('exercise-viewer')).toHaveCount(0);
});

test(
  'holding an exercise without an animation shows its two photos in turn',
  { tag: '@smoke' },
  async ({ page }) => {
    await openApp(page, '#/exercises');
    await search(page, 'dumbbell bicep curl');
    await hold(page, exerciseRow(page, CURL.id));

    await expect(preview(page).getByRole('heading')).toHaveText(CURL.name);
    const photos = preview(page).getByTestId('preview-photos');
    const first = photos.getByRole('img', { name: `${CURL.name}, photo 1 of 2` });
    const second = photos.getByRole('img', { name: `${CURL.name}, photo 2 of 2` });
    await expect(photos).toHaveAttribute('data-shown', '0');
    await expect(first).toBeVisible();
    await expect(second).toBeHidden();
    await expect(photos).toHaveAttribute('data-shown', '1');
    await expect(second).toBeVisible();
    await expect(first).toBeHidden();
    await expect(photos).toHaveAttribute('data-shown', '0');
    for (const photo of [first, second]) {
      await expect
        .poll(() => photo.evaluate((image: HTMLImageElement) => image.naturalWidth))
        .toBeGreaterThan(0);
    }
    await expect(page).toHaveURL(/#\/exercises$/);
  },
);

test('a photo that cannot load says it is unavailable offline', async ({ page }) => {
  // Not an image: it fails to load, as an image not on the device does offline.
  await page.route(`**/catalog/images/${CURL.id}/**`, (route) =>
    route.fulfill({ status: 200, contentType: 'image/webp', body: 'offline' }),
  );
  await openApp(page, '#/exercises');
  await search(page, 'dumbbell bicep curl');
  await hold(page, exerciseRow(page, CURL.id));

  const photos = preview(page).getByTestId('preview-photos');
  await expect(photos.getByText('Photo unavailable offline')).toHaveCount(2);
  await expect(photos.getByText('Photo unavailable offline').first()).toBeVisible();
});

test('holding a custom exercise or one without photos shows the still figure with its muscles', async ({
  page,
}) => {
  await openApp(page);
  await createCustom(page);
  await page.getByTestId('tab-exercises').click();

  await search(page, 'landmine');
  await hold(page, page.getByTestId('custom-row'));
  await expect(preview(page).getByRole('heading')).toHaveText(CUSTOM);
  let viewer = preview(page).getByTestId('exercise-viewer');
  await expect(viewer).toHaveAttribute('data-animated', 'false');
  await expect(viewer).toHaveAttribute('data-primary', 'shoulders');
  await waitForFrameAfter(page, 0);
  await preview(page).getByTestId('preview-close').click();

  await search(page, 'kettlebell halo');
  await hold(page, exerciseRow(page, HALO.id));
  await expect(preview(page).getByRole('heading')).toHaveText(HALO.name);
  viewer = preview(page).getByTestId('exercise-viewer');
  await expect(viewer).toHaveAttribute('data-animated', 'false');
  await expect(viewer).toHaveAttribute('data-primary', 'shoulders');
  await expect(preview(page).getByTestId('preview-photos')).toHaveCount(0);
});

test('Add in the preview adds the exercise to the day; a tap still adds', async ({ page }) => {
  await openApp(page);
  await createCustom(page);
  await createPlan(page, 'Preview Plan');
  const added = page.getByTestId('edit-exercise-name');

  // Holding adds nothing; Add in the preview does, back in the editor.
  await page.getByTestId('add-exercise').click();
  await search(page, 'dumbbell bicep curl');
  await hold(page, exerciseRow(page, CURL.id));
  await expect(preview(page)).toBeVisible();
  await expect(page).toHaveURL(/\/add$/);
  await preview(page).getByTestId('preview-add').click();
  await expect(added).toHaveText([CURL.name]);

  // A custom exercise, too.
  await page.getByTestId('add-exercise').click();
  await search(page, 'landmine');
  await hold(page, page.getByTestId('custom-row'));
  await preview(page).getByTestId('preview-add').click();
  await expect(added).toHaveText([CURL.name, CUSTOM]);

  // A quick tap adds right away.
  await page.getByTestId('add-exercise').click();
  await search(page, 'goblet squat');
  await exerciseRow(page, GOBLET.id).tap();
  await expect(added).toHaveText([CURL.name, CUSTOM, GOBLET.name]);

  const stored = await readStoredUserData(page);
  expect(stored?.plans[0]?.days[0]?.exercises.map((entry) => entry.exercise)).toEqual([
    { kind: 'catalog', exerciseId: CURL.id, name: CURL.name },
    { kind: 'custom', customExerciseId: stored?.customExercises[0]?.id, name: CUSTOM },
    { kind: 'catalog', exerciseId: GOBLET.id, name: GOBLET.name },
  ]);
});

test('Open in the preview opens the exercise page; a tap still opens it', async ({ page }) => {
  await openApp(page);
  await createCustom(page);
  await page.getByTestId('tab-exercises').click();

  await search(page, 'landmine');
  await hold(page, page.getByTestId('custom-row'));
  await preview(page).getByTestId('preview-open').click();
  await expect(page.getByTestId('custom-title')).toHaveText(CUSTOM);
  await page.goBack();

  await search(page, 'dumbbell bicep curl');
  await hold(page, exerciseRow(page, CURL.id));
  await preview(page).getByTestId('preview-open').click();
  await expect(page).toHaveURL(new RegExp(`#/exercises/${CURL.id}$`));
  await expect(page.getByTestId('exercise-name')).toHaveText(CURL.name);
  await page.goBack();

  await exerciseRow(page, CURL.id).tap();
  await expect(page.getByTestId('exercise-name')).toHaveText(CURL.name);
});

test('scrolling the list with a finger never opens a preview', async ({ page }) => {
  await openApp(page, '#/exercises');
  const { x, y } = await centreOf(page.getByTestId('exercise-row').nth(4));

  // A scroll that comes to rest under the finger, held there.
  const finger = await fingerDown(page, { x, y });
  await finger.move({ x, y: y - 300 });
  await page.waitForTimeout(800);
  await finger.lift();
  const scrolled = await page.evaluate(() => window.scrollY);
  expect(scrolled).toBeGreaterThan(200);

  // A slow scroll (about 100 px a second), also held at the end.
  const slow = await fingerDown(page, { x, y });
  await slow.move({ x, y: y - 60 });
  await page.waitForTimeout(800);
  await slow.lift();
  expect(await page.evaluate(() => window.scrollY)).toBeGreaterThan(scrolled);

  await expect(preview(page)).toBeHidden();
  await expect(page).toHaveURL(/#\/exercises$/);
});

test('closing the preview leaves the list as it was', async ({ page }) => {
  await asAndroid(page);
  await openApp(page, '#/exercises');
  await search(page, 'press');
  await page.getByTestId('muscle-chip-shoulders').click();
  const count = await page.getByTestId('result-count').textContent();
  await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));
  const scrolled = await page.evaluate(() => window.scrollY);
  expect(scrolled).toBe(600);

  const closes: [string, () => Promise<void>][] = [
    ['Close', () => preview(page).getByTestId('preview-close').click()],
    [
      'a tap outside',
      async () => {
        // A drag on the backdrop scrolls nothing underneath; the tap closes.
        const finger = await fingerDown(page, { x: 200, y: 200 });
        await finger.move({ x: 200, y: 50 });
        await finger.lift();
        await page.touchscreen.tap(200, 60);
      },
    ],
    ['Escape', () => page.keyboard.press('Escape')],
    ['Android back', () => androidBack(page)],
  ];
  for (const [how, close] of closes) {
    await scrollSettled(page);
    await hold(page, await visibleRow(page));
    await expect(preview(page), how).toBeVisible();
    await close();
    await expect(preview(page), how).toBeHidden();
    await expect(page, how).toHaveURL(/#\/exercises$/);
    expect(await page.evaluate(() => window.scrollY), how).toBe(scrolled);
    await expect(page.getByTestId('exercise-search'), how).toHaveValue('press');
    await expect(page.getByTestId('muscle-chip-shoulders'), how).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await expect(page.getByTestId('result-count'), how).toHaveText(count!);
  }
});

test('holding brings up no menu or text selection of the phone', async ({ page }) => {
  await openApp(page, '#/exercises');
  await search(page, 'dumbbell bicep curl');
  const row = exerciseRow(page, CURL.id);
  // Menus the page let through.
  await page.evaluate(() => {
    const shown: string[] = [];
    (window as unknown as { menus: string[] }).menus = shown;
    window.addEventListener('contextmenu', (event) => {
      if (!event.defaultPrevented) shown.push((event.target as Element).tagName);
    });
  });

  const finger = await fingerDown(page, row);
  await expect(preview(page)).toBeVisible();
  // The long press as the platform reports it, on the row and on the preview's photo.
  for (const target of [row.locator('img'), preview(page).getByRole('img').first()]) {
    const prevented = await target.evaluate(
      (element) =>
        !element.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })),
    );
    expect(prevented).toBe(true);
  }
  await page.waitForTimeout(1200);
  await finger.lift();

  expect(await page.evaluate(() => (window as unknown as { menus: string[] }).menus)).toEqual([]);
  expect(await page.evaluate(() => window.getSelection()?.toString() ?? '')).toBe('');
  expect(await row.evaluate((element) => getComputedStyle(element).userSelect)).toBe('none');
  expect(await row.evaluate((element) => (element as HTMLAnchorElement).draggable)).toBe(false);
  expect(await row.locator('img').evaluate((image: HTMLImageElement) => image.draggable)).toBe(
    false,
  );
});
