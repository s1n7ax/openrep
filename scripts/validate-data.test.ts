import { execFile } from 'node:child_process';
import { cp, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { REPO_ROOT } from './lib/paths.ts';

const run = promisify(execFile);
const FIXTURES = path.join(REPO_ROOT, 'tests/fixtures/data');
const TSX = path.join(REPO_ROOT, 'node_modules/.bin/tsx');
const SCRIPT = path.join(REPO_ROOT, 'scripts/validate-data.ts');

describe('validate-data script', () => {
  let dataDir: string;

  beforeAll(async () => {
    dataDir = await mkdtemp(path.join(tmpdir(), 'openrep-validate-'));
    await cp(path.join(FIXTURES, 'valid'), dataDir, { recursive: true });
  });

  afterAll(async () => {
    await rm(dataDir, { recursive: true, force: true });
  });

  it('exits 0 for valid data', async () => {
    const { stdout } = await run(TSX, [SCRIPT, '--data', dataDir]);
    expect(stdout).toContain('Data is valid: 2 exercises, 1 animations, 1 schedules.');
  });

  it('exits 0 when a schedule with a superset is added', async () => {
    await cp(
      path.join(FIXTURES, 'superset-schedule.json'),
      path.join(dataDir, 'schedules/superset-schedule.json'),
    );
    const { stdout } = await run(TSX, [SCRIPT, '--data', dataDir]);
    expect(stdout).toContain('Data is valid: 2 exercises, 1 animations, 2 schedules.');
  });

  it('exits 1 and names the file when a malformed exercise is added', async () => {
    await cp(
      path.join(FIXTURES, 'malformed-exercise.json'),
      path.join(dataDir, 'exercises/malformed-exercise.json'),
    );
    const error = await run(TSX, [SCRIPT, '--data', dataDir]).then(
      () => null,
      (e: { code: number; stderr: string }) => e,
    );
    expect(error?.code).toBe(1);
    expect(error?.stderr).toMatch(/exercises\/malformed-exercise\.json: id: must be kebab-case/);
  });
});
