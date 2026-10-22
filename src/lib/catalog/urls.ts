/**
 * Where the app downloads from. Kept free of `import.meta.env` so the build
 * (the Content-Security-Policy plugin) can import it too.
 */

/** The published catalog, rebuilt on every push to the repository's main branch. */
export const DEFAULT_CATALOG_URL =
  'https://raw.githubusercontent.com/s1n7ax/openrep/catalog/catalog.json';

/** Exercise images of the repository, for exercises not bundled with the app. */
export const REMOTE_IMAGE_BASE_URL =
  'https://raw.githubusercontent.com/s1n7ax/openrep/main/data/exercises/';
