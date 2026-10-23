import { describe, expect, it } from 'vitest';
import {
  ChangelogSectionNotFoundError,
  changelogSection,
  RecipeFormatError,
  RELEASE_NOTES_MAX_LENGTH,
  releaseNotes,
  stampFdroidRecipe,
} from './store-release.ts';

const URL_020 = 'https://github.com/s1n7ax/openrep/releases/tag/v0.2.0';

/** A CHANGELOG.md as release-please writes it. */
const CHANGELOG = `# Changelog

## [0.2.0](https://github.com/s1n7ax/openrep/compare/v0.1.0...v0.2.0) (2026-11-02)


### ⚠ BREAKING CHANGES

* **data:** exercise ids are kebab-case; old backups are converted
  on import

### Features

* **ui:** dark mode ([#12](https://github.com/s1n7ax/openrep/issues/12)) ([abc1234](https://github.com/s1n7ax/openrep/commit/abc1234))
* \`rest\` timer between sets, closes [#9](https://github.com/s1n7ax/openrep/issues/9) ([def5678](https://github.com/s1n7ax/openrep/commit/def5678))


### Bug Fixes

* **3d:** the bar stays in the hands during curls ([0aa0aa0](https://github.com/s1n7ax/openrep/commit/0aa0aa0))

## 0.1.0 (2026-10-22)


### Features

* OpenRep, an open-source gym companion app with 3D exercise guides ([#1](https://github.com/s1n7ax/openrep/issues/1)) ([319cc97](https://github.com/s1n7ax/openrep/commit/319cc97d0b66d594c62b6f78ac76e43dd24c5b86))
`;

describe('changelogSection', () => {
  it('is the lines between the heading of the version and the next one', () => {
    const section = changelogSection(CHANGELOG, '0.1.0');
    expect(section.filter((line) => line.trim())).toEqual([
      '### Features',
      '* OpenRep, an open-source gym companion app with 3D exercise guides ([#1](https://github.com/s1n7ax/openrep/issues/1)) ([319cc97](https://github.com/s1n7ax/openrep/commit/319cc97d0b66d594c62b6f78ac76e43dd24c5b86))',
    ]);
    expect(changelogSection(CHANGELOG, '0.2.0').join('\n')).not.toContain('OpenRep, an');
  });

  it('fails for a version without a section', () => {
    expect(() => changelogSection(CHANGELOG, '0.3.0')).toThrow(ChangelogSectionNotFoundError);
    expect(() => changelogSection(CHANGELOG, '0.1')).toThrow(ChangelogSectionNotFoundError);
  });
});

describe('releaseNotes', () => {
  it('is the section as plain text, without commit and issue links', () => {
    expect(releaseNotes(CHANGELOG, '0.2.0', URL_020)).toBe(
      [
        '⚠ BREAKING CHANGES',
        '• data: exercise ids are kebab-case; old backups are converted on import',
        '',
        'Features',
        '• ui: dark mode',
        '• rest timer between sets',
        '',
        'Bug Fixes',
        '• 3d: the bar stays in the hands during curls',
      ].join('\n'),
    );
    expect(releaseNotes(CHANGELOG, '0.1.0', 'https://example.org')).toBe(
      'Features\n• OpenRep, an open-source gym companion app with 3D exercise guides',
    );
  });

  it('leaves out the last entries and links the release when it is too long', () => {
    const entries = Array.from({ length: 40 }, (_, i) => `* change number ${i} (abc)`);
    const changelog = `## 0.2.0 (2026-11-02)\n\n### Features\n\n${entries.join('\n')}\n`;
    const notes = releaseNotes(changelog, '0.2.0', URL_020);
    expect([...notes].length).toBeLessThanOrEqual(RELEASE_NOTES_MAX_LENGTH);
    expect(notes.startsWith('Features\n• change number 0 (abc)\n• change number 1 (abc)')).toBe(
      true,
    );
    expect(notes.endsWith(`\n\nAll changes: ${URL_020}`)).toBe(true);
    expect(notes).not.toContain('change number 39');
  });

  it('shortens a single entry that is too long on its own', () => {
    const changelog = `## 0.2.0 (2026-11-02)\n\n### Features\n\n* ${'x'.repeat(800)}\n`;
    const notes = releaseNotes(changelog, '0.2.0', URL_020);
    expect([...notes].length).toBe(RELEASE_NOTES_MAX_LENGTH);
    expect(notes).toMatch(/^Features\n• x+…\n\nAll changes: /);
  });

  it('counts characters, not UTF-16 code units', () => {
    const entries = Array.from({ length: 60 }, () => '* 🏋️ lift');
    const changelog = `## 0.2.0 (2026-11-02)\n\n### Features\n\n${entries.join('\n')}\n`;
    const notes = releaseNotes(changelog, '0.2.0', URL_020);
    expect([...notes].length).toBeLessThanOrEqual(RELEASE_NOTES_MAX_LENGTH);
    expect(notes.match(/🏋️ lift/g)?.length).toBeGreaterThan(30);
  });

  it('links the release when the section has no entries', () => {
    expect(releaseNotes('## 0.2.0 (2026-11-02)\n', '0.2.0', URL_020)).toBe(
      `Version 0.2.0: ${URL_020}`,
    );
  });
});

const RECIPE = `Categories:
  - Workout
AutoName: OpenRep

Builds:
  - versionName: 0.1.0
    versionCode: 100
    commit: v0.1.0
    subdir: android/app

AutoUpdateMode: Version
UpdateCheckMode: Tags ^v[0-9]+\\.[0-9]+\\.[0-9]+$
UpdateCheckData: fdroid/build-metadata.yml|\\nCurrentVersionCode:\\s*(\\d+)||v(.+)
CurrentVersion: 0.1.0
CurrentVersionCode: 100
`;

describe('stampFdroidRecipe', () => {
  it('sets the build entry and the current version', () => {
    expect(stampFdroidRecipe(RECIPE, '1.2.3', 10203)).toBe(
      RECIPE.replace('versionName: 0.1.0', 'versionName: 1.2.3')
        .replace('versionCode: 100', 'versionCode: 10203')
        .replace('commit: v0.1.0', 'commit: v1.2.3')
        .replace('CurrentVersion: 0.1.0', 'CurrentVersion: 1.2.3')
        .replace('CurrentVersionCode: 100', 'CurrentVersionCode: 10203'),
    );
  });

  it('is unchanged when stamped with its own version', () => {
    expect(stampFdroidRecipe(RECIPE, '0.1.0', 100)).toBe(RECIPE);
  });

  it('fails without exactly one build entry and current version', () => {
    const twoBuilds = RECIPE.replace(
      '    subdir: android/app\n',
      '    subdir: android/app\n  - versionName: 0.0.9\n    versionCode: 9\n    commit: v0.0.9\n',
    );
    expect(() => stampFdroidRecipe(twoBuilds, '1.2.3', 10203)).toThrow(RecipeFormatError);
    const noCurrent = RECIPE.replace(/^CurrentVersion: .*\n/m, '');
    expect(() => stampFdroidRecipe(noCurrent, '1.2.3', 10203)).toThrow(RecipeFormatError);
  });
});
