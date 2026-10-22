/**
 * `TextFiles` on `@capacitor/filesystem`, in the app's private data directory
 * (`Directory.Data`). On the web the plugin stores files in IndexedDB.
 */
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import type { TextFiles } from './files.ts';

/**
 * Whether `dir` does not exist: it is missing from its parent's listing, or
 * its parent does not exist. Rejects when that cannot be told.
 */
async function isMissing(dir: string): Promise<boolean> {
  if (dir === '') return false;
  const slash = dir.lastIndexOf('/');
  const parent = slash === -1 ? '' : dir.slice(0, slash);
  let entries;
  try {
    ({ files: entries } = await Filesystem.readdir({ path: parent, directory: Directory.Data }));
  } catch (error) {
    if (await isMissing(parent)) return true;
    throw error;
  }
  const name = dir.slice(slash + 1);
  return !entries.some((entry) => entry.name === name);
}

export const capacitorFiles: TextFiles = {
  async list(dir) {
    try {
      const { files } = await Filesystem.readdir({ path: dir, directory: Directory.Data });
      return files.filter((file) => file.type === 'file').map((file) => file.name);
    } catch (error) {
      // The plugin rejects both when the directory does not exist (first
      // launch) and on real read errors, with codes that differ by platform.
      // Only a directory its parent does not list is empty: any other failure
      // must not look like "nothing saved", or the next save would replace
      // the saved data.
      if (await isMissing(dir)) return [];
      console.error(`Could not list "${dir}":`, error);
      throw error;
    }
  },

  async read(path) {
    const { data } = await Filesystem.readFile({
      path,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
    });
    // With an encoding the plugin returns a string; a Blob is only returned without one.
    return typeof data === 'string' ? data : await data.text();
  },

  async write(path, text) {
    await Filesystem.writeFile({
      path,
      data: text,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      recursive: true,
    });
  },

  async remove(path) {
    await Filesystem.deleteFile({ path, directory: Directory.Data });
  },

  async rename(from, to) {
    await Filesystem.rename({
      from,
      to,
      directory: Directory.Data,
      toDirectory: Directory.Data,
    });
  },
};
