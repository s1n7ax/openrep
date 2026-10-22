/**
 * Where the catalog comes from: the copy bundled with the app, the copy
 * saved by the last update, and the remote one on GitHub.
 */
import type { Catalog } from '../schema/catalog.ts';
import { readWithFallback, writeFileAtomically, type TextFiles } from '../persistence/files.ts';
import { parseCatalog } from './update.ts';
import { DEFAULT_CATALOG_URL, REMOTE_IMAGE_BASE_URL } from './urls.ts';

/** The remote catalog URL, overridable at build time with `VITE_CATALOG_URL` (tests). */
export const CATALOG_URL: string = import.meta.env.VITE_CATALOG_URL || DEFAULT_CATALOG_URL;

/** The catalog bundled with the app, relative to the page. */
export const BUNDLED_CATALOG_PATH = 'catalog/catalog.json';

export const SAVED_CATALOG_DIR = 'openrep';
export const SAVED_CATALOG_FILE = 'catalog.json';

/** The catalog saved by the last update, or null when there is none or it is not usable. */
export async function loadSavedCatalog(files: TextFiles): Promise<Catalog | null> {
  let result;
  try {
    result = await readWithFallback(files, SAVED_CATALOG_DIR, SAVED_CATALOG_FILE, parseCatalog);
  } catch (error) {
    // The directory could not be listed: use the bundled catalog this time.
    console.error('The saved catalog could not be looked up, ignoring it:', error);
    return null;
  }
  for (const { name, error } of result.invalid) {
    console.error(`Saved catalog "${name}" is not usable, ignoring it:`, error);
  }
  return result.value;
}

/** A finished catalog download: the body text, or the HTTP status of an error answer. */
export type CatalogDownload = { ok: true; text: string } | { ok: false; status: number };

/**
 * Downloads the catalog text from `url`, bypassing the HTTP cache. Rejects
 * when there is no connection or when the download (body included) takes
 * longer than `timeoutMs`.
 *
 * The timeout uses an AbortController and a timer, not
 * `AbortSignal.timeout`, which iOS 15 Safari and Android WebViews before
 * Chromium 103 lack.
 */
export async function downloadCatalog(url: string, timeoutMs: number): Promise<CatalogDownload> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { cache: 'no-store', signal: controller.signal });
    if (!response.ok) return { ok: false, status: response.status };
    return { ok: true, text: await response.text() };
  } finally {
    clearTimeout(timer);
  }
}

/** Saves downloaded catalog text (already validated) crash-safely. Rejects when writing fails. */
export async function saveCatalog(files: TextFiles, text: string): Promise<void> {
  await writeFileAtomically(files, SAVED_CATALOG_DIR, SAVED_CATALOG_FILE, text);
}

/**
 * URL of an exercise image (`images/<id>/<n>.webp`): the bundled file when the
 * app ships it, otherwise the repository copy on GitHub.
 */
export function exerciseImageUrl(
  imagePath: string,
  bundledImages: ReadonlySet<string>,
  baseUrl: string,
): string {
  return bundledImages.has(imagePath)
    ? `${baseUrl}catalog/${imagePath}`
    : `${REMOTE_IMAGE_BASE_URL}${imagePath}`;
}
