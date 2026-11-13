/**
 * Recording where the app sends the user: in a browser, `openExternal` calls
 * `window.open` itself, so replacing it keeps the tab from opening; and
 * `shareText` calls `navigator.share`, which headless Chromium on Linux does
 * not have, so a stand-in share sheet records what it is handed.
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

/** How the stand-in share sheet ends: an app is picked, it is dismissed, or it cannot open. */
export type ShareOutcome = 'shared' | 'cancelled' | 'failed';

/**
 * Gives the page a share sheet before the app loads (as phones and some
 * browsers have) that records the text it is handed and ends as `outcome`,
 * or as {@link endSharesAs} says later.
 */
export async function recordShares(page: Page, outcome: ShareOutcome = 'shared'): Promise<void> {
  await page.addInitScript((initial) => {
    const shared: string[] = [];
    const state = { sharedTexts: shared, shareOutcome: initial };
    Object.assign(window, state);
    navigator.share = async (data?: ShareData) => {
      shared.push(String(data?.text));
      const { shareOutcome } = window as unknown as typeof state;
      // As a browser reports a dismissed sheet, and one it refuses to show.
      if (shareOutcome === 'cancelled') throw new DOMException('Share canceled', 'AbortError');
      if (shareOutcome === 'failed') throw new DOMException('Permission denied', 'NotAllowedError');
    };
  }, outcome);
}

/** Makes the stand-in share sheet end as `outcome` from now on. */
export async function endSharesAs(page: Page, outcome: ShareOutcome): Promise<void> {
  await page.evaluate((next) => Object.assign(window, { shareOutcome: next }), outcome);
}

/** The texts the stand-in share sheet was handed, in order. */
export function sharedTexts(page: Page): Promise<string[]> {
  return page.evaluate(() => (window as unknown as { sharedTexts: string[] }).sharedTexts);
}
