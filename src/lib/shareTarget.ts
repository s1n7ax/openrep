/**
 * Text shared to OpenRep from another app with Android's share sheet, such as
 * an AI assistant's reply holding a plan. The app's own native plugin
 * (`android/app/src/main/java/io/github/s1n7ax/openrep/ShareTargetPlugin.java`)
 * reads the share, whether it launched the app or reached it while open, and
 * hands it over as a `shared` event. Other platforms receive no shares.
 */
import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/** One share: the shared text, or the content of the shared text or JSON file; null when it could not be read. */
export interface Share {
  text: string | null;
}

interface ShareTargetPlugin {
  addListener(event: 'shared', listener: (share: Share) => void): Promise<PluginListenerHandle>;
}

const ShareTarget = registerPlugin<ShareTargetPlugin>('ShareTarget');

/**
 * Calls `onShare` for every share, including the one that launched the app,
 * with null for a share that could not be read.
 * Returns a function that stops listening.
 */
export function listenForShares(onShare: (text: string | null) => void): () => void {
  if (Capacitor.getPlatform() !== 'android') return () => {};
  const handle = ShareTarget.addListener('shared', (share) => onShare(share.text));
  return () => {
    handle
      .then((listener) => listener.remove())
      .catch((error: unknown) => console.error('Could not stop listening for shares:', error));
  };
}
