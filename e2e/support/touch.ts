/**
 * A finger on the touch screen, pressing and dragging. Needs a touch screen:
 * `test.use({ hasTouch: true })`.
 */
import type { CDPSession, Locator, Page } from '@playwright/test';
import { expect } from './fixtures.ts';

export interface Point {
  x: number;
  y: number;
}

/** A finger put down on the screen; `lift` takes it off. */
export interface Finger {
  /** Moves the finger to `to` in small steps, as a scroll does. */
  move(to: Point): Promise<void>;
  lift(): Promise<void>;
}

/** The centre of `locator` on the screen. */
export async function centreOf(locator: Locator): Promise<Point> {
  const box = await locator.boundingBox();
  expect(box, 'on the screen').not.toBeNull();
  return { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
}

/** Puts a finger down at `at` (a point, or the centre of an element). */
export async function fingerDown(page: Page, at: Point | Locator): Promise<Finger> {
  let point = 'x' in at ? at : await centreOf(at);
  const cdp: CDPSession = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [point] });
  return {
    async move(to) {
      const steps = 12;
      const from = point;
      for (let step = 1; step <= steps; step++) {
        point = {
          x: from.x + ((to.x - from.x) * step) / steps,
          y: from.y + ((to.y - from.y) * step) / steps,
        };
        await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [point] });
        await page.waitForTimeout(16);
      }
    },
    async lift() {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      await cdp.detach();
    },
  };
}

/** Presses `at` for `ms` milliseconds without moving, then lifts the finger. */
export async function hold(page: Page, at: Point | Locator, ms = 800): Promise<void> {
  const finger = await fingerDown(page, at);
  await page.waitForTimeout(ms);
  await finger.lift();
}
