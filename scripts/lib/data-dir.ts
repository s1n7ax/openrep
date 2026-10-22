import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import type { DataFile, DataSet } from '../../src/lib/data/validate';

async function listEntries(dir: string) {
  try {
    return await readdir(dir, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
}

/** Reads the files directly inside `<dataDir>/<folder>`, sorted by name. */
async function readFolder(dataDir: string, folder: string): Promise<DataFile[]> {
  const entries = await listEntries(path.join(dataDir, folder));
  const names = entries
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .sort();
  return Promise.all(
    names.map(async (name) => ({
      path: `${folder}/${name}`,
      content: await readFile(path.join(dataDir, folder, name), 'utf8'),
    })),
  );
}

/** Lists the files under `dir` recursively, relative to `base`, with "/" separators. */
async function listFilesRecursive(dir: string, base: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await listEntries(dir)) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) result.push(...(await listFilesRecursive(full, base)));
    else if (entry.isFile()) result.push(path.relative(base, full).split(path.sep).join('/'));
  }
  return result.sort();
}

/** Reads a data directory (`data/` or a test fixture) into memory. */
export async function readDataDir(dataDir: string): Promise<DataSet> {
  const exercisesDir = path.join(dataDir, 'exercises');
  const [exercises, animations, schedules, images] = await Promise.all([
    readFolder(dataDir, 'exercises'),
    readFolder(dataDir, 'animations'),
    readFolder(dataDir, 'schedules'),
    listFilesRecursive(path.join(exercisesDir, 'images'), exercisesDir),
  ]);
  return { exercises, animations, schedules, images };
}
