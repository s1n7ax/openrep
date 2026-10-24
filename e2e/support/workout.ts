/**
 * Driving the workout screen: its pages, touch swipes, and the picture on
 * top of a page. Swiping needs a touch screen: `test.use({ hasTouch: true })`.
 */
import type { Locator, Page } from '@playwright/test';
import { expect } from './fixtures.ts';
import { fingerDown, type Point } from './touch.ts';

/** Chromium starts scrolling only after the finger has moved this far. */
const TOUCH_SLOP = 16;

/** Software WebGL takes seconds to start a 3D view, holding up the page meanwhile. */
const PICTURE_START_TIMEOUT_MS = 60_000;

/**
 * Waits until the workout screen is shown and every 3D view on it has
 * started (rendered a frame). The screen starts the views of the page on the
 * screen and its neighbours when it opens and after every page change.
 */
export async function waitForPictures(page: Page): Promise<void> {
  await page.waitForFunction(
    () => {
      const pages = document.querySelector('[data-testid="workout-pages"]');
      return (
        pages !== null &&
        Array.from(pages.querySelectorAll('[data-testid="exercise-viewer"]')).every(
          (viewer) => Number(viewer.getAttribute('data-frame')) > 0,
        )
      );
    },
    undefined,
    { timeout: PICTURE_START_TIMEOUT_MS },
  );
}

/** The page of the block at `index`; `workoutPage(page, blocks)` is the finish page. */
export function workoutPage(page: Page, index: number): Locator {
  return page.locator(
    `[data-testid="workout-page"][data-page="${index}"], [data-testid="workout-final"][data-page="${index}"]`,
  );
}

/**
 * A finger moved from `from` to `to`, then held still before it is lifted:
 * the scroll stops where the finger stops (no fling).
 */
export async function swipe(page: Page, from: Point, to: Point): Promise<void> {
  const finger = await fingerDown(page, from);
  await finger.move(to);
  await page.waitForTimeout(100);
  await finger.lift();
}

/**
 * Scrolls the workout by `fraction` of the screen height with a swipe along
 * its left edge: positive towards the next page, negative towards the
 * previous one.
 */
export async function scrollWorkout(page: Page, fraction: number): Promise<void> {
  const { width, height } = page.viewportSize()!;
  const distance = Math.abs(fraction) * height + TOUCH_SLOP;
  const x = Math.round(width * 0.06);
  const [from, to] =
    fraction > 0
      ? [height * 0.9, height * 0.9 - distance]
      : [height * 0.15, height * 0.15 + distance];
  await swipe(page, { x, y: from }, { x, y: to });
}

/** Waits until the pager rests on page `index` and it fills the screen (all of it, or of a tall one, part). */
export async function expectOnPage(page: Page, index: number): Promise<void> {
  await expect(page.getByTestId('workout')).toHaveAttribute('data-page', String(index));
  await waitForPictures(page);
  await expect
    .poll(() =>
      workoutPage(page, index).evaluate((element) => {
        const screen = element.parentElement!.getBoundingClientRect();
        const box = element.getBoundingClientRect();
        return box.top <= screen.top + 0.5 && box.bottom >= screen.bottom - 0.5;
      }),
    )
    .toBe(true);
}

/** Checks that page `index` is off the screen (but for a fraction of a pixel, as pages are not whole pixels tall). */
export async function expectOffScreen(page: Page, index: number): Promise<void> {
  await expect(workoutPage(page, index)).not.toBeInViewport({ ratio: 0.002 });
}

/** Swipes the picture of `workoutPage` one slide to the left (to the next slide). */
export async function swipePicture(pageLocator: Locator): Promise<void> {
  const box = await pageLocator.getByTestId('workout-picture').boundingBox();
  expect(box, 'the picture is on the screen').not.toBeNull();
  const { x, y, width, height } = box!;
  const middle = y + height / 2;
  await swipe(pageLocator.page(), { x: x + width - 20, y: middle }, { x: x + 20, y: middle + 2 });
}
