import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { build } from 'vite';
import { afterEach, describe, expect, it } from 'vitest';
import {
  contentSecurityPolicy,
  cspPlugin,
  InvalidCatalogUrlError,
  remoteOrigins,
} from './vite-plugin-csp.ts';

describe('content security policy', () => {
  it('allows the catalog and image origins, deduplicated', () => {
    expect(
      remoteOrigins('https://raw.githubusercontent.com/s1n7ax/openrep/catalog/catalog.json'),
    ).toEqual(['https://raw.githubusercontent.com']);
    expect(remoteOrigins('http://127.0.0.1:4799/catalog.json')).toEqual([
      'http://127.0.0.1:4799',
      'https://raw.githubusercontent.com',
    ]);
  });

  it('rejects catalog URLs that are not http(s)', () => {
    expect(() => remoteOrigins('not a url')).toThrow(InvalidCatalogUrlError);
    expect(() => remoteOrigins('file:///catalog.json')).toThrow(InvalidCatalogUrlError);
  });

  it('limits connections and images to the app and the given origins', () => {
    const policy = contentSecurityPolicy(['https://example.org']);
    const directives = new Map(
      policy.split('; ').map((directive) => {
        const [name = '', ...values] = directive.split(' ');
        return [name, values];
      }),
    );
    expect(directives.get('default-src')).toEqual(["'self'"]);
    expect(directives.get('script-src')).toEqual(["'self'"]);
    expect(directives.get('connect-src')).toEqual([
      "'self'",
      'data:',
      'blob:',
      'https://example.org',
    ]);
    expect(directives.get('img-src')).toEqual(["'self'", 'data:', 'blob:', 'https://example.org']);
    expect(directives.get('object-src')).toEqual(["'none'"]);
  });
});

describe('csp plugin', () => {
  let root: string | null = null;

  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
    root = null;
    delete process.env.VITE_CATALOG_URL;
  });

  /** The built page's policy, with the attribute's HTML escapes (`&#39;`) decoded. */
  async function builtPolicy(): Promise<string | undefined> {
    root = await mkdtemp(path.join(tmpdir(), 'openrep-csp-'));
    await writeFile(
      path.join(root, 'index.html'),
      '<!doctype html><html><head><meta charset="UTF-8" /><title>t</title></head><body></body></html>',
    );
    await build({
      configFile: false,
      root,
      logLevel: 'silent',
      plugins: [cspPlugin()],
      build: { outDir: path.join(root, 'dist') },
    });
    const html = await readFile(path.join(root, 'dist', 'index.html'), 'utf8');
    const match = /<meta http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html);
    return match?.[1]?.replaceAll('&#39;', "'").replaceAll('&quot;', '"').replaceAll('&amp;', '&');
  }

  it('injects the policy for the published catalog by default', async () => {
    const policy = await builtPolicy();
    expect(policy).toContain("connect-src 'self' data: blob: https://raw.githubusercontent.com;");
  });

  it('uses the origin of VITE_CATALOG_URL', async () => {
    process.env.VITE_CATALOG_URL = 'http://127.0.0.1:4799/catalog.json';
    expect(await builtPolicy()).toContain(
      "connect-src 'self' data: blob: http://127.0.0.1:4799 https://raw.githubusercontent.com",
    );
  });
});
