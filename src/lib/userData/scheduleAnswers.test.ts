import { describe, expect, it } from 'vitest';
import { createBackup, parseBackup, serializeBackup } from '../backup.ts';
import { emptyUserData, userDataSchema } from '../schema/userData.ts';
import {
  emptyScheduleAnswers,
  readScheduleAnswers,
  setScheduleAnswers,
} from './scheduleAnswers.ts';

const T0 = '2026-01-01T10:00:00.000Z';

describe('setScheduleAnswers', () => {
  it('stores the answers', () => {
    const answers = { ...emptyScheduleAnswers(), goal: 'Lose fat' };
    const data = setScheduleAnswers(emptyUserData(), answers);
    expect(data.scheduleAnswers).toEqual(answers);
    expect(userDataSchema.safeParse(data).success).toBe(true);
  });

  it('changes nothing when opening the form changes nothing', () => {
    const data = emptyUserData();
    expect(setScheduleAnswers(data, emptyScheduleAnswers())).toBe(data);
    const answered = setScheduleAnswers(data, { ...emptyScheduleAnswers(), age: '31' });
    expect(setScheduleAnswers(answered, { ...emptyScheduleAnswers(), age: '31' })).toBe(answered);
  });
});

describe('readScheduleAnswers', () => {
  const plan = {
    id: 'p1',
    name: 'PPL',
    days: [{ id: 'd1', name: 'Push', exercises: [] }],
    createdAt: T0,
    updatedAt: T0,
  };

  it('gives empty answers before the creator is first used', () => {
    expect(readScheduleAnswers(emptyUserData())).toEqual(emptyScheduleAnswers());
  });

  it('moves exercises typed into the first version of the form into the lists', () => {
    const data = setScheduleAnswers(emptyUserData(), {
      ...emptyScheduleAnswers(),
      includeExercises: ' Deadlifts, pull-ups ',
      avoidExercises: 'Burpees',
      includeList: [{ exerciseId: 'pushups', name: 'Pushups' }],
    });
    const answers = readScheduleAnswers(data);
    expect(answers.includeList).toEqual([
      { exerciseId: 'pushups', name: 'Pushups' },
      { name: 'Deadlifts, pull-ups' },
    ]);
    expect(answers.avoidList).toEqual([{ name: 'Burpees' }]);
    expect(answers.includeExercises).toBe('');
    expect(answers.avoidExercises).toBe('');
  });

  it('keeps the plan to build on while it exists', () => {
    const data = {
      ...setScheduleAnswers(emptyUserData(), { ...emptyScheduleAnswers(), basePlanId: 'p1' }),
      plans: [plan],
    };
    expect(readScheduleAnswers(data).basePlanId).toBe('p1');
    expect(readScheduleAnswers({ ...data, plans: [] }).basePlanId).toBeNull();
    // A plan file needs a day, so a plan without one is nothing to build on.
    expect(readScheduleAnswers({ ...data, plans: [{ ...plan, days: [] }] }).basePlanId).toBeNull();
  });

  it('reads answers saved by the first version of the form', () => {
    const firstVersion = {
      equipment: ['dumbbell'],
      goal: 'Lose fat',
      injuries: '',
      daysPerWeek: '3',
      sessionMinutes: '45',
      weekLayout: '',
      split: '',
      supersets: '',
      experience: 'Under 1 year',
      strengthLevel: '',
      bodyWeightKg: null,
      targetWeightKg: null,
      age: '',
      sex: '',
      height: '',
      avoidExercises: '',
      includeExercises: '',
      priorityMuscles: [],
      otherSports: 'Volleyball',
      notes: '',
    };
    const data = userDataSchema.parse({ ...emptyUserData(), scheduleAnswers: firstVersion });
    expect(readScheduleAnswers(data)).toEqual({
      ...emptyScheduleAnswers(),
      ...firstVersion,
      equipment: ['dumbbell'],
    });
  });
});

describe('backups', () => {
  it('carry the answers', () => {
    const answers = { ...emptyScheduleAnswers(), injuries: 'Left knee', bodyWeightKg: 80 };
    const data = setScheduleAnswers(emptyUserData(), answers);
    const restored = parseBackup(serializeBackup(createBackup(data, T0))).data;
    expect(restored.scheduleAnswers).toEqual(answers);
  });

  it('from before the creator existed still restore', () => {
    const restored = parseBackup(serializeBackup(createBackup(emptyUserData(), T0))).data;
    expect(restored.scheduleAnswers).toBeUndefined();
  });
});
