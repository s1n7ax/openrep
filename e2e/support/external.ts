/**
 * Recording where the app sends the user: in a browser, `openExternal` calls
 * `window.open` itself, so replacing it keeps the tab from opening.
 */
import type { Page } from '@playwright/test';
import { expect } from './fixtures.ts';

/** Replaces `window.open` with a recorder before the app loads. */
export async function recordOpenedWindows(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const opened: string[] = [];
    Object.assign(window, { openedUrls: opened });
    window.open = (url?: string | URL) => {
      opened.push(String(url));
      // As a browser does when the tab opens: the app treats null as blocked.
      return { closed: false } as Window;
    };
  });
}

/** The URLs the app opened, in order. */
export function openedUrls(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { openedUrls: string[] }).openedUrls);
}

/** The single URL the app opened. */
export async function openedUrl(page: Page): Promise<URL> {
  await expect.poll(() => openedUrls(page)).toHaveLength(1);
  const [url] = await openedUrls(page);
  return new URL(url!);
}
