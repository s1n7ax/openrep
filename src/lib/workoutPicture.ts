/**
 * The picture on top of a workout page, swiped sideways through its slides:
 * per exercise its 3D view (animated, or a still figure with the muscles
 * glowing), then its photos when it has no animation. A superset's page has
 * the slides of each of its exercises in turn.
 */
import type { ResolvedExercise } from './exerciseRef.ts';
import type { Animation } from './schema/animation.ts';
import type { Muscle } from './schema/common.ts';

/** An exercise of a workout page, resolved, with its animation (null for none). */
export interface PictureExercise {
  /** "A1" for an exercise of a superset, else null. */
  marker: string | null;
  resolved: ResolvedExercise;
  animation: Animation | null;
}

interface SlideBase {
  /** Unique among the page's slides. */
  key: string;
  /** Position of the slide's exercise among the page's exercises. */
  member: number;
  marker: string | null;
  name: string;
}

export type PictureSlide =
  | (SlideBase & {
      kind: 'figure';
      /** The catalog or custom exercise itself (the same object while it is unchanged). */
      exercise: {
        name: string;
        primaryMuscles: readonly Muscle[];
        secondaryMuscles: readonly Muscle[];
      };
      animation: Animation | null;
    })
  | (SlideBase & { kind: 'photo'; image: string; number: number; count: number })
  /** An exercise no longer in the catalog (or a deleted custom one): no 3D view. */
  | (SlideBase & { kind: 'missing' });

/**
 * The slides of a page's exercises. Catalog exercises show their 3D view,
 * followed by their photos when they have no animation; custom exercises the
 * still figure with their muscles.
 */
export function pictureSlides(exercises: readonly PictureExercise[]): PictureSlide[] {
  return exercises.flatMap(({ marker, resolved, animation }, member): PictureSlide[] => {
    const base = { member, marker, name: resolved.name };
    const exercise = resolved.exercise ?? resolved.custom;
    if (!exercise) return [{ ...base, key: `${member}-missing`, kind: 'missing' }];
    const figure: PictureSlide = {
      ...base,
      key: `${member}-figure`,
      kind: 'figure',
      exercise,
      animation: resolved.exercise ? animation : null,
    };
    if (!resolved.exercise || animation) return [figure];
    const { images } = resolved.exercise;
    return [
      figure,
      ...images.map((image, index): PictureSlide => ({
        ...base,
        key: `${member}-photo-${image}`,
        kind: 'photo',
        image,
        number: index + 1,
        count: images.length,
      })),
    ];
  });
}

/** Whether the slides show anything: not when every exercise is missing. */
export function hasPicture(slides: readonly PictureSlide[]): boolean {
  return slides.some((slide) => slide.kind !== 'missing');
}

/** Index of the first slide of the page's exercise at `member` (0 when there is none). */
export function firstSlideOf(slides: readonly PictureSlide[], member: number): number {
  return Math.max(
    0,
    slides.findIndex((slide) => slide.member === member),
  );
}
