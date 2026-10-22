/**
 * Where the e2e tests run: the preview server of a build made for the tests,
 * whose remote catalog URL points at a local address the tests answer with
 * `page.route` (nothing listens there, so an unrouted download fails like
 * being offline).
 */

/** Port of the preview server. */
export const APP_PORT = 4173;

export const APP_ORIGIN = `http://127.0.0.1:${APP_PORT}`;

/** The e2e build's remote catalog URL (`VITE_CATALOG_URL`). */
export const REMOTE_CATALOG_URL = 'http://127.0.0.1:4799/catalog.json';

export const REMOTE_CATALOG_ORIGIN = new URL(REMOTE_CATALOG_URL).origin;

/**
 * Output directory of the e2e build, kept apart from `dist/` so a test build
 * (pointing at the local catalog URL) never ends up in the apps.
 */
export const E2E_OUT_DIR = 'dist-e2e';
