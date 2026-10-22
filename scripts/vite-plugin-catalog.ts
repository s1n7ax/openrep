/**
 * Vite plugin that ships the open data as the app's built-in catalog.
 *
 * - Dev: serves `/catalog/catalog.json`, rebuilt from `data/` on every request,
 *   and `/catalog/images/*` from `data/exercises/images/`; any change under
 *   `data/` reloads the page.
 * - Build: validates `data/` (failing the build on problems) and writes
 *   `dist/catalog/catalog.json` and `dist/catalog/images/…`.
 */
import { readFile } from 'node:fs/promises';
import type { ServerResponse } from 'node:http';
import path from 'node:path';
import type { Plugin, ResolvedConfig } from 'vite';
import type { Catalog } from '../src/lib/schema/catalog.ts';
import { InvalidDataError, loadCatalog, writeCatalog } from './lib/catalog.ts';

const IMAGE_CONTENT_TYPES: Record<string, string> = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
};

export interface CatalogPluginOptions {
  /** Data directory, relative to the Vite root. Default `data`. */
  dataDir?: string;
}

function isInside(dir: string, file: string): boolean {
  const relative = path.relative(dir, file);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

function send(res: ServerResponse, status: number, contentType: string, body: string | Buffer) {
  res.statusCode = status;
  res.setHeader('Content-Type', contentType);
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

export function catalogPlugin(options: CatalogPluginOptions = {}): Plugin {
  let config: ResolvedConfig;
  let dataDir = '';
  let builtCatalog: Catalog | undefined;

  return {
    name: 'openrep-catalog',

    configResolved(resolved) {
      config = resolved;
      dataDir = path.resolve(resolved.root, options.dataDir ?? 'data');
    },

    configureServer(server) {
      server.watcher.add(dataDir);
      const base = server.config.base.startsWith('/') ? server.config.base : '/';
      const catalogUrl = `${base}catalog/catalog.json`;
      const imagesUrl = `${base}catalog/images/`;
      const imagesDir = path.join(dataDir, 'exercises', 'images');

      server.middlewares.use((req, res, next) => {
        let pathname: string;
        try {
          pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
        } catch {
          next();
          return;
        }

        if (pathname === catalogUrl) {
          loadCatalog(dataDir).then(
            (catalog) => send(res, 200, 'application/json', JSON.stringify(catalog)),
            (error: unknown) => {
              if (!(error instanceof InvalidDataError)) {
                next(error);
                return;
              }
              server.config.logger.error(error.message, { timestamp: true });
              send(res, 500, 'text/plain; charset=utf-8', error.message);
            },
          );
          return;
        }

        if (pathname.startsWith(imagesUrl)) {
          const file = path.resolve(imagesDir, pathname.slice(imagesUrl.length));
          const contentType = IMAGE_CONTENT_TYPES[path.extname(file).toLowerCase()];
          if (!isInside(imagesDir, file) || contentType === undefined) {
            send(res, 404, 'text/plain; charset=utf-8', 'Not found');
            return;
          }
          readFile(file).then(
            (body) => send(res, 200, contentType, body),
            () => send(res, 404, 'text/plain; charset=utf-8', 'Not found'),
          );
          return;
        }

        next();
      });
    },

    hotUpdate({ file }) {
      if (this.environment.name !== 'client' || !isInside(dataDir, file)) return;
      this.environment.hot.send({ type: 'full-reload' });
      return [];
    },

    async buildStart() {
      if (config.command !== 'build') return;
      builtCatalog = await loadCatalog(dataDir);
    },

    async writeBundle(outputOptions) {
      if (builtCatalog === undefined) return;
      const outDir = outputOptions.dir ?? path.resolve(config.root, config.build.outDir);
      await writeCatalog(builtCatalog, dataDir, path.join(outDir, 'catalog'));
      config.logger.info(
        `catalog: ${builtCatalog.exercises.length} exercises, ` +
          `${builtCatalog.animations.length} animations, ${builtCatalog.schedules.length} ` +
          `schedules → ${path.relative(config.root, path.join(outDir, 'catalog'))}/`,
      );
    },
  };
}
