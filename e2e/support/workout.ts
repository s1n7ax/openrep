/**
 * Driving the workout screen: its pages, touch swipes, the picture on top of
 * a page, its sets (circles, the weight row and the ⋯ options) and its
 * celebrations. Swiping needs a touch screen: `test.use({ hasTouch: true })`.
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

/**
 * Waits until the pager rests on page `index` and it fills the screen (all of
 * it, or of a tall one, part). Coming to rest there starts the 3D views next
 * to it, which can hold up the page before this sees the new page.
 */
export async function expectOnPage(page: Page, index: number): Promise<void> {
  await expect(page.getByTestId('workout')).toHaveAttribute('data-page', String(index), {
    timeout: PICTURE_START_TIMEOUT_MS,
  });
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

/**
 * The circle of the set at `index` among the sets in `scope`: an exercise's
 * page (or part of it), or one exercise's line of a superset.
 */
export function setCircle(scope: Locator, index: number): Locator {
  return scope.getByTestId('set-circle').nth(index);
}

/** Expects the set at `index` in `scope` to show `weight` under its circle ("60 kg", "—") and `amount` in it. */
export async function expectSet(
  scope: Locator,
  index: number,
  weight: string,
  amount: string,
): Promise<void> {
  await expect(scope.getByTestId('set-weight-caption').nth(index)).toHaveText(weight);
  await expect(setCircle(scope, index).getByTestId('set-amount')).toHaveText(amount);
}

/** Ticks off the set at `index` in `scope` by tapping its circle, or un-ticks it (`done` false). */
export async function tickSet(scope: Locator, index: number, done = true): Promise<void> {
  const circle = setCircle(scope, index);
  await expect(circle).toHaveAttribute('aria-pressed', String(!done));
  await circle.click();
  await expect(circle).toHaveAttribute('aria-pressed', String(done));
}

/**
 * Types `weight` for the set at `index` in `scope`: taps the weight under its
 * circle to select it, then types in the weight row of `block` (the
 * exercise or superset holding `scope`; `scope` itself by default).
 */
export async function typeWeight(
  scope: Locator,
  index: number,
  weight: string,
  block: Locator = scope,
): Promise<void> {
  const caption = scope.getByTestId('set-weight-caption').nth(index);
  await caption.click();
  await expect(block.getByTestId('weight-row')).toHaveAttribute(
    'data-set-id',
    (await caption.getAttribute('data-set-id'))!,
  );
  await block.getByTestId('set-weight').fill(weight);
}

/** Opens the ⋯ options of the exercise or superset `block` and taps `item` (its test id: "set-add", "round-remove-last", …). */
export async function pickOption(block: Locator, item: string): Promise<void> {
  await block.getByTestId('block-options').click();
  const menu = block.page().getByTestId('set-options');
  await expect(menu).toBeVisible();
  await menu.getByTestId(item).click();
}

/**
 * Opens the history of the exercise or superset `block` (⋯ → History) and
 * returns its sheet.
 */
export async function openHistory(block: Locator): Promise<Locator> {
  await pickOption(block, 'show-history');
  const sheet = block.page().getByTestId('history-sheet');
  await expect(sheet).toBeVisible();
  return sheet;
}

/** Closes the history sheet `sheet`. */
export async function closeHistory(sheet: Locator): Promise<void> {
  await sheet.getByTestId('history-close').click();
  await expect(sheet).not.toBeVisible();
}

/**
 * Stops the CSS animations of `page` (a celebration lasts until they go on)
 * and returns a function that lets them go on.
 */
export async function pauseAnimations(page: Page): Promise<() => Promise<void>> {
  const devtools = await page.context().newCDPSession(page);
  await devtools.send('Animation.enable');
  await devtools.send('Animation.setPlaybackRate', { playbackRate: 0 });
  return async () => {
    await devtools.send('Animation.setPlaybackRate', { playbackRate: 1 });
    await devtools.detach();
  };
}

/** The reps or seconds fields of the "Change reps" sheet: each set of the exercise, or each round of A1, then of A2, … */
export function amountFields(page: Page): Locator {
  return page
    .getByTestId('amounts-sheet')
    .locator('[data-testid="set-reps"], [data-testid="set-duration"]');
}

/**
 * Types reps or seconds in the "Change reps" sheet of the exercise or
 * superset `block`: `amounts` maps positions in `amountFields` to values.
 */
export async function changeAmounts(
  block: Locator,
  amounts: Record<number, string>,
): Promise<void> {
  const page = block.page();
  await pickOption(block, 'change-amounts');
  const sheet = page.getByTestId('amounts-sheet');
  await expect(sheet).toBeVisible();
  for (const [index, value] of Object.entries(amounts)) {
    await amountFields(page).nth(Number(index)).fill(value);
  }
  await sheet.getByTestId('amounts-done').click();
  await expect(sheet).not.toBeVisible();
}
