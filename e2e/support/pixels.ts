/**
 * Pixel checks on screenshots of the 3D view: how much two frames differ and
 * how many pixels show the primary (red-orange) or secondary (amber) muscle
 * glow (see `src/lib/three/colors.ts`).
 */
import sharp from 'sharp';

export interface Image {
  /** RGBA, 4 bytes per pixel. */
  data: Buffer;
  width: number;
  height: number;
}

export async function decodePng(png: Buffer): Promise<Image> {
  const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

/** Two images that should be compared have different sizes. */
export class ImageSizeMismatchError extends Error {
  override name = 'ImageSizeMismatchError';
}

/** A channel must change by more than this for a pixel to count as changed (noise, dithering). */
const CHANGE_THRESHOLD = 16;

/**
 * Share (0–1) of pixels that differ between two images of the same size.
 *
 * @throws {ImageSizeMismatchError} when the images differ in size.
 */
export function changedFraction(a: Image, b: Image): number {
  if (a.width !== b.width || a.height !== b.height) {
    const message = `Image sizes differ: ${a.width}×${a.height} vs ${b.width}×${b.height}`;
    console.error(message);
    throw new ImageSizeMismatchError(message);
  }
  let changed = 0;
  for (let i = 0; i < a.data.length; i += 4) {
    const delta = Math.max(
      Math.abs(a.data[i]! - b.data[i]!),
      Math.abs(a.data[i + 1]! - b.data[i + 1]!),
      Math.abs(a.data[i + 2]! - b.data[i + 2]!),
    );
    if (delta > CHANGE_THRESHOLD) changed++;
  }
  return changed / (a.width * a.height);
}

/** Hue in degrees (0–360), saturation and value (0–1) of an sRGB colour. */
function hsv(r: number, g: number, b: number): { h: number; s: number; v: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d > 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max / 255 };
}

/**
 * Primary glow `#ff4a1c` (hue 11°) renders at hue 0–22°; secondary glow
 * `#ffb238` (hue 37°) at 26–50°. The figure, floor and equipment are grey,
 * near black or blue-grey, so they fall in neither range.
 */
export type Glow = 'primary' | 'secondary' | null;

export function glowOf(r: number, g: number, b: number): Glow {
  const { h, s, v } = hsv(r, g, b);
  if (s >= 0.5 && v >= 0.3 && (h <= 22 || h >= 345)) return 'primary';
  if (s >= 0.4 && v >= 0.4 && h >= 26 && h <= 50) return 'secondary';
  return null;
}

/** Number of primary- and secondary-glow pixels in an image. */
export function glowPixels(image: Image): { primary: number; secondary: number } {
  let primary = 0;
  let secondary = 0;
  for (let i = 0; i < image.data.length; i += 4) {
    const glow = glowOf(image.data[i]!, image.data[i + 1]!, image.data[i + 2]!);
    if (glow === 'primary') primary++;
    else if (glow === 'secondary') secondary++;
  }
  return { primary, secondary };
}
