import { describe, expect, it } from 'vitest';
import { resolveExerciseRef } from './exerciseRef.ts';
import type { Animation } from './schema/animation.ts';
import type { Exercise } from './schema/exercise.ts';
import type { CustomExercise } from './schema/userData.ts';
import { firstSlideOf, hasPicture, pictureSlides, type PictureExercise } from './workoutPicture.ts';

function catalogExercise(id: string, images: string[]): Exercise {
  return {
    id,
    name: id,
    primaryMuscles: ['chest'],
    secondaryMuscles: ['triceps'],
    images,
  } as Exercise;
}

const flyes = catalogExercise('dumbbell-flyes', [
  'images/dumbbell-flyes/0.webp',
  'images/dumbbell-flyes/1.webp',
]);
const bench = catalogExercise('barbell-bench-press-medium-grip', ['images/bench/0.webp']);
const benchAnimation = { durationSec: 3 } as Animation;
const landmine: CustomExercise = {
  id: 'c1',
  name: 'Landmine Press',
  notes: '',
  equipment: null,
  primaryMuscles: ['shoulders'],
  secondaryMuscles: [],
  instructions: [],
  createdAt: '2026-01-01T10:00:00.000Z',
  updatedAt: '2026-01-01T10:00:00.000Z',
};
const catalog = new Map([flyes, bench].map((exercise) => [exercise.id, exercise]));

function pictureExercise(
  ref: Parameters<typeof resolveExerciseRef>[0],
  marker: string | null = null,
): PictureExercise {
  const resolved = resolveExerciseRef(ref, (id) => catalog.get(id), [landmine]);
  const animation = resolved.exercise?.id === bench.id ? benchAnimation : null;
  return { marker, resolved, animation };
}

const refs = {
  flyes: { kind: 'catalog', exerciseId: flyes.id, name: 'Flyes' },
  bench: { kind: 'catalog', exerciseId: bench.id, name: 'Bench' },
  removed: { kind: 'catalog', exerciseId: 'removed-exercise', name: 'Removed' },
  landmine: { kind: 'custom', customExerciseId: 'c1', name: 'Landmine' },
} as const;

describe('pictureSlides', () => {
  it('shows an exercise without an animation, then its photos', () => {
    const slides = pictureSlides([pictureExercise(refs.flyes)]);
    expect(slides.map((slide) => slide.kind)).toEqual(['figure', 'photo', 'photo']);
    expect(slides[0]).toMatchObject({ exercise: flyes, animation: null, marker: null });
    expect(slides[2]).toMatchObject({ image: flyes.images[1], number: 2, count: 2 });
  });

  it('shows an animated exercise without photos', () => {
    const slides = pictureSlides([pictureExercise(refs.bench)]);
    expect(slides).toHaveLength(1);
    expect(slides[0]).toMatchObject({ kind: 'figure', animation: benchAnimation });
  });

  it('shows a custom exercise as the still figure with its muscles', () => {
    const slides = pictureSlides([pictureExercise(refs.landmine)]);
    expect(slides).toHaveLength(1);
    expect(slides[0]).toMatchObject({ kind: 'figure', exercise: landmine, animation: null });
  });

  it('has nothing to show for an exercise no longer in the catalog', () => {
    const slides = pictureSlides([pictureExercise(refs.removed)]);
    expect(slides).toMatchObject([{ kind: 'missing', name: 'Removed' }]);
    expect(hasPicture(slides)).toBe(false);
  });

  it("puts a superset's exercises one after the other", () => {
    const slides = pictureSlides([
      pictureExercise(refs.bench, 'A1'),
      pictureExercise(refs.flyes, 'A2'),
      pictureExercise(refs.removed, 'A3'),
    ]);
    expect(slides.map((slide) => [slide.marker, slide.kind])).toEqual([
      ['A1', 'figure'],
      ['A2', 'figure'],
      ['A2', 'photo'],
      ['A2', 'photo'],
      ['A3', 'missing'],
    ]);
    expect(new Set(slides.map((slide) => slide.key)).size).toBe(slides.length);
    expect(hasPicture(slides)).toBe(true);
    expect(firstSlideOf(slides, 1)).toBe(1);
    expect(firstSlideOf(slides, 2)).toBe(4);
    expect(firstSlideOf(slides, 7)).toBe(0);
  });
});
