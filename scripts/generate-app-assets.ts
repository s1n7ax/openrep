/**
 * Generates the iOS and Android app icons and splash screens from the app
 * mark `resources/icon.svg` (white on transparent): renders the source
 * images @capacitor/assets expects into a temporary directory, then runs it
 * on the native projects. Run after changing the mark or the colours, and
 * commit the files it changes under `android/` and `ios/`.
 *
 * Usage: `npm run generate:app-assets`
 */
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { REPO_ROOT } from './lib/paths.ts';

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
