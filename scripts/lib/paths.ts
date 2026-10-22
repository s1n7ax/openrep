import { fileURLToPath } from 'node:url';

/** Absolute path of the repository root. */
export const REPO_ROOT = fileURLToPath(new URL('../..', import.meta.url));

/** Absolute path of the open data directory (`data/`). */
export const DATA_DIR = fileURLToPath(new URL('../../data', import.meta.url));
