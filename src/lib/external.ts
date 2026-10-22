/**
 * Leaving the app: opening web pages in the browser and copying text. Both
 * work the same on the web (a new tab, the Clipboard API) and on iOS and
 * Android (the system browser, the system clipboard).
 */
import { Browser } from '@capacitor/browser';
import { Clipboard } from '@capacitor/clipboard';

/** Opens `url` in the browser. Rejects when no browser can be opened. */
export async function openExternal(url: string): Promise<void> {
  await Browser.open({ url });
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
