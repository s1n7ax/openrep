import { describe, expect, it } from 'vitest';
import { mergeAliases, toExercise, toKebabId, type UpstreamExercise } from './free-exercise-db.ts';

describe('toKebabId', () => {
  it.each([
    ['3_4_Sit-Up', '3-4-sit-up'],
    ['Barbell_Bench_Press_-_Medium_Grip', 'barbell-bench-press-medium-grip'],
    ['Dips_-_Triceps_Version', 'dips-triceps-version'],
    ['Pushups', 'pushups'],
  ])('converts %s to %s', (upstream, expected) => {
    expect(toKebabId(upstream)).toBe(expected);
  });
});

describe('mergeAliases', () => {
  it('drops duplicates, blanks and the name itself, keeping first spelling', () => {
    expect(
      mergeAliases('Crunches', ['crunch', ' Crunch ', 'crunches', ''], ['ab crunch', 'Crunch']),
    ).toEqual(['crunch', 'ab crunch']);
  });
});

describe('toExercise', () => {
  const upstream: UpstreamExercise = {
    id: 'Clean_And_Press',
    name: 'Clean and Press ',
    force: 'push',
    level: 'expert',
    mechanic: 'compound',
    equipment: 'barbell',
    primaryMuscles: ['shoulders'],
    secondaryMuscles: ['shoulders', 'triceps', 'triceps'],
    instructions: ['  Step one. ', '', 'Step two.'],
    category: 'olympic weightlifting',
    images: ['Clean_And_Press/0.jpg'],
  };

  it('builds a valid v1 exercise and cleans upstream quirks', () => {
    expect(toExercise(upstream, ['clean & press'], ['images/clean-and-press/0.webp'])).toEqual({
      formatVersion: 1,
      id: 'clean-and-press',
      name: 'Clean and Press',
      aliases: ['clean & press'],
      category: 'olympic weightlifting',
      level: 'expert',
      force: 'push',
      mechanic: 'compound',
      equipment: 'barbell',
      primaryMuscles: ['shoulders'],
      secondaryMuscles: ['triceps'],
      instructions: ['Step one.', 'Step two.'],
      images: ['images/clean-and-press/0.webp'],
      source: { name: 'free-exercise-db', id: 'Clean_And_Press' },
    });
  });
});
