/** Driving the app: opening it, waiting for saves and reading what it stored. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import type { APIRequestContext, BrowserContext, Page } from '@playwright/test';
import type { Catalog } from '../../src/lib/schema/catalog.ts';
import type { UserData } from '../../src/lib/schema/userData.ts';
import { APP_ORIGIN, E2E_OUT_DIR } from './env.ts';
import { expect } from './fixtures.ts';

/** Where `@capacitor/filesystem` keeps files in a browser: IndexedDB `Disc`, store `FileStorage`. */
const FILES_DB = 'Disc';
const FILES_STORE = 'FileStorage';
/** The user data file (`Directory.Data`, `openrep/userdata.json`) in that store. */
const USER_DATA_PATH = '/DATA/openrep/userdata.json';

/** Opens the app at `hash` (e.g. `#/settings`) and waits until it has loaded. */
export async function openApp(page: Page, hash = '#/'): Promise<void> {
  await page.goto(`/${hash}`);
  await waitForApp(page);
}

/** Waits until user data and the catalog are loaded (a screen is shown). */
export async function waitForApp(page: Page): Promise<void> {
  await expect(page.getByTestId('screen')).toBeAttached();
}

/** Goes to a screen by changing the location hash, like following a link. */
export async function goTo(page: Page, hash: string): Promise<void> {
  await page.evaluate((target) => (window.location.hash = target), hash);
}

/** Waits until every change has been written to storage. */
export async function waitForSaved(page: Page): Promise<void> {
  await expect(page.getByTestId('app')).toHaveAttribute('data-save-state', 'saved');
}

/** Waits for pending saves, then reloads the app ("close and reopen"). */
export async function reopen(page: Page): Promise<void> {
  await waitForSaved(page);
  await page.reload();
  await waitForApp(page);
}

/**
 * The user data file as stored on the "device" once pending changes are
 * saved, or null when there is none.
 */
export async function readStoredUserData(page: Page): Promise<UserData | null> {
  await waitForSaved(page);
  const text = await page.evaluate(
    ({ db, store, key }) =>
      new Promise<string | null>((resolve, reject) => {
        const open = indexedDB.open(db);
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const connection = open.result;
          if (!connection.objectStoreNames.contains(store)) {
            connection.close();
            resolve(null);
            return;
          }
          const get = connection.transaction(store, 'readonly').objectStore(store).get(key);
          get.onerror = () => reject(get.error);
          get.onsuccess = () => {
            connection.close();
            const entry = get.result as { content?: unknown } | undefined;
            resolve(typeof entry?.content === 'string' ? entry.content : null);
          };
        };
      }),
    { db: FILES_DB, store: FILES_STORE, key: USER_DATA_PATH },
  );
  return text === null ? null : (JSON.parse(text) as UserData);
}

/**
 * Deletes everything the app stored (a fresh install). The deletion finishes
 * when the app closes its connection, so reload right after.
 */
export async function clearStorage(page: Page): Promise<void> {
  await page.evaluate(
    (db) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.deleteDatabase(db);
        request.onsuccess = () => resolve();
        request.onerror = () => reject(request.error);
        // Blocked by the app's open connection: it completes on reload.
        request.onblocked = () => resolve();
      }),
    FILES_DB,
  );
}

/** The catalog bundled with the app under test. */
export async function bundledCatalog(request: APIRequestContext): Promise<Catalog> {
  const response = await request.get('/catalog/catalog.json');
  expect(response.ok()).toBe(true);
  return (await response.json()) as Catalog;
}

/**
 * Serves the app's own files from the build output instead of the preview
 * server, like the installed app reads them from the device: they keep
 * loading when the network is turned off with `context.setOffline(true)`.
 */
export async function serveAppFromDisk(context: BrowserContext): Promise<void> {
  const root = path.resolve(E2E_OUT_DIR);
  await context.route(`${APP_ORIGIN}/**`, async (route) => {
    const { pathname } = new URL(route.request().url());
    const file = path.join(root, pathname === '/' ? 'index.html' : decodeURIComponent(pathname));
    if (!file.startsWith(root + path.sep)) return route.fulfill({ status: 403 });
    try {
      await route.fulfill({ body: await readFile(file), contentType: contentType(file) });
    } catch {
      await route.fulfill({ status: 404 });
    }
  });
}

const CONTENT_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
};

function contentType(file: string): string {
  return CONTENT_TYPES[path.extname(file)] ?? 'application/octet-stream';
}
