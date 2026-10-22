import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyUserData } from '../schema/userData.ts';

/** File system error raised by the mocked plugin. */
class MockFilesystemError extends Error {
  override name = 'MockFilesystemError';
}

// `@capacitor/filesystem` mocked with an in-memory store, so the adapter and
// the load / save logic above it are tested against the plugin's API.
const store = vi.hoisted(() => new Map<string, string>());
vi.mock('@capacitor/filesystem', () => {
  const missing = (path: string) => new MockFilesystemError(`File does not exist: ${path}`);
  return {
    Directory: { Data: 'DATA' },
    Encoding: { UTF8: 'utf8' },
    Filesystem: {
      readdir: vi.fn(async ({ path }: { path: string }) => {
        const prefix = `${path}/`;
        const names = [...store.keys()].filter((key) => key.startsWith(prefix));
        if (names.length === 0) throw missing(path);
        return { files: names.map((key) => ({ name: key.slice(prefix.length), type: 'file' })) };
      }),
      readFile: vi.fn(async ({ path }: { path: string }) => {
        const data = store.get(path);
        if (data === undefined) throw missing(path);
        return { data: new Blob([data]) };
      }),
      writeFile: vi.fn(async ({ path, data }: { path: string; data: string }) => {
        store.set(path, data);
        return { uri: path };
      }),
      deleteFile: vi.fn(async ({ path }: { path: string }) => {
        if (!store.delete(path)) throw missing(path);
      }),
      rename: vi.fn(async ({ from, to }: { from: string; to: string }) => {
        const data = store.get(from);
        if (data === undefined) throw missing(from);
        store.delete(from);
        store.set(to, data);
      }),
    },
  };
});

const { Filesystem } = await import('@capacitor/filesystem');
const { capacitorFiles } = await import('./capacitorFiles.ts');
const { loadUserDataFile, saveUserDataFile } = await import('./userDataFile.ts');

const NOW = new Date('2026-03-04T05:06:07.089Z');

describe('capacitorFiles', () => {
  beforeEach(() => {
    store.clear();
    vi.clearAllMocks();
  });

  it('lists nothing when the directory does not exist', async () => {
    expect(await capacitorFiles.list('openrep')).toEqual([]);
  });

  it('writes UTF-8 into the data directory, creating parents, and reads Blobs back as text', async () => {
    await capacitorFiles.write('openrep/a.json', 'héllo');
    expect(Filesystem.writeFile).toHaveBeenCalledWith({
      path: 'openrep/a.json',
      data: 'héllo',
      directory: 'DATA',
      encoding: 'utf8',
      recursive: true,
    });
    expect(await capacitorFiles.read('openrep/a.json')).toBe('héllo');
    expect(await capacitorFiles.list('openrep')).toEqual(['a.json']);
  });

  it('saves and loads user data through the plugin', async () => {
    const data = { ...emptyUserData(), settings: { unit: 'lb' as const } };
    await saveUserDataFile(capacitorFiles, data);
    await saveUserDataFile(capacitorFiles, data);
    expect([...store.keys()]).toEqual(['openrep/userdata.json']);
    expect(await loadUserDataFile(capacitorFiles, NOW)).toEqual({ data, corruptFile: null });
  });

  it('keeps a corrupt file and starts empty', async () => {
    store.set('openrep/userdata.json', '{ broken');
    const loaded = await loadUserDataFile(capacitorFiles, NOW);
    expect(loaded.data).toEqual(emptyUserData());
    expect(loaded.corruptFile).toBe('userdata.corrupt-2026-03-04T05-06-07-089Z.json');
    expect(store.get(`openrep/${loaded.corruptFile}`)).toBe('{ broken');
  });
});
