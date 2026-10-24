import { describe, expect, it } from 'vitest';
import { MemoryFiles } from '../../../tests/helpers/memoryFiles.ts';
import { emptyUserData, type UserData } from '../schema/userData.ts';
import { setUnit } from '../userData/settings.ts';
import { readWithFallback, writeFileAtomically } from './files.ts';
import {
  corruptFileName,
  loadUserDataFile,
  saveUserDataFile,
  UserDataUnreadableError,
} from './userDataFile.ts';

const NOW = new Date('2026-03-04T05:06:07.089Z');
const MAIN = 'openrep/userdata.json';
const TMP = 'openrep/userdata.json.tmp';
const CORRUPT = 'openrep/userdata.corrupt-2026-03-04T05-06-07-089Z.json';

function dataWithUnit(unit: 'kg' | 'lb'): UserData {
  return setUnit(emptyUserData(), unit);
}

describe('writeFileAtomically', () => {
  it('writes the temporary file, deletes the old file, then renames', async () => {
    const files = new MemoryFiles({ 'dir/a.json': 'old' });
    await writeFileAtomically(files, 'dir', 'a.json', 'new');
    expect(files.log).toEqual([
      'write dir/a.json.tmp',
      'remove dir/a.json',
      'rename dir/a.json.tmp dir/a.json',
    ]);
    expect(Object.fromEntries(files.files)).toEqual({ 'dir/a.json': 'new' });
  });

  it('skips the delete on the first write', async () => {
    const files = new MemoryFiles();
    await writeFileAtomically(files, 'dir', 'a.json', 'new');
    expect(files.log).toEqual(['write dir/a.json.tmp', 'rename dir/a.json.tmp dir/a.json']);
  });

  it('leaves the old file intact when writing the temporary file fails', async () => {
    const files = new MemoryFiles({ 'dir/a.json': 'old' });
    files.fail.write = () => true;
    await expect(writeFileAtomically(files, 'dir', 'a.json', 'new')).rejects.toThrow();
    const read = await readWithFallback(files, 'dir', 'a.json', (text) => text);
    expect(read).toEqual({ value: 'old', source: 'main', invalid: [] });
  });
});

describe('loadUserDataFile', () => {
  it('starts empty on first launch', async () => {
    const loaded = await loadUserDataFile(new MemoryFiles(), NOW);
    expect(loaded).toEqual({ data: emptyUserData(), corruptFile: null });
  });

  it('loads a file saved before the default rest existed with a default rest of 90 s', async () => {
    const { defaultRestSec: _defaultRestSec, ...settings } = dataWithUnit('lb').settings;
    const files = new MemoryFiles({ [MAIN]: JSON.stringify({ ...emptyUserData(), settings }) });
    const loaded = await loadUserDataFile(files, NOW);
    expect(loaded.data.settings).toEqual({ unit: 'lb', defaultRestSec: 90 });
    expect(loaded.corruptFile).toBeNull();
  });

  it('round-trips saved data', async () => {
    const files = new MemoryFiles();
    await saveUserDataFile(files, dataWithUnit('lb'));
    await saveUserDataFile(files, dataWithUnit('kg'));
    expect((await loadUserDataFile(files, NOW)).data).toEqual(dataWithUnit('kg'));
    expect([...files.files.keys()]).toEqual([MAIN]);
  });

  it('prefers the main file when a save was interrupted before the delete', async () => {
    const files = new MemoryFiles({
      [MAIN]: JSON.stringify(dataWithUnit('kg')),
      [TMP]: JSON.stringify(dataWithUnit('lb')),
    });
    expect(await loadUserDataFile(files, NOW)).toEqual({
      data: dataWithUnit('kg'),
      corruptFile: null,
    });
  });

  it('falls back to the temporary file when a save was interrupted before the rename', async () => {
    const files = new MemoryFiles({ [TMP]: JSON.stringify(dataWithUnit('lb')) });
    expect(await loadUserDataFile(files, NOW)).toEqual({
      data: dataWithUnit('lb'),
      corruptFile: null,
    });
    // The temporary file becomes the main file, so the next save does not write over the only copy.
    expect(Object.fromEntries(files.files)).toEqual({ [MAIN]: JSON.stringify(dataWithUnit('lb')) });
    await saveUserDataFile(files, dataWithUnit('kg'));
    expect([...files.files.keys()]).toEqual([MAIN]);
  });

  it('keeps the loaded copy when the next save is interrupted while writing', async () => {
    const files = new MemoryFiles({ [TMP]: JSON.stringify(dataWithUnit('lb')) });
    await loadUserDataFile(files, NOW);
    // The save dies while writing the temporary file, leaving it broken.
    files.fail.write = () => true;
    await expect(saveUserDataFile(files, dataWithUnit('kg'))).rejects.toThrow();
    files.files.set(TMP, '{"broken');
    files.fail.write = undefined;
    expect((await loadUserDataFile(files, NOW)).data).toEqual(dataWithUnit('lb'));
  });

  it('refuses to continue when the temporary file cannot be renamed', async () => {
    const files = new MemoryFiles({ [TMP]: JSON.stringify(dataWithUnit('lb')) });
    files.fail.rename = () => true;
    await expect(loadUserDataFile(files, NOW)).rejects.toBeInstanceOf(UserDataUnreadableError);
    expect(files.files.get(TMP)).toBe(JSON.stringify(dataWithUnit('lb')));
  });

  it('keeps a file that is not JSON as a corrupt copy and starts empty', async () => {
    const files = new MemoryFiles({ [MAIN]: '{"formatVersion": 1, "plans": [' });
    const loaded = await loadUserDataFile(files, NOW);
    expect(loaded).toEqual({ data: emptyUserData(), corruptFile: corruptFileName(NOW) });
    expect(Object.fromEntries(files.files)).toEqual({
      [CORRUPT]: '{"formatVersion": 1, "plans": [',
    });
  });

  it('treats schema-invalid data as corrupt and recovers the temporary file', async () => {
    const invalid = JSON.stringify({ ...dataWithUnit('kg'), settings: { unit: 'stone' } });
    const files = new MemoryFiles({ [MAIN]: invalid, [TMP]: JSON.stringify(dataWithUnit('lb')) });
    const loaded = await loadUserDataFile(files, NOW);
    expect(loaded).toEqual({ data: dataWithUnit('lb'), corruptFile: corruptFileName(NOW) });
    expect(Object.fromEntries(files.files)).toEqual({
      [CORRUPT]: invalid,
      [MAIN]: JSON.stringify(dataWithUnit('lb')),
    });
  });

  it('keeps both copies when both are corrupt', async () => {
    const files = new MemoryFiles({ [MAIN]: 'nope', [TMP]: 'also nope' });
    const loaded = await loadUserDataFile(files, NOW);
    expect(loaded.data).toEqual(emptyUserData());
    expect([...files.files.keys()].sort()).toEqual([
      'openrep/userdata.corrupt-2026-03-04T05-06-07-089Z-1.json',
      CORRUPT,
    ]);
  });

  it('treats a file that cannot be read as corrupt', async () => {
    const files = new MemoryFiles({ [MAIN]: JSON.stringify(dataWithUnit('lb')) });
    files.fail.read = () => true;
    const loaded = await loadUserDataFile(files, NOW);
    expect(loaded.corruptFile).toBe(corruptFileName(NOW));
  });

  it('refuses to continue when a corrupt file cannot be moved aside', async () => {
    const files = new MemoryFiles({ [MAIN]: 'nope' });
    files.fail.rename = () => true;
    await expect(loadUserDataFile(files, NOW)).rejects.toBeInstanceOf(UserDataUnreadableError);
    expect(files.files.get(MAIN)).toBe('nope');
  });
});
