/**
 * Renders exercise animations through the dev pose route and composes one
 * contact-sheet PNG per exercise: rows = camera views, columns = loop times.
 * Use it to review an animation in a single image.
 *
 * Usage:
 *   npm run contact-sheet -- <exerciseId> [<exerciseId> …]
 *   npm run contact-sheet -- --all
 * Options:
 *   --out <dir>        output directory (default test-results/contact-sheets)
 *   --times <list>     loop times (default 0,0.25,0.5,0.75)
 *   --views <list>     camera presets: default, front, side, back, top (default default,side)
 *   --theme <name>     dark or light (default dark)
 *   --size <w>x<h>     size of one tile in CSS pixels (default 420x520)
 *
 * Starts its own Vite dev server and a headless Chromium (Playwright; set
 * PLAYWRIGHT_BROWSERS_PATH if your system needs specific browsers).
 */
import { mkdir, readdir } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { chromium, type Page } from '@playwright/test';
import sharp from 'sharp';
import { createServer } from 'vite';
import { DATA_DIR, REPO_ROOT } from './lib/paths.ts';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    all: { type: 'boolean', default: false },
    out: { type: 'string', default: path.join(REPO_ROOT, 'test-results', 'contact-sheets') },
    times: { type: 'string', default: '0,0.25,0.5,0.75' },
    views: { type: 'string', default: 'default,side' },
    theme: { type: 'string', default: 'dark' },
    size: { type: 'string', default: '420x520' },
  },
});

const ids = values.all
  ? (await readdir(path.join(DATA_DIR, 'animations')))
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.slice(0, -'.json'.length))
      .sort()
  : positionals;
if (ids.length === 0) {
  console.error('Usage: npm run contact-sheet -- <exerciseId> […] | --all');
  process.exit(2);
}
const times = values.times.split(',').map(Number);
const views = values.views.split(',');
const [tileWidth = 420, tileHeight = 520] = values.size.split('x').map(Number);
const theme = values.theme === 'light' ? 'light' : 'dark';
const outDir = path.resolve(values.out);
await mkdir(outDir, { recursive: true });

const server = await createServer({
  root: REPO_ROOT,
  logLevel: 'error',
  server: { host: '127.0.0.1', port: 5199, strictPort: false },
});
await server.listen();
const baseUrl = server.resolvedUrls?.local[0] ?? 'http://127.0.0.1:5199/';

const browser = await chromium.launch();
const context = await browser.newContext({
  viewport: { width: tileWidth, height: tileHeight },
  deviceScaleFactor: 1,
  colorScheme: theme,
});
const page = await context.newPage();
const pageErrors: string[] = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('console', (message) => {
  if (message.type() === 'error') pageErrors.push(message.text());
});

async function frameCount(): Promise<number> {
  const value = await page
    .locator('[data-testid="exercise-viewer"]')
    .getAttribute('data-frame', { timeout: 30_000 });
  return Number(value ?? 0);
}

/** Navigates the dev route and waits until a new frame has been rendered. */
async function show(target: Page, id: string, t: number, view: string, first: boolean) {
  const hash = `#/dev/pose/${id}?t=${t}&view=${view}`;
  const before = first ? 0 : await frameCount();
  if (first) {
    await target.goto(`${baseUrl}${hash}`);
    await target.addStyleTag({ content: '.buttons { display: none !important; }' });
  } else await target.evaluate((h) => (window.location.hash = h), hash);
  await target.waitForFunction(
    (previous) => {
      const viewer = document.querySelector('[data-testid="exercise-viewer"]');
      return Number(viewer?.getAttribute('data-frame') ?? 0) > previous;
    },
    before,
    { timeout: 30_000 },
  );
  // Let the compositor present the frame before capturing it.
  await target.evaluate(
    () => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))),
  );
}

function label(text: string, width: number, height: number, size: number, weight = 600): Buffer {
  const color = theme === 'dark' ? '#eef1f5' : '#20242b';
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
  return Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<text x="12" y="${Math.round(height * 0.68)}" font-family="sans-serif" font-size="${size}" ` +
      `font-weight="${weight}" fill="${color}">${escaped}</text></svg>`,
  );
}

let failed = false;
try {
  for (const id of ids) {
    const tiles: { input: Buffer; left: number; top: number }[] = [];
    const header = 44;
    const caption = 26;
    let first = true;
    for (const [row, view] of views.entries()) {
      for (const [col, t] of times.entries()) {
        await show(page, id, t, view, first);
        first = false;
        const shot = await page.locator('[data-testid="exercise-viewer"] .stage').screenshot();
        const left = col * tileWidth;
        const top = header + row * (tileHeight + caption);
        tiles.push({ input: shot, left, top: top + caption });
        tiles.push({ input: label(`t = ${t} · ${view}`, tileWidth, caption, 15, 500), left, top });
      }
    }
    const primary = await page
      .locator('[data-testid="exercise-viewer"]')
      .getAttribute('data-primary');
    const secondary = await page
      .locator('[data-testid="exercise-viewer"]')
      .getAttribute('data-secondary');
    const width = tileWidth * times.length;
    tiles.push({
      input: label(
        `${id} — primary: ${primary || '–'} · secondary: ${secondary || '–'}`,
        width,
        header,
        18,
      ),
      left: 0,
      top: 0,
    });
    const file = path.join(outDir, `${id}.png`);
    await sharp({
      create: {
        width,
        height: header + views.length * (tileHeight + caption),
        channels: 4,
        background: theme === 'dark' ? '#0e1116' : '#ffffff',
      },
    })
      .composite(tiles)
      .png()
      .toFile(file);
    console.log(path.relative(process.cwd(), file));
  }
  if (pageErrors.length > 0) {
    failed = true;
    console.error(`Errors in the page:\n  ${[...new Set(pageErrors)].join('\n  ')}`);
  }
} finally {
  await browser.close();
  await server.close();
}
if (failed) process.exit(1);
