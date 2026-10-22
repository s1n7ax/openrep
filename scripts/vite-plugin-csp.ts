/**
 * Vite plugin adding a Content-Security-Policy meta tag to the built
 * `index.html`, so the app can only talk to itself and to where the catalog
 * and exercise images are downloaded from (no analytics, fonts or CDNs).
 *
 * The catalog origin comes from `VITE_CATALOG_URL` when set at build time
 * (tests point it at a local server), else the published catalog on GitHub.
 * Dev builds are left without the tag (Vite's dev client needs more).
 */
import type { Plugin } from 'vite';
import { DEFAULT_CATALOG_URL, REMOTE_IMAGE_BASE_URL } from '../src/lib/catalog/urls.ts';

/** `VITE_CATALOG_URL` is not an http(s) URL. */
export class InvalidCatalogUrlError extends Error {
  override name = 'InvalidCatalogUrlError';
}

/**
 * The origins the app downloads from: the catalog's and the remote images'.
 *
 * @throws {InvalidCatalogUrlError} when `catalogUrl` is not an http(s) URL.
 */
export function remoteOrigins(
  catalogUrl: string,
  imageBaseUrl: string = REMOTE_IMAGE_BASE_URL,
): string[] {
  let catalog: URL;
  try {
    catalog = new URL(catalogUrl);
  } catch (error) {
    throw new InvalidCatalogUrlError(`VITE_CATALOG_URL is not a URL: "${catalogUrl}"`, {
      cause: error,
    });
  }
  if (catalog.protocol !== 'https:' && catalog.protocol !== 'http:') {
    throw new InvalidCatalogUrlError(`VITE_CATALOG_URL must be http(s): "${catalogUrl}"`);
  }
  return [...new Set([catalog.origin, new URL(imageBaseUrl).origin])];
}

/** The policy text allowing network access only to the app itself and `origins`. */
export function contentSecurityPolicy(origins: readonly string[]): string {
  const remote = origins.join(' ');
  return [
    "default-src 'self'",
    "script-src 'self'",
    // Svelte sets some inline style attributes at runtime.
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${remote}`,
    `connect-src 'self' data: blob: ${remote}`,
    "font-src 'self'",
    "media-src 'self'",
    "worker-src 'self' blob:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'none'",
  ].join('; ');
}

export function cspPlugin(): Plugin {
  let policy = '';
  return {
    name: 'openrep-csp',
    apply: 'build',

    configResolved(config) {
      const catalogUrl = (config.env.VITE_CATALOG_URL as string | undefined) || DEFAULT_CATALOG_URL;
      policy = contentSecurityPolicy(remoteOrigins(catalogUrl));
    },

    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: policy },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}
