import { describe, expect, it } from 'vitest';
import { animationSchema, type Animation } from './animation';
import { backupSchema } from './backup';
import { repsSchema } from './common';
import { exerciseSchema, type Exercise } from './exercise';
import { scheduleSchema, type Schedule } from './schedule';
import { emptyUserData, userDataSchema } from './userData';

const exercise: Exercise = {
  formatVersion: 1,
  id: 'lying-triceps-press',
  name: 'Lying Triceps Press',
  aliases: ['skull crusher'],
  category: 'strength',
  level: 'intermediate',
  force: 'push',
  mechanic: 'isolation',
  equipment: 'e-z curl bar',
  primaryMuscles: ['triceps'],
  secondaryMuscles: [],
  instructions: ['Lie on a flat bench.'],
  images: ['images/lying-triceps-press/0.webp'],
  source: { name: 'free-exercise-db', id: 'Lying_Triceps_Press' },
};

const animation: Animation = {
  formatVersion: 1,
  exerciseId: 'pushups',
  durationSec: 2,
  props: [{ type: 'mat', attach: 'none' }],
  keyframes: [
    {
      t: 0,
      pose: {
        pelvis: { position: [0, 0.4, 0], rotation: [90, 0, 0] },
        leftHand: { target: [-0.2, 0, 0.5] },
      },
    },
    {
      t: 1,
      pose: {
        pelvis: { position: [0, 0.4, 0], rotation: [90, 0, 0] },
        leftHand: { target: [-0.2, 0, 0.5], pole: [-0.5, 0.3, 0.4] },
      },
    },
  ],
};

const schedule: Schedule = {
  formatVersion: 1,
  id: 'test-schedule',
  name: 'Test',
  description: 'A test schedule.',
  days: [{ name: 'Day A', exercises: [{ exerciseId: 'pushups', sets: 3, reps: '8-12' }] }],
};

function messages(result: { success: boolean; error?: { issues: { message: string }[] } }) {
  return result.error?.issues.map((issue) => issue.message) ?? [];
}

describe('repsSchema', () => {
  it.each(['8', '12', '8-12', '100'])('accepts %s', (value) => {
    expect(repsSchema.safeParse(value).success).toBe(true);
  });
  it.each(['', '0', '08', '12-8', '8-8', '8 - 12', 'ten', '1000'])('rejects %j', (value) => {
    expect(repsSchema.safeParse(value).success).toBe(false);
  });
});

describe('exerciseSchema', () => {
  it('accepts a valid exercise', () => {
    expect(exerciseSchema.safeParse(exercise).success).toBe(true);
  });
  it('requires a primary muscle', () => {
    expect(exerciseSchema.safeParse({ ...exercise, primaryMuscles: [] }).success).toBe(false);
  });
  it('rejects a muscle that is both primary and secondary', () => {
    const result = exerciseSchema.safeParse({ ...exercise, secondaryMuscles: ['triceps'] });
    expect(messages(result)).toContain('muscle is both primary and secondary: triceps');
  });
  it('rejects unknown fields, muscles, ids and image paths', () => {
    expect(exerciseSchema.safeParse({ ...exercise, extra: 1 }).success).toBe(false);
    expect(exerciseSchema.safeParse({ ...exercise, primaryMuscles: ['toes'] }).success).toBe(false);
    expect(exerciseSchema.safeParse({ ...exercise, id: 'Lying_Triceps' }).success).toBe(false);
    expect(exerciseSchema.safeParse({ ...exercise, images: ['../secret.webp'] }).success).toBe(
      false,
    );
  });
  it('rejects an alias equal to the name', () => {
    expect(
      exerciseSchema.safeParse({ ...exercise, aliases: ['lying triceps press'] }).success,
    ).toBe(false);
  });
  it('accepts a community exercise without an upstream id', () => {
    const community = { ...exercise, source: { name: 'community' } };
    expect(exerciseSchema.safeParse(community).success).toBe(true);
  });
});

describe('animationSchema', () => {
  it('accepts a valid animation', () => {
    expect(animationSchema.safeParse(animation).success).toBe(true);
  });
  it('requires keyframes from t = 0 to t = 1, strictly increasing', () => {
    const [first, last] = animation.keyframes;
    const middle = { ...first!, t: 0.5 };
    expect(
      animationSchema.safeParse({ ...animation, keyframes: [{ ...first!, t: 0.1 }, last] }).success,
    ).toBe(false);
    expect(
      animationSchema.safeParse({ ...animation, keyframes: [first, { ...last!, t: 0.9 }] }).success,
    ).toBe(false);
    expect(
      animationSchema.safeParse({ ...animation, keyframes: [first, middle, middle, last] }).success,
    ).toBe(false);
    expect(
      animationSchema.safeParse({ ...animation, keyframes: [first, middle, last] }).success,
    ).toBe(true);
  });
  it('rejects a limb driven by both IK and FK', () => {
    const [first, last] = animation.keyframes;
    const mixed = { ...first!, pose: { ...first!.pose, leftElbow: [0, 0, 90] } };
    expect(animationSchema.safeParse({ ...animation, keyframes: [mixed, last] }).success).toBe(
      false,
    );
  });
  it('requires an IK target in every keyframe once one keyframe uses it', () => {
    const [first, last] = animation.keyframes;
    const withoutTarget = { ...last!, pose: { pelvis: last!.pose.pelvis } };
    expect(
      animationSchema.safeParse({ ...animation, keyframes: [first, withoutTarget] }).success,
    ).toBe(false);
  });
  it('rejects unknown prop types', () => {
    const props = [{ type: 'treadmill', attach: 'none' }];
    expect(animationSchema.safeParse({ ...animation, props }).success).toBe(false);
  });
});

describe('scheduleSchema', () => {
  it('accepts a valid schedule', () => {
    expect(scheduleSchema.safeParse(schedule).success).toBe(true);
  });
  it('accepts a name-only entry with a duration', () => {
    const days = [{ name: 'Day', exercises: [{ name: 'Wall sit', sets: 2, durationSec: 45 }] }];
    expect(scheduleSchema.safeParse({ ...schedule, days }).success).toBe(true);
  });
  it('requires an exercise id or a name', () => {
    const days = [{ name: 'Day', exercises: [{ sets: 3, reps: '8' }] }];
    expect(scheduleSchema.safeParse({ ...schedule, days }).success).toBe(false);
  });
  it('requires exactly one of reps and durationSec', () => {
    const both = [{ name: 'Day', exercises: [{ name: 'X', sets: 3, reps: '8', durationSec: 30 }] }];
    const neither = [{ name: 'Day', exercises: [{ name: 'X', sets: 3 }] }];
    expect(scheduleSchema.safeParse({ ...schedule, days: both }).success).toBe(false);
    expect(scheduleSchema.safeParse({ ...schedule, days: neither }).success).toBe(false);
  });
  it('limits sets to 1-20', () => {
    const days = [{ name: 'Day', exercises: [{ name: 'X', sets: 21, reps: '8' }] }];
    expect(scheduleSchema.safeParse({ ...schedule, days }).success).toBe(false);
  });
});

describe('userDataSchema and backupSchema', () => {
  it('accepts empty user data and a backup of it', () => {
    const data = emptyUserData();
    expect(userDataSchema.parse(data)).toEqual(data);
    const backup = {
      app: 'openrep',
      kind: 'backup',
      formatVersion: 1,
      exportedAt: '2026-10-22T10:00:00.000Z',
      data,
    };
    expect(backupSchema.parse(backup)).toEqual(backup);
  });
  it('rejects a backup of another app or with broken data', () => {
    const data = emptyUserData();
    const base = { kind: 'backup', formatVersion: 1, exportedAt: '2026-10-22T10:00:00.000Z' };
    expect(backupSchema.safeParse({ ...base, app: 'other', data }).success).toBe(false);
    expect(
      backupSchema.safeParse({ ...base, app: 'openrep', data: { ...data, plans: 'x' } }).success,
    ).toBe(false);
  });
});
