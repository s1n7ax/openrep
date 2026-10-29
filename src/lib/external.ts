/**
 * Leaving the app: opening web pages in the browser and copying text. Both
 * work the same on the web (a new tab, the Clipboard API) and on iOS and
 * Android (the system browser, the system clipboard).
 */
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { Clipboard } from '@capacitor/clipboard';

/**
 * Opens `url` in the browser. Rejects when no browser can be opened.
 *
 * In a browser this opens the tab directly: the plugin's web implementation
 * is a dynamically imported chunk, which an offline tap could not fetch.
 */
export async function openExternal(url: string): Promise<void> {
  if (Capacitor.isNativePlatform()) {
    await Browser.open({ url });
    return;
  }
  if (window.open(url, '_blank') === null) {
    throw new Error('The browser could not be opened.');
  }
}

/** YouTube search results for `query`, e.g. an exercise's name. */
export function youTubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query.trim())}`;
}

/** Copies text to the clipboard; resolves to whether it worked. */
export async function copyText(text: string): Promise<boolean> {
  try {
    await Clipboard.write({ string: text });
    return true;
  } catch (error) {
    console.error('Copying to the clipboard failed:', error);
    return false;
  }
}
