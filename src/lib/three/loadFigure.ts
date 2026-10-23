/**
 * Loads the figure asset bundled with the app (works offline: it is a local
 * file of the build). The parsed asset is shared by every 3D view.
 */
import figureUrl from './assets/figure.glb?url';
import { parseFigureAsset, type FigureAsset } from './figureAsset.ts';

/** The figure asset could not be loaded. */
export class FigureLoadError extends Error {
  override name = 'FigureLoadError';
}

let loading: Promise<FigureAsset> | null = null;

/**
 * The parsed figure asset (fetched once).
 *
 * @throws {FigureLoadError} when the file cannot be fetched.
 * @throws {import('./figureAsset.ts').FigureAssetFormatError} when it is not a figure asset.
 */
export function loadFigureAsset(): Promise<FigureAsset> {
  loading ??= fetch(figureUrl)
    .then((response) => {
      if (!response.ok) {
        const message = `The figure asset could not be loaded: HTTP ${response.status}`;
        console.error(message);
        throw new FigureLoadError(message);
      }
      return response.arrayBuffer();
    })
    .then(parseFigureAsset)
    .catch((error: unknown) => {
      loading = null;
      throw error;
    });
  return loading;
}
