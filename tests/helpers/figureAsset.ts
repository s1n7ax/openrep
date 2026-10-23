import { readFileSync } from 'node:fs';
import { parseFigureAsset, type FigureAsset } from '../../src/lib/three/figureAsset.ts';

/** The figure asset bundled with the app. */
export const FIGURE_ASSET_URL = new URL('../../src/lib/three/assets/figure.glb', import.meta.url);

/** Reads and parses the bundled figure asset, as the app's loader does after fetching it. */
export function readFigureAsset(): FigureAsset {
  const file = readFileSync(FIGURE_ASSET_URL);
  return parseFigureAsset(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength));
}
