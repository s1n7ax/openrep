import { fileURLToPath } from 'node:url';

/** Absolute path of the repository root. */
export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Absolute path of the open data directory (`data/`). */
export const DATA_DIR = fileURLToPath(new URL('../../data', import.meta.url));

/**
 * Absolute path of the store listing (fastlane's layout, read by F-Droid from
 * the source and pushed to Google Play by the release workflow).
 */
export const LISTING_DIR = fileURLToPath(
  new URL('../../fastlane/metadata/android/en-US', import.meta.url),
);

/**
 * Absolute path of the F-Droid build recipe: the metadata file F-Droid keeps
 * as `metadata/io.github.s1n7ax.openrep.yml` in fdroiddata.
 */
export const FDROID_RECIPE = fileURLToPath(
  new URL('../../fdroid/build-metadata.yml', import.meta.url),
);

/** The repository on GitHub. */
export const REPO_URL = 'https://github.com/s1n7ax/openrep';
