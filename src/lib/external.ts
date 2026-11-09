/**
 * Leaving the app: opening web pages in the browser, YouTube in its own app
 * and copying text. They work the same on the web (a new tab, the Clipboard
 * API) and on iOS and Android (the system browser or app, the system
 * clipboard).
 */
import { AppLauncher } from '@capacitor/app-launcher';
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
  openTab(url);
}

function openTab(url: string): void {
  if (window.open(url, '_blank') === null) {
    throw new Error('The browser could not be opened.');
  }
}

/** YouTube search results for `query`, e.g. an exercise's name. */
export function youTubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query.trim())}`;
}

/** The same search in the YouTube app on iOS, which registers `youtube://`. */
export function youTubeAppSearchUrl(query: string): string {
  return `youtube://results?search_query=${encodeURIComponent(query.trim())}`;
}

/**
 * Opens YouTube search results for `query` outside the app: in the YouTube
 * app when it is installed, otherwise in the system browser (never in an
 * in-app browser sheet). Rejects when neither can be opened.
 *
 * Android hands the web link to the system, which opens it in the YouTube
 * app (it is the verified handler for youtube.com) or else the default
 * browser. iOS tries the YouTube app's own scheme first, as a plain open of
 * a web link may land in Safari, then the web link in Safari.
 */
export async function openYouTubeSearch(query: string): Promise<void> {
  const url = youTubeSearchUrl(query);
  if (!Capacitor.isNativePlatform()) {
    openTab(url);
    return;
  }
  if (Capacitor.getPlatform() === 'ios') {
    const { completed } = await AppLauncher.openUrl({ url: youTubeAppSearchUrl(query) });
    if (completed) return;
  }
  const { completed } = await AppLauncher.openUrl({ url });
  if (!completed) throw new Error('YouTube could not be opened.');
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
