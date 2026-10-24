import { beforeEach, describe, expect, it, vi } from 'vitest';
import { emptyUserData } from '../schema/userData.ts';

/** File system error raised by the mocked plugin. */
class MockFilesystemError extends Error {
  override name = 'MockFilesystemError';
}

// `@capacitor/filesystem` mocked with an in-memory store, so the adapter and
// the load / save logic above it are tested against the plugin's API.
const store = vi.hoisted(() => new Map<string, string>());
// Directories that exist while empty, like the `openrep` folder the iOS app
// creates at launch (AppDelegate.swift) to exclude it from backup.
const emptyDirs = vi.hoisted(() => new Set<string>());
vi.mock('@capacitor/filesystem', () => {
  const missing = (path: string) => new MockFilesystemError(`File does not exist: ${path}`);
  return {
    Directory: { Data: 'DATA' },
    Encoding: { UTF8: 'utf8' },
    Filesystem: {
      readdir: vi.fn(async ({ path }: { path: string }) => {
        // Directories exist while they hold files or are in `emptyDirs`; '' is
        // the data directory itself.
        const prefix = path === '' ? '' : `${path}/`;
        const entries = new Map<string, 'file' | 'directory'>();
        for (const key of store.keys()) {
          if (!key.startsWith(prefix)) continue;
          const [name, ...rest] = key.slice(prefix.length).split('/');
          entries.set(name!, rest.length > 0 ? 'directory' : 'file');
        }
        for (const dir of emptyDirs) {
          if (dir.startsWith(prefix))
            entries.set(dir.slice(prefix.length).split('/')[0]!, 'directory');
        }
        if (path !== '' && entries.size === 0 && !emptyDirs.has(path)) throw missing(path);
        return { files: [...entries].map(([name, type]) => ({ name, type })) };
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
const { loadSavedCatalog } = await import('../catalog/source.ts');

const NOW = new Date('2026-03-04T05:06:07.089Z');

describe('capacitorFiles', () => {
  beforeEach(() => {
    store.clear();
    emptyDirs.clear();
    vi.clearAllMocks();
  });

  it('lists nothing when the directory does not exist', async () => {
    expect(await capacitorFiles.list('openrep')).toEqual([]);
    expect(await capacitorFiles.list('openrep/nested')).toEqual([]);
  });

  it('reads an existing empty directory as a first launch (iOS creates it at launch)', async () => {
    emptyDirs.add('openrep');
    expect(await capacitorFiles.list('openrep')).toEqual([]);
    // Listed directly: the directory exists, so the missing-directory fallback is not needed.
    expect(Filesystem.readdir).toHaveBeenCalledTimes(1);
    expect(await loadUserDataFile(capacitorFiles, NOW)).toEqual({
      data: emptyUserData(),
      corruptFile: null,
    });
    expect(await loadSavedCatalog(capacitorFiles)).toBeNull();
    expect(store.size).toBe(0);
    expect(Filesystem.rename).not.toHaveBeenCalled();

    const data = {
      ...emptyUserData(),
      settings: { ...emptyUserData().settings, unit: 'lb' as const },
    };
    await saveUserDataFile(capacitorFiles, data);
    expect(await loadUserDataFile(capacitorFiles, NOW)).toEqual({ data, corruptFile: null });
  });

  it('rejects when an existing directory cannot be listed, so saved data is never replaced', async () => {
    const saved = {
      ...emptyUserData(),
      settings: { ...emptyUserData().settings, unit: 'lb' as const },
    };
    store.set('openrep/userdata.json', JSON.stringify(saved));
    const ioError = new MockFilesystemError('I/O error');
    vi.mocked(Filesystem.readdir).mockRejectedValueOnce(ioError);
    await expect(capacitorFiles.list('openrep')).rejects.toBe(ioError);

    vi.mocked(Filesystem.readdir).mockRejectedValueOnce(ioError);
    await expect(loadUserDataFile(capacitorFiles, NOW)).rejects.toBe(ioError);
    expect(store.get('openrep/userdata.json')).toBe(JSON.stringify(saved));
  });

  it('rejects when it cannot tell whether the directory exists', async () => {
    const ioError = new MockFilesystemError('I/O error');
    // Both the directory and the data directory above it fail to list.
    vi.mocked(Filesystem.readdir).mockRejectedValueOnce(ioError).mockRejectedValueOnce(ioError);
    await expect(capacitorFiles.list('openrep')).rejects.toBe(ioError);
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
    const data = {
      ...emptyUserData(),
      settings: { ...emptyUserData().settings, unit: 'lb' as const },
    };
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
