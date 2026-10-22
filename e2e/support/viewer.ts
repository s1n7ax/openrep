/** Waiting on and capturing the 3D view (`[data-testid=exercise-viewer]`). */
import type { Page } from '@playwright/test';
import { decodePng, type Image } from './pixels.ts';

/** Software WebGL in headless Chromium renders only a few frames per second. */
const FRAME_TIMEOUT_MS = 60_000;
/** No new frame for this long means the view has stopped rendering. */
const IDLE_MS = 1_000;

/** The 3D view kept rendering when it should have come to rest. */
export class ViewerNotIdleError extends Error {
  override name = 'ViewerNotIdleError';
}

export function viewer(page: Page) {
  return page.getByTestId('exercise-viewer');
}

/** Frames the 3D view has rendered so far. */
export async function frameCount(page: Page): Promise<number> {
  return Number((await viewer(page).getAttribute('data-frame')) ?? 0);
}

/** Waits until the 3D view has rendered more than `previous` frames and the frame is on screen. */
export async function waitForFrameAfter(page: Page, previous: number): Promise<number> {
  const handle = await page.waitForFunction(
    (before) => {
      const count = Number(
        document.querySelector('[data-testid="exercise-viewer"]')?.getAttribute('data-frame') ?? 0,
      );
      return count > before ? count : false;
    },
    previous,
    { timeout: FRAME_TIMEOUT_MS },
  );
  const count = (await handle.jsonValue()) as number;
  // Let the compositor present the frame before it is captured.
  await page.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
  return count;
}

/**
 * Waits until the 3D view stops rendering (a frozen pose after the camera
 * settled: the orbit controls keep turning for a while after a drag).
 * Returns the frame count.
 *
 * @throws {ViewerNotIdleError} when it is still rendering after a minute.
 */
export async function waitForIdle(page: Page): Promise<number> {
  let count = await frameCount(page);
  let since = Date.now();
  const deadline = since + FRAME_TIMEOUT_MS;
  while (Date.now() - since < IDLE_MS) {
    if (Date.now() > deadline) {
      const message = `The 3D view is still rendering after ${FRAME_TIMEOUT_MS} ms (${count} frames)`;
      console.error(message);
      throw new ViewerNotIdleError(message);
    }
    await page.waitForTimeout(200);
    const next = await frameCount(page);
    if (next !== count) {
      count = next;
      since = Date.now();
    }
  }
  return count;
}

/**
 * Runs `action` (which makes the view render) and waits until the new frame
 * is rendered and the view is idle again.
 */
export async function afterRender(page: Page, action: () => Promise<void>): Promise<void> {
  const before = await frameCount(page);
  await action();
  await waitForFrameAfter(page, before);
  await waitForIdle(page);
}

/** A screenshot of the 3D canvas, decoded. */
export async function captureCanvas(page: Page): Promise<Image> {
  return decodePng(await viewer(page).locator('canvas').screenshot());
}
