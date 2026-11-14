import { describe, expect, it } from 'vitest';
import { createBackup, parseBackup, serializeBackup } from '../backup.ts';
import type { Equipment } from '../schema/common.ts';
import type { Exercise } from '../schema/exercise.ts';
import {
  emptyUserData,
  userDataSchema,
  type Plan,
  type ScheduleAnswers,
} from '../schema/userData.ts';
import {
  emptyScheduleAnswers,
  planEquipment,
  readScheduleAnswers,
  setScheduleAnswers,
  withBasePlan,
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

/** A plan with one day per entry, each day doing the given catalog exercises. */
function planOf(id: string, days: string[][]): Plan {
  return {
    id,
    name: id,
    createdAt: T0,
    updatedAt: T0,
    days: days.map((ids, day) => ({
      id: `${id}-d${day}`,
      name: `Day ${day + 1}`,
      exercises: ids.map((exerciseId) => ({
        id: `${id}-${day}-${exerciseId}`,
        exercise: { kind: 'catalog' as const, exerciseId, name: exerciseId },
        sets: 3,
        reps: '8',
      })),
    })),
  };
}

const EQUIPMENT_OF: Record<string, Equipment | null> = {
  'barbell-squat': 'barbell',
  'dumbbell-press': 'dumbbell',
  'cable-row': 'cable',
  pushups: 'body only',
  'calf-stretch': null,
};
const byId = (id: string) =>
  id in EQUIPMENT_OF ? ({ id, equipment: EQUIPMENT_OF[id] } as Exercise) : undefined;

describe('planEquipment', () => {
  it('gives the equipment its catalog exercises use, in catalog order', () => {
    const plan = planOf('p', [
      ['dumbbell-press', 'pushups'],
      ['barbell-squat', 'calf-stretch', 'not-in-catalog'],
    ]);
    plan.days[0]!.exercises.push({
      id: 'custom',
      exercise: { kind: 'custom', customExerciseId: 'c1', name: 'Landmine Press' },
      sets: 3,
      reps: '8',
    });
    expect(planEquipment(plan, byId)).toEqual(['barbell', 'dumbbell']);
  });
});

describe('withBasePlan', () => {
  const ppl = planOf('ppl', [['barbell-squat'], ['dumbbell-press'], ['pushups']]);
  const upper = planOf('upper', [['cable-row'], ['dumbbell-press'], ['pushups'], ['pushups']]);
  const plans = [ppl, upper];
  const pick = (answers: Partial<ScheduleAnswers>, planId: string | null) =>
    withBasePlan({ ...emptyScheduleAnswers(), ...answers }, plans, planId, byId);

  it('fills in the plan’s days per week and equipment on a fresh form', () => {
    expect(pick({}, 'ppl')).toMatchObject({
      basePlanId: 'ppl',
      daysPerWeek: '3',
      equipment: ['barbell', 'dumbbell'],
    });
  });

  it('switches them to the next plan picked, and clears them when starting fresh', () => {
    const first = pick({}, 'ppl');
    expect(withBasePlan(first, plans, 'upper', byId)).toMatchObject({
      basePlanId: 'upper',
      daysPerWeek: '4',
      equipment: ['cable', 'dumbbell'],
    });
    expect(withBasePlan(first, plans, null, byId)).toMatchObject({
      basePlanId: null,
      daysPerWeek: '',
      equipment: [],
    });
  });

  it('keeps the answers the user chose', () => {
    const chosen = { daysPerWeek: '5', equipment: ['kettlebells'] as Equipment[] };
    expect(pick(chosen, 'ppl')).toMatchObject({ basePlanId: 'ppl', ...chosen });
    const changed = { ...pick({}, 'ppl'), daysPerWeek: '2' };
    expect(withBasePlan(changed, plans, 'upper', byId)).toMatchObject({
      daysPerWeek: '2',
      equipment: ['cable', 'dumbbell'],
    });
  });

  it('leaves days per week alone for a plan with more days than a week has', () => {
    const long = planOf(
      'long',
      Array.from({ length: 8 }, () => ['pushups']),
    );
    expect(withBasePlan(emptyScheduleAnswers(), [long], 'long', byId).daysPerWeek).toBe('');
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
