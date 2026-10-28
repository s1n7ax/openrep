/**
 * Saving a generated file: on iOS and Android it is written to the app's
 * cache directory and handed to the share sheet (save to files, send to a
 * drive, …); in a browser it is downloaded.
 */
import { Capacitor } from '@capacitor/core';
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';

/** How saving a file ended: shared (native), downloaded (web) or cancelled from the share sheet. */
export type ExportOutcome = 'shared' | 'downloaded' | 'cancelled';

function download(name: string, text: string): void {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking right away can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

/** Whether the share sheet was dismissed (the plugins reject with "Share canceled"). */
function isShareCancel(error: unknown): boolean {
  return error instanceof Error && /cancel/i.test(error.message);
}

/**
 * Saves `text` as the file `name`: shares it on iOS and Android, downloads it
 * in a browser. Rejects when the file cannot be written or shared.
 */
export async function shareOrDownload(
  name: string,
  text: string,
  title: string,
): Promise<ExportOutcome> {
  if (!Capacitor.isNativePlatform()) {
    download(name, text);
    return 'downloaded';
  }
  const { uri } = await Filesystem.writeFile({
    path: name,
    data: text,
    directory: Directory.Cache,
    encoding: Encoding.UTF8,
  });
  try {
    await Share.share({ title, files: [uri], dialogTitle: title });
    return 'shared';
  } catch (error) {
    if (isShareCancel(error)) return 'cancelled';
    throw error;
  }
}
