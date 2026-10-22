import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildCatalog } from '../../src/lib/data/buildCatalog.ts';
import { validateData, type ValidationIssue } from '../../src/lib/data/validate.ts';
import type { Catalog } from '../../src/lib/schema/catalog.ts';
import { readDataDir } from './data-dir.ts';

/** The data directory has validation problems, so no catalog can be built from it. */
export class InvalidDataError extends Error {
  override name = 'InvalidDataError';
  readonly dataDir: string;
  readonly issues: ValidationIssue[];

  constructor(dataDir: string, issues: ValidationIssue[]) {
    super(
      `${issues.length} problem(s) in ${dataDir}:\n` +
        issues.map((issue) => `  ${issue.file}: ${issue.message}`).join('\n'),
    );
    this.dataDir = dataDir;
    this.issues = issues;
  }
}

/**
 * Timestamp for `generatedAt`: `SOURCE_DATE_EPOCH` (seconds) when set, for
 * reproducible builds, otherwise the current time.
 */
export function catalogTimestamp(): string {
  const epoch = process.env.SOURCE_DATE_EPOCH;
  return (epoch ? new Date(Number(epoch) * 1000) : new Date()).toISOString();
}

/**
 * Reads, validates and aggregates a data directory into a catalog.
 *
 * @throws {InvalidDataError} when the data has validation problems.
 */
export async function loadCatalog(dataDir: string, generatedAt = catalogTimestamp()) {
  const { issues, data } = validateData(await readDataDir(dataDir));
  if (issues.length > 0) {
    console.error(`Cannot build the catalog: ${issues.length} data problem(s) in ${dataDir}.`);
    throw new InvalidDataError(dataDir, issues);
  }
  return buildCatalog(data, generatedAt);
}

/** Every image path the catalog references, relative to the catalog file. */
export function catalogImages(catalog: Catalog): string[] {
  return catalog.exercises.flatMap((exercise) => exercise.images);
}

/**
 * Writes `<outDir>/catalog.json` and, unless `images` is false, copies the
 * referenced images from `<dataDir>/exercises/` to `<outDir>/images/`.
 */
export async function writeCatalog(
  catalog: Catalog,
  dataDir: string,
  outDir: string,
  { images: copyImages = true }: { images?: boolean } = {},
): Promise<void> {
  await mkdir(outDir, { recursive: true });
  await writeFile(path.join(outDir, 'catalog.json'), JSON.stringify(catalog));
  if (!copyImages) return;
  const images = catalogImages(catalog);
  const dirs = new Set(images.map((image) => path.dirname(path.join(outDir, image))));
  await Promise.all([...dirs].map((dir) => mkdir(dir, { recursive: true })));
  await Promise.all(
    images.map((image) =>
      copyFile(path.join(dataDir, 'exercises', image), path.join(outDir, image)),
    ),
  );
}
