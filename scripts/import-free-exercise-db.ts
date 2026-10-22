/**
 * Imports the free-exercise-db dataset (Unlicense) into `data/exercises/`.
 *
 * - Downloads `dist/exercises.json` and the images at a pinned commit.
 * - Converts ids to kebab-case (upstream id lowercased, every run of
 *   non-alphanumerics replaced by "-").
 * - Converts images to WebP (width <= 400 px, quality 65) under
 *   `data/exercises/images/<id>/<n>.webp`; existing images are kept unless
 *   `--force` is given.
 * - Writes `data/exercises/<id>.json`, merging curated aliases from
 *   `scripts/aliases.json` with aliases already in the file.
 *
 * Usage: `npm run import:free-exercise-db [-- --force]`
 */
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import * as z from 'zod';
import { exerciseSchema } from '../src/lib/schema/exercise';
import {
  aliasesFileSchema,
  toExercise,
  toKebabId,
  upstreamExerciseSchema,
} from './lib/free-exercise-db';
import { DATA_DIR, REPO_ROOT } from './lib/paths';

const UPSTREAM_COMMIT = 'f00c92c7dcf1216a928a52c3706c7ce8e2f71ed5';
const UPSTREAM_BASE = `https://raw.githubusercontent.com/yuhonas/free-exercise-db/${UPSTREAM_COMMIT}`;
const EXERCISES_DIR = path.join(DATA_DIR, 'exercises');
const ALIASES_FILE = path.join(REPO_ROOT, 'scripts', 'aliases.json');
const IMAGE_MAX_WIDTH = 400;
const IMAGE_QUALITY = 65;
const CONCURRENCY = 16;

/** A download from GitHub failed (network error or HTTP error status). */
class DownloadError extends Error {
  override name = 'DownloadError';
}

/** Two upstream ids convert to the same OpenRep id. */
class IdCollisionError extends Error {
  override name = 'IdCollisionError';
}

/** `scripts/aliases.json` names an exercise id that the dataset does not have. */
class UnknownAliasIdError extends Error {
  override name = 'UnknownAliasIdError';
}

/**
 * GETs a URL, retrying network errors, HTTP 429 and HTTP 5xx with backoff.
 *
 * @throws {DownloadError} when every attempt fails.
 */
async function fetchWithRetry(url: string, attempts = 4): Promise<Response> {
  let reason = '';
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      reason = `HTTP ${response.status}`;
      if (response.status < 500 && response.status !== 429) break;
    } catch (error) {
      reason = error instanceof Error ? error.message : String(error);
    }
    await new Promise((resolve) => setTimeout(resolve, 500 * attempt));
  }
  throw new DownloadError(`GET ${url} failed: ${reason}`);
}

async function exists(file: string): Promise<boolean> {
  try {
    await stat(file);
    return true;
  } catch {
    return false;
  }
}

async function readExistingAliases(file: string): Promise<string[]> {
  try {
    const parsed = exerciseSchema.shape.aliases.safeParse(
      (JSON.parse(await readFile(file, 'utf8')) as { aliases?: unknown }).aliases,
    );
    return parsed.success ? parsed.data : [];
  } catch {
    return [];
  }
}

async function runPool<T>(items: T[], worker: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.min(CONCURRENCY, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++] as T;
      await worker(item);
    }
  });
  await Promise.all(runners);
}

/**
 * Runs the import.
 *
 * @throws {DownloadError} when the dataset or an image cannot be downloaded.
 * @throws {IdCollisionError} when two upstream ids convert to the same id.
 * @throws {UnknownAliasIdError} when `scripts/aliases.json` names an unknown id.
 */
async function main(): Promise<void> {
  const force = process.argv.includes('--force');

  console.log(`Downloading free-exercise-db @ ${UPSTREAM_COMMIT.slice(0, 7)} ...`);
  const response = await fetchWithRetry(`${UPSTREAM_BASE}/dist/exercises.json`);
  const upstream = z.array(upstreamExerciseSchema).parse(await response.json());

  const curatedAliases = aliasesFileSchema.parse(JSON.parse(await readFile(ALIASES_FILE, 'utf8')));
  const ids = new Map<string, string>();
  for (const exercise of upstream) {
    const id = toKebabId(exercise.id);
    const other = ids.get(id);
    if (other !== undefined) {
      throw new IdCollisionError(`"${other}" and "${exercise.id}" both become "${id}"`);
    }
    ids.set(id, exercise.id);
  }
  const unknownAliasIds = Object.keys(curatedAliases).filter((id) => !ids.has(id));
  if (unknownAliasIds.length > 0) {
    throw new UnknownAliasIdError(
      `scripts/aliases.json has unknown exercise ids: ${unknownAliasIds.join(', ')}`,
    );
  }

  await mkdir(EXERCISES_DIR, { recursive: true });
  let converted = 0;
  let done = 0;
  await runPool(upstream, async (item) => {
    const id = toKebabId(item.id);
    const imagePaths: string[] = [];
    for (const [index, upstreamPath] of item.images.entries()) {
      const relative = `images/${id}/${index}.webp`;
      const target = path.join(EXERCISES_DIR, relative);
      if (force || !(await exists(target))) {
        const image = await fetchWithRetry(`${UPSTREAM_BASE}/exercises/${upstreamPath}`);
        const webp = await sharp(Buffer.from(await image.arrayBuffer()))
          .resize({ width: IMAGE_MAX_WIDTH, withoutEnlargement: true })
          .webp({ quality: IMAGE_QUALITY })
          .toBuffer();
        await mkdir(path.dirname(target), { recursive: true });
        await writeFile(target, webp);
        converted++;
      }
      imagePaths.push(relative);
    }

    const file = path.join(EXERCISES_DIR, `${id}.json`);
    const aliases = [...(await readExistingAliases(file)), ...(curatedAliases[id] ?? [])];
    const exercise = toExercise(item, aliases, imagePaths);
    await writeFile(file, `${JSON.stringify(exercise, null, 2)}\n`);
    done++;
    if (done % 100 === 0) console.log(`  ${done}/${upstream.length} exercises`);
  });

  console.log(`Imported ${upstream.length} exercises (${converted} images converted).`);
}

try {
  await main();
} catch (error) {
  console.error(
    `Import failed: ${error instanceof Error ? `${error.name}: ${error.message}` : error}`,
  );
  process.exit(1);
}
