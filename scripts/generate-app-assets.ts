/**
 * Generates the iOS and Android app icons and splash screens from the app
 * mark `resources/icon.svg` (white on transparent): renders the source
 * images @capacitor/assets expects into a temporary directory, then runs it
 * on the native projects. Also renders the store listing's icon and feature
 * graphic (`fastlane/metadata/android/en-US/images/`). Run after changing the
 * mark or the colours, and commit the files it changes under `android/`,
 * `ios/` and `fastlane/`.
 *
 * Usage: `npm run generate:app-assets`
 */
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { LISTING_DIR, REPO_ROOT } from './lib/paths.ts';

/** Pinned so the generated files only change when this script does. */
const CAPACITOR_ASSETS = '@capacitor/assets@3.0.5';

/** The app's accent colour (light theme `--accent`) behind the icon and the light splash. */
const ICON_BACKGROUND = '#0d7a6f';
/** The dark theme background (`--bg`) behind the dark splash. */
const SPLASH_BACKGROUND_DARK = '#0b0f14';

/** An image being composed with sharp. */
type Image = ReturnType<typeof sharp>;

const ICON_SIZE = 1024;
const SPLASH_SIZE = 2732;

/** The mark as a square PNG `size` pixels wide on a transparent background. */
async function renderMark(svg: Buffer, size: number): Promise<Buffer> {
  return sharp(svg).resize(size, size).png().toBuffer();
}

/**
 * A `size`² image: `background` (or transparent) with the mark centred at
 * `scale` of the width (no mark when `scale` is 0).
 */
async function compose(
  svg: Buffer,
  size: number,
  scale: number,
  background: string | null,
): Promise<Image> {
  const canvas = sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: background ?? { r: 0, g: 0, b: 0, alpha: 0 },
    },
  });
  if (scale === 0) return canvas;
  const markSize = Math.round(size * scale);
  const offset = Math.round((size - markSize) / 2);
  return canvas.composite([{ input: await renderMark(svg, markSize), left: offset, top: offset }]);
}

/** The store listing's 512 × 512 icon (Google Play masks the corners itself). */
async function storeIcon(svg: Buffer): Promise<Image> {
  return compose(svg, 512, 0.86, ICON_BACKGROUND);
}

/**
 * The store listing's 1024 × 500 feature graphic: the mark and the app's name
 * on the icon background, without transparency (Google Play requires none).
 */
async function featureGraphic(svg: Buffer): Promise<Image> {
  const [width, height, markSize] = [1024, 500, 360];
  const text = Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
      `<text x="472" y="236" font-family="sans-serif" font-size="104" font-weight="700" ` +
      `fill="#ffffff">OpenRep</text>` +
      `<text x="476" y="306" font-family="sans-serif" font-size="34" fill="#ffffff" ` +
      `fill-opacity="0.88">Gym plans, 3D exercises</text>` +
      `<text x="476" y="350" font-family="sans-serif" font-size="34" fill="#ffffff" ` +
      `fill-opacity="0.88">and a workout log</text></svg>`,
  );
  const composed = await sharp({
    create: { width, height, channels: 3, background: ICON_BACKGROUND },
  })
    .composite([
      { input: await renderMark(svg, markSize), left: 80, top: (height - markSize) / 2 },
      { input: text, left: 0, top: 0 },
    ])
    .png()
    .toBuffer();
  // Compositing adds an alpha channel; drop it (it is fully opaque).
  return sharp(composed).removeAlpha();
}

/**
 * Where the source images are rendered. @capacitor/assets resolves
 * `--assetPath` against the project root, so it lives inside the repository
 * (in the git-ignored node_modules).
 */
const WORK_DIR = path.join('node_modules', '.cache', 'openrep-app-assets');

const svg = await readFile(path.join(REPO_ROOT, 'resources', 'icon.svg'));
const workDir = path.join(REPO_ROOT, WORK_DIR);
await rm(workDir, { recursive: true, force: true });
await mkdir(workDir, { recursive: true });
try {
  // icon-only: iOS and legacy Android icons (opaque). icon-foreground/-background:
  // Android adaptive icon layers (the tool insets the foreground into the safe zone).
  const sources: [string, Promise<Image>][] = [
    ['icon-only.png', compose(svg, ICON_SIZE, 0.86, ICON_BACKGROUND)],
    ['icon-foreground.png', compose(svg, ICON_SIZE, 1, null)],
    ['icon-background.png', compose(svg, ICON_SIZE, 0, ICON_BACKGROUND)],
    ['splash.png', compose(svg, SPLASH_SIZE, 0.3, ICON_BACKGROUND)],
    ['splash-dark.png', compose(svg, SPLASH_SIZE, 0.3, SPLASH_BACKGROUND_DARK)],
  ];
  for (const [name, image] of sources) {
    await (await image).png().toFile(path.join(workDir, name));
  }

  const storeImages = path.join(LISTING_DIR, 'images');
  await mkdir(storeImages, { recursive: true });
  await (await storeIcon(svg)).png().toFile(path.join(storeImages, 'icon.png'));
  await (await featureGraphic(svg)).png().toFile(path.join(storeImages, 'featureGraphic.png'));

  const result = spawnSync(
    'npx',
    ['--yes', CAPACITOR_ASSETS, 'generate', '--assetPath', WORK_DIR, '--android', '--ios'],
    { cwd: REPO_ROOT, stdio: 'inherit' },
  );
  if (result.status !== 0) {
    console.error(`${CAPACITOR_ASSETS} failed (exit ${result.status ?? result.signal}).`);
    process.exitCode = 1;
  }
} finally {
  await rm(workDir, { recursive: true, force: true });
}
