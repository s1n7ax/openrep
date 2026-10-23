import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { beforeAll, describe, expect, it } from 'vitest';
import { readDataDir } from '../../../scripts/lib/data-dir.ts';
import { formatIssuePath, validateData, type DataSet } from './validate.ts';

const FIXTURES = path.resolve(import.meta.dirname, '../../../tests/fixtures/data');

let valid: DataSet;
let malformedExercise: string;
let supersetSchedule: string;

beforeAll(async () => {
  valid = await readDataDir(path.join(FIXTURES, 'valid'));
  malformedExercise = await readFile(path.join(FIXTURES, 'malformed-exercise.json'), 'utf8');
  supersetSchedule = await readFile(path.join(FIXTURES, 'superset-schedule.json'), 'utf8');
});

function withFile(kind: 'exercises' | 'animations' | 'schedules', name: string, content: unknown) {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  return { ...valid, [kind]: [...valid[kind], { path: `${kind}/${name}`, content: text }] };
}

function messagesFor(set: DataSet, file: string): string[] {
  return validateData(set)
    .issues.filter((issue) => issue.file === file)
    .map((issue) => issue.message);
}

function readJson(kind: 'exercises' | 'animations' | 'schedules', file: string) {
  const entry = valid[kind].find((f) => f.path === `${kind}/${file}`);
  expect(entry, `fixture ${kind}/${file}`).toBeDefined();
  return JSON.parse(entry?.content ?? '{}') as Record<string, unknown>;
}

describe('validateData', () => {
  it('accepts the valid fixture', () => {
    const result = validateData(valid);
    expect(result.issues).toEqual([]);
    expect(result.data.exercises.map((e) => e.id)).toEqual(['sample-plank', 'sample-push-up']);
    expect(result.data.animations.map((a) => a.exerciseId)).toEqual(['sample-push-up']);
    expect(result.data.schedules.map((s) => s.id)).toEqual(['sample-schedule']);
  });

  it('rejects the malformed exercise fixture with a reason per problem', () => {
    const messages = messagesFor(
      withFile('exercises', 'malformed-exercise.json', malformedExercise),
      'exercises/malformed-exercise.json',
    );
    expect(messages).toEqual(
      expect.arrayContaining([
        expect.stringMatching(/^id: must be kebab-case/),
        expect.stringMatching(/^name: /),
        expect.stringMatching(/^equipment: /),
        expect.stringMatching(/^primaryMuscles: /),
        expect.stringMatching(/^secondaryMuscles\[0\]: /),
      ]),
    );
  });

  it('reports invalid JSON and non-JSON files', () => {
    expect(messagesFor(withFile('exercises', 'broken.json', '{ "id": '), 'exercises/broken.json')).toEqual(
      [expect.stringMatching(/^invalid JSON: /)],
    );
    expect(messagesFor(withFile('schedules', 'notes.txt', 'hello'), 'schedules/notes.txt')).toEqual([
      'unexpected file: only .json files belong in this folder',
    ]);
  });

  it('requires the file name to equal the id', () => {
    const exercise = { ...readJson('exercises', 'sample-plank.json'), id: 'other-plank' };
    expect(messagesFor(withFile('exercises', 'sample-side-plank.json', exercise), 'exercises/sample-side-plank.json')).toEqual([
      'file name must be "other-plank.json" to match id "other-plank"',
    ]);
  });

  it('requires unique ids', () => {
    const duplicate = readJson('exercises', 'sample-plank.json');
    const issues = validateData(withFile('exercises', 'zz-copy.json', duplicate)).issues;
    expect(issues).toContainEqual({
      file: 'exercises/zz-copy.json',
      message: 'id "sample-plank" is already used by exercises/sample-plank.json',
    });
  });

  it('requires image files to exist', () => {
    const set = { ...valid, images: [] };
    expect(messagesFor(set, 'exercises/sample-push-up.json')).toEqual([
      'images[0]: file not found: images/sample-push-up/0.webp',
    ]);
  });

  it('requires animations and schedules to reference existing exercises', () => {
    const animation = { ...readJson('animations', 'sample-push-up.json'), exerciseId: 'ghost' };
    expect(messagesFor(withFile('animations', 'ghost.json', animation), 'animations/ghost.json')).toEqual([
      'exerciseId: no exercise with id "ghost"',
    ]);

    const schedule = readJson('schedules', 'sample-schedule.json');
    const days = [{ name: 'Day', exercises: [{ exerciseId: 'ghost', sets: 3, reps: '5' }] }];
    const set = withFile('schedules', 'ghost-schedule.json', { ...schedule, id: 'ghost-schedule', days });
    expect(messagesFor(set, 'schedules/ghost-schedule.json')).toEqual([
      'days[0].exercises[0].exerciseId: no exercise with id "ghost"',
    ]);
  });
});

describe('validateData with supersets', () => {
  it('accepts a version 2 schedule with a superset next to version 1 schedules', () => {
    const result = validateData(withFile('schedules', 'superset-schedule.json', supersetSchedule));
    expect(result.issues).toEqual([]);
    expect(result.data.schedules.map((s) => [s.id, s.formatVersion])).toEqual([
      ['sample-schedule', 1],
      ['superset-schedule', 2],
    ]);
  });

  it('requires the exercises of a superset to exist', () => {
    const schedule = JSON.parse(supersetSchedule) as { days: { exercises: unknown[] }[] };
    const days = [
      {
        name: 'Day',
        exercises: [
          {
            superset: {
              rounds: 3,
              exercises: [
                { exerciseId: 'sample-plank', durationSec: 30 },
                { exerciseId: 'ghost', reps: '8' },
              ],
            },
          },
        ],
      },
    ];
    const set = withFile('schedules', 'superset-schedule.json', { ...schedule, days });
    expect(messagesFor(set, 'schedules/superset-schedule.json')).toEqual([
      'days[0].exercises[0].superset.exercises[1].exerciseId: no exercise with id "ghost"',
    ]);
  });

  it('reports what is wrong with a superset', () => {
    const schedule = JSON.parse(supersetSchedule) as Record<string, unknown>;
    const superset = (rounds: number, exercises: unknown[]) => ({
      ...schedule,
      days: [{ name: 'Day', exercises: [{ superset: { rounds, exercises } }] }],
    });
    const push = { exerciseId: 'sample-push-up', reps: '8' };
    const file = 'schedules/superset-schedule.json';
    expect(
      messagesFor(withFile('schedules', 'superset-schedule.json', superset(3, [push])), file),
    ).toEqual([
      'days[0].exercises[0].superset.exercises: Too small: expected array to have >=2 items',
    ]);
    expect(
      messagesFor(
        withFile('schedules', 'superset-schedule.json', superset(21, [push, push])),
        file,
      ),
    ).toEqual(['days[0].exercises[0].superset.rounds: Too big: expected number to be <=20']);
    const withSets = superset(3, [{ ...push, sets: 3 }, push]);
    expect(messagesFor(withFile('schedules', 'superset-schedule.json', withSets), file)).toEqual([
      'days[0].exercises[0].superset.exercises[0]: Unrecognized key: "sets"',
    ]);
  });

  it('keeps version 1 schedules free of supersets', () => {
    const schedule = { ...JSON.parse(supersetSchedule), formatVersion: 1 };
    const messages = messagesFor(
      withFile('schedules', 'superset-schedule.json', schedule),
      'schedules/superset-schedule.json',
    );
    expect(messages.length).toBeGreaterThan(0);
    expect(messages[0]).toMatch(/^days\[0\]\.exercises\[0\]/);
  });
});

describe('formatIssuePath', () => {
  it('formats nested paths', () => {
    expect(formatIssuePath(['days', 0, 'exercises', 1, 'reps'])).toBe('days[0].exercises[1].reps');
    expect(formatIssuePath([])).toBe('');
  });
});
