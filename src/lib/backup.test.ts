import { describe, expect, it } from 'vitest';
import {
  backupFileName,
  createBackup,
  describeBackupProblem,
  describeBackupSummary,
  InvalidBackupError,
  parseBackup,
  serializeBackup,
  summarizeBackup,
  type BackupProblem,
} from './backup.ts';
import { emptyUserData, type UserData } from './schema/userData.ts';
import { createCustomExercise } from './userData/customExercises.ts';
import { addPlanExercise, createPlan } from './userData/plans.ts';
import { finishSession, startSession, updateLoggedSet } from './userData/sessions.ts';
import { setCatalogMeta, setDefaultRest, setUnit } from './userData/settings.ts';

const T0 = '2026-02-03T08:00:00.000Z';
const T1 = '2026-02-03T09:00:00.000Z';

/** User data with a plan, a custom exercise, a finished workout and lb as the unit. */
function richData(): UserData {
  let next = 0;
  const id = () => `id${next++}`;
  let data = createPlan(
    emptyUserData(),
    { id: 'p1', name: 'Strength', firstDay: { id: 'd1', name: 'Day A' } },
    T0,
  );
  data = createCustomExercise(
    data,
    'c1',
    {
      name: 'Zercher carry',
      notes: 'Elbows',
      equipment: 'barbell',
      primaryMuscles: ['quadriceps'],
      secondaryMuscles: [],
      instructions: ['Walk'],
    },
    T0,
  );
  data = addPlanExercise(
    data,
    'p1',
    'd1',
    {
      id: 'e1',
      exercise: { kind: 'catalog', exerciseId: 'barbell-squat', name: 'Barbell Squat' },
      target: { sets: 2, reps: '5', weightKg: 102.5, restSec: 180, notes: 'Belt' },
    },
    T0,
  );
  data = addPlanExercise(
    data,
    'p1',
    'd1',
    {
      id: 'e2',
      exercise: { kind: 'custom', customExerciseId: 'c1', name: 'Zercher carry' },
      target: { sets: 1, durationSec: 40 },
    },
    T0,
  );
  data = startSession(data, { sessionId: 's1', planId: 'p1', dayId: 'd1' }, T0, id);
  const exercise = data.sessions[0]?.exercises[0];
  data = updateLoggedSet(data, 's1', exercise?.id ?? '', exercise?.sets[0]?.id ?? '', {
    weightKg: 100.0109,
    reps: 5,
    done: true,
  });
  data = finishSession(data, 's1', T1);
  data = setUnit(data, 'lb');
  data = setDefaultRest(data, 120);
  return setCatalogMeta(data, { lastCheckedAt: T1 });
}

function problemOf(text: string): BackupProblem | null {
  try {
    parseBackup(text);
    return null;
  } catch (error) {
    if (error instanceof InvalidBackupError) return error.problem;
    throw error;
  }
}

describe('backup', () => {
  it('round-trips all user data exactly', () => {
    const data = richData();
    const text = serializeBackup(createBackup(data, T1));
    const restored = parseBackup(text);
    expect(restored).toEqual({
      app: 'openrep',
      kind: 'backup',
      formatVersion: 1,
      exportedAt: T1,
      data,
    });
    expect(restored.data).toEqual(data);
    expect(restored.data.settings.defaultRestSec).toBe(120);
  });

  it('restores a backup made before the default rest existed with a default rest of 90 s', () => {
    const backup = createBackup(richData(), T1);
    const { defaultRestSec: _defaultRestSec, ...settings } = backup.data.settings;
    const text = serializeBackup({ ...backup, data: { ...backup.data, settings } as UserData });
    expect(parseBackup(text).data.settings).toEqual({ unit: 'lb', defaultRestSec: 90 });
  });

  it('accepts a file with a byte order mark', () => {
    const text = `\uFEFF${serializeBackup(createBackup(emptyUserData(), T0))}`;
    expect(parseBackup(text).data).toEqual(emptyUserData());
  });

  it('rejects files that are not JSON, including truncated (corrupted) backups', () => {
    const text = serializeBackup(createBackup(richData(), T1));
    expect(problemOf('hello, I am a text file')).toBe('not-json');
    expect(problemOf('')).toBe('not-json');
    expect(problemOf(text.slice(0, text.length / 2))).toBe('not-json');
    expect(problemOf('\u0000\u0001PNG')).toBe('not-json');
  });

  it('rejects JSON that is not an OpenRep backup', () => {
    expect(problemOf('[]')).toBe('not-backup');
    expect(problemOf('null')).toBe('not-backup');
    expect(problemOf('{"formatVersion":1}')).toBe('not-backup');
    const catalogLike = JSON.stringify({ ...createBackup(emptyUserData(), T0), app: 'other' });
    expect(problemOf(catalogLike)).toBe('not-backup');
  });

  it('rejects backups from a newer format version', () => {
    const newer = JSON.stringify({ ...createBackup(emptyUserData(), T0), formatVersion: 2 });
    expect(problemOf(newer)).toBe('newer-version');
  });

  it('rejects damaged backup content', () => {
    const backup = createBackup(richData(), T1);
    const broken = [
      { ...backup, data: { ...backup.data, plans: 'none' } },
      { ...backup, data: undefined },
      { ...backup, exportedAt: 'yesterday' },
      { ...backup, data: { ...backup.data, settings: { unit: 'stone' } } },
      {
        ...backup,
        data: {
          ...backup.data,
          sessions: [{ ...backup.data.sessions[0], exercises: [{ id: 'x' }] }],
        },
      },
    ];
    for (const value of broken) expect(problemOf(JSON.stringify(value))).toBe('invalid');
  });

  it('describes every problem', () => {
    const problems: BackupProblem[] = [
      'too-large',
      'not-json',
      'not-backup',
      'newer-version',
      'invalid',
    ];
    for (const problem of problems) expect(describeBackupProblem(problem)).toMatch(/\.$/);
  });

  it('names the file after the local date', () => {
    expect(backupFileName(new Date(2026, 0, 5, 23, 59))).toBe('openrep-backup-2026-01-05.json');
  });

  it('summarises what a backup holds', () => {
    const summary = summarizeBackup(richData());
    expect(summary).toEqual({ plans: 1, customExercises: 1, sessions: 1 });
    expect(describeBackupSummary(summary)).toBe('1 plan, 1 custom exercise and 1 workout');
    expect(describeBackupSummary({ plans: 2, customExercises: 0, sessions: 14 })).toBe(
      '2 plans, 0 custom exercises and 14 workouts',
    );
  });
});
