/**
 * The store listing in fastlane/metadata/android/en-US/ (and the F-Droid
 * recipe) within the limits Google Play and F-Droid enforce, and in step
 * with package.json's version, so a release does not fail at upload time.
 */
import { readdir, readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { androidVersion } from './lib/android-version.ts';
import { FDROID_RECIPE, LISTING_DIR, REPO_ROOT } from './lib/paths.ts';
import { RELEASE_NOTES_MAX_LENGTH, stampFdroidRecipe } from './lib/store-release.ts';

const PRIVACY_POLICY_URL = 'https://github.com/s1n7ax/openrep/blob/main/docs/privacy-policy.md';

async function text(name: string): Promise<string> {
  return readFile(path.join(LISTING_DIR, name), 'utf8');
}

function characters(value: string): number {
  return [...value].length;
}

const { version } = JSON.parse(await readFile(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
  version: string;
};

describe('store listing texts', () => {
  it.each([
    ['title.txt', 30],
    ['short_description.txt', 80],
    ['full_description.txt', 4000],
  ])('%s has at most %i characters and no surrounding whitespace', async (name, max) => {
    const value = await text(name);
    expect(value.length).toBeGreaterThan(0);
    expect(characters(value)).toBeLessThanOrEqual(max);
    expect(value).toBe(value.trim());
  });

  it('links the privacy policy, which exists', async () => {
    expect(await text('full_description.txt')).toContain(PRIVACY_POLICY_URL);
    const file = path.join(REPO_ROOT, PRIVACY_POLICY_URL.split('/blob/main/')[1]!);
    expect((await stat(file)).isFile()).toBe(true);
  });

  it('has release notes within the limit for every versionCode', async () => {
    const names = await readdir(path.join(LISTING_DIR, 'changelogs'));
    expect(names.length).toBeGreaterThan(0);
    for (const name of names) {
      expect(name).toMatch(/^[1-9]\d*\.txt$/);
      const value = await text(`changelogs/${name}`);
      expect(value.length, name).toBeGreaterThan(0);
      expect(characters(value), name).toBeLessThanOrEqual(RELEASE_NOTES_MAX_LENGTH);
      expect(value, name).toBe(value.trim());
    }
  });

  it("has the release notes of package.json's version", async () => {
    const { versionCode } = androidVersion(version);
    expect((await stat(path.join(LISTING_DIR, 'changelogs', `${versionCode}.txt`))).isFile()).toBe(
      true,
    );
  });
});

describe('store listing images', () => {
  it('has a 512 × 512 PNG icon', async () => {
    const meta = await sharp(path.join(LISTING_DIR, 'images', 'icon.png')).metadata();
    expect([meta.format, meta.width, meta.height]).toEqual(['png', 512, 512]);
  });

  it('has a 1024 × 500 feature graphic without transparency', async () => {
    const meta = await sharp(path.join(LISTING_DIR, 'images', 'featureGraphic.png')).metadata();
    expect([meta.format, meta.width, meta.height, meta.hasAlpha]).toEqual([
      'png',
      1024,
      500,
      false,
    ]);
  });

  it('has 2 to 8 phone screenshots Google Play accepts', async () => {
    const dir = path.join(LISTING_DIR, 'images', 'phoneScreenshots');
    const names = await readdir(dir);
    expect(names.length).toBeGreaterThanOrEqual(2);
    expect(names.length).toBeLessThanOrEqual(8);
    for (const name of names) {
      const file = path.join(dir, name);
      const { format, width = 0, height = 0 } = await sharp(file).metadata();
      expect(['png', 'jpeg'], name).toContain(format);
      for (const side of [width, height]) {
        expect(side, name).toBeGreaterThanOrEqual(320);
        expect(side, name).toBeLessThanOrEqual(3840);
      }
      expect(Math.max(width, height) / Math.min(width, height), name).toBeLessThanOrEqual(2);
      expect((await stat(file)).size, name).toBeLessThanOrEqual(8 * 1024 * 1024);
    }
  });
});

describe('F-Droid recipe', () => {
  it("builds package.json's version from its tag", async () => {
    const recipe = await readFile(FDROID_RECIPE, 'utf8');
    expect(stampFdroidRecipe(recipe, version, androidVersion(version).versionCode)).toBe(recipe);
  });
});
