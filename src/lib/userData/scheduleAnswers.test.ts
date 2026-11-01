import { describe, expect, it } from 'vitest';
import { createBackup, parseBackup, serializeBackup } from '../backup.ts';
import { emptyUserData, userDataSchema } from '../schema/userData.ts';
import { emptyScheduleAnswers, setScheduleAnswers } from './scheduleAnswers.ts';

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
