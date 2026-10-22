import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createServer, type ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { REPO_ROOT } from './lib/paths.ts';
import { catalogPlugin } from './vite-plugin-catalog.ts';

describe('catalog plugin dev server', () => {
  let root: string;
  let server: ViteDevServer;
  let origin: string;

  beforeAll(async () => {
    root = await mkdtemp(path.join(tmpdir(), 'openrep-plugin-'));
    await cp(path.join(REPO_ROOT, 'tests/fixtures/data/valid'), path.join(root, 'data'), {
      recursive: true,
    });
    await writeFile(path.join(root, 'index.html'), '<!doctype html><title>t</title>');
    server = await createServer({
      configFile: false,
      root,
      logLevel: 'silent',
      plugins: [catalogPlugin()],
      server: { host: '127.0.0.1', port: 0 },
    });
    await server.listen();
    const { port } = server.httpServer?.address() as AddressInfo;
    origin = `http://127.0.0.1:${port}`;
  });

  afterAll(async () => {
    await server.close();
    await rm(root, { recursive: true, force: true });
  });

  it('serves the catalog built from data/', async () => {
    const response = await fetch(`${origin}/catalog/catalog.json`);
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toBe('application/json');
    const catalog = (await response.json()) as { exercises: { id: string }[] };
    expect(catalog.exercises.map((e) => e.id)).toEqual(['sample-plank', 'sample-push-up']);
  });

  it('serves images and refuses paths outside the image folder', async () => {
    const image = await fetch(`${origin}/catalog/images/sample-push-up/0.webp`);
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toBe('image/webp');
    expect((await fetch(`${origin}/catalog/images/missing/0.webp`)).status).toBe(404);
    await writeFile(path.join(root, 'outside.webp'), 'not served');
    const traversal = await fetch(`${origin}/catalog/images/..%2F..%2F..%2Foutside.webp`);
    expect(traversal.status).toBe(404);
  });

  it('reports invalid data as a 500 with the problems', async () => {
    const broken = path.join(root, 'data/schedules/broken.json');
    await writeFile(broken, '{');
    try {
      const response = await fetch(`${origin}/catalog/catalog.json`);
      expect(response.status).toBe(500);
      expect(await response.text()).toContain('schedules/broken.json: invalid JSON');
    } finally {
      await rm(broken);
    }
  });

  it('reloads the page when a data file changes', async () => {
    const send = vi.spyOn(server.environments.client.hot, 'send');
    await writeFile(path.join(root, 'data/exercises/sample-plank.json.tmp'), '{}');
    await vi.waitFor(() => expect(send).toHaveBeenCalledWith({ type: 'full-reload' }), {
      timeout: 5000,
    });
  });
});
