import { describe, expect, it } from 'vitest';
import { resolveExerciseRef } from './exerciseRef.ts';
import type { Exercise } from './schema/exercise.ts';
import type { CustomExercise } from './schema/userData.ts';

const press = { id: 'lying-triceps-press', name: 'Lying Triceps Press' } as Exercise;
const find = (id: string) => (id === press.id ? press : undefined);
const custom: CustomExercise = {
  id: 'c1',
  name: 'Zercher walk',
  notes: '',
  equipment: null,
  primaryMuscles: [],
  secondaryMuscles: [],
  instructions: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

describe('resolveExerciseRef', () => {
  it('shows the current catalog name when the exercise exists', () => {
    const resolved = resolveExerciseRef(
      { kind: 'catalog', exerciseId: press.id, name: 'Skull crusher (old)' },
      find,
      [],
    );
    expect(resolved).toMatchObject({
      name: 'Lying Triceps Press',
      link: '#/exercises/lying-triceps-press',
      note: null,
    });
  });

  it('keeps the stored name with a note when the exercise left the catalog', () => {
    const resolved = resolveExerciseRef(
      { kind: 'catalog', exerciseId: 'zercher-squat', name: 'Zercher Squat' },
      find,
      [],
    );
    expect(resolved).toMatchObject({
      name: 'Zercher Squat',
      link: null,
      note: 'No longer in catalog',
    });
  });

  it('resolves custom exercises and deleted ones', () => {
    expect(
      resolveExerciseRef({ kind: 'custom', customExerciseId: 'c1', name: 'old' }, find, [custom]),
    ).toMatchObject({ name: 'Zercher walk', link: '#/custom/c1', note: null });
    expect(
      resolveExerciseRef({ kind: 'custom', customExerciseId: 'c2', name: 'Gone' }, find, [custom]),
    ).toMatchObject({ name: 'Gone', link: null, note: 'Custom exercise deleted' });
  });
});
