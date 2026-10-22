/**
 * `TextFiles` on `@capacitor/filesystem`, in the app's private data directory
 * (`Directory.Data`). On the web the plugin stores files in IndexedDB.
 */
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import type { TextFiles } from './files.ts';

export const capacitorFiles: TextFiles = {
  async list(dir) {
    try {
      const { files } = await Filesystem.readdir({ path: dir, directory: Directory.Data });
      return files.filter((file) => file.type === 'file').map((file) => file.name);
    } catch {
      // The plugin rejects when the directory does not exist (first launch).
      return [];
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
