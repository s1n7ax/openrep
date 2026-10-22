/**
 * The developer route `#/dev/pose/<exerciseId>?t=<0..1>`: shows an exercise's
 * 3D view full screen, frozen at loop time t (playing when t is omitted).
 * Optional review parameters: `view=<default|front|side|back|top>`,
 * `zoom=<factor>` and `focus=<x,y,z>` (world point to look at). Used to review
 * animations and by screenshot tooling.
 */
import type { ViewPreset } from './three/viewer.ts';

export interface DevPoseRoute {
  exerciseId: string;
  /** Loop time to freeze at, or null to play. */
  time: number | null;
  view: ViewPreset;
  /** Camera zoom factor (> 1 is closer). */
  zoom: number;
  /** World point to look at instead of the framed figure, or null. */
  focus: [number, number, number] | null;
}

const VIEWS: readonly ViewPreset[] = ['default', 'front', 'side', 'back', 'top'];

/** Parses a location hash; null when it is not the dev pose route. */
export function parseDevPoseRoute(hash: string): DevPoseRoute | null {
  const [path = '', query = ''] = hash.replace(/^#/, '').split('?');
  const match = /^\/dev\/pose\/([a-z0-9-]+)\/?$/.exec(path);
  if (!match?.[1]) return null;
  const params = new URLSearchParams(query);
  const t = params.get('t');
  const parsed = t === null || t.trim() === '' ? NaN : Number(t);
  const view = params.get('view');
  const zoom = Number(params.get('zoom') ?? 1);
  const focus = (params.get('focus') ?? '').split(',').map(Number);
  return {
    exerciseId: match[1],
    time: Number.isFinite(parsed) ? Math.min(1, Math.max(0, parsed)) : null,
    view: VIEWS.find((preset) => preset === view) ?? 'default',
    zoom: Number.isFinite(zoom) && zoom > 0 ? zoom : 1,
    focus:
      focus.length === 3 && focus.every((n) => Number.isFinite(n))
        ? [focus[0] ?? 0, focus[1] ?? 0, focus[2] ?? 0]
        : null,
  };
}
