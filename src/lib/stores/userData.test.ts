import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MemoryFiles } from '../../../tests/helpers/memoryFiles.ts';
import { emptyUserData, type UserData } from '../schema/userData.ts';

const MAIN = 'openrep/userdata.json';

/** A fresh store (the module keeps one instance). */
async function freshStore() {
  vi.resetModules();
  return (await import('./userData.svelte.ts')).userData;
}

function dataWithUnit(unit: 'kg' | 'lb'): UserData {
  return { ...emptyUserData(), settings: { ...emptyUserData().settings, unit } };
}

describe('userData.replaceAll', () => {
  let files: MemoryFiles;

  beforeEach(() => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    files = new MemoryFiles({ [MAIN]: JSON.stringify(dataWithUnit('kg')) });
  });

  it('resolves once the restored data is on disk', async () => {
    const userData = await freshStore();
    await userData.load(files);
    await userData.replaceAll(dataWithUnit('lb'));
    expect(files.files.get(MAIN)).toBe(JSON.stringify(dataWithUnit('lb')));
    expect(userData.saveState).toBe('saved');
  });

  it('rejects when the restored data cannot be saved', async () => {
    const userData = await freshStore();
    await userData.load(files);
    files.fail.write = () => true;
    await expect(userData.replaceAll(dataWithUnit('lb'))).rejects.toThrow();
    expect(files.files.get(MAIN)).toBe(JSON.stringify(dataWithUnit('kg')));
  });

  describe('when saving is disabled because the saved data cannot be read', () => {
    beforeEach(() => {
      files.files.set(MAIN, '{ broken');
      files.fail.rename = () => true;
    });

    it('writes the restored data over it and turns saving back on', async () => {
      const userData = await freshStore();
      await userData.load(files);
      expect(userData.persistence).toBe('disabled');
      files.fail.rename = undefined;

      await userData.replaceAll(dataWithUnit('lb'));
      expect(userData.persistence).toBe('ok');
      expect(files.files.get(MAIN)).toBe(JSON.stringify(dataWithUnit('lb')));

      // Later changes are saved again.
      userData.update((data) => ({ ...data, settings: { ...data.settings, unit: 'kg' } }));
      await userData.flush();
      expect(files.files.get(MAIN)).toBe(JSON.stringify(dataWithUnit('kg')));
    });

    it('rejects and keeps saving off when the restored data cannot be written', async () => {
      const userData = await freshStore();
      await userData.load(files);
      files.fail.write = () => true;

      await expect(userData.replaceAll(dataWithUnit('lb'))).rejects.toThrow();
      expect(userData.persistence).toBe('disabled');
      expect(files.files.get(MAIN)).toBe('{ broken');
    });
  });
});
