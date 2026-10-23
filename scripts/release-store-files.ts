/**
 * Writes the store files of the version in package.json:
 *
 * - `fastlane/metadata/android/en-US/changelogs/<versionCode>.txt`, the
 *   "what's new" text Google Play and F-Droid show, from that version's
 *   CHANGELOG.md section;
 * - the version fields of the F-Droid recipe `fdroid/build-metadata.yml`.
 *
 * The release workflow runs it on release-please's release pull request, so
 * both are in the release tag, where F-Droid reads them. Prints what it wrote.
 *
 * Usage: `npm run release:store-files [-- --if-missing]`
 * (`--if-missing`: only the changelog, and only when it does not exist yet:
 * the Google Play job uses it for a tag that lacks one).
 */
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { androidVersion } from './lib/android-version.ts';
import { FDROID_RECIPE, LISTING_DIR, REPO_ROOT, REPO_URL } from './lib/paths.ts';
import {
  ChangelogSectionNotFoundError,
  RecipeFormatError,
  releaseNotes,
  stampFdroidRecipe,
} from './lib/store-release.ts';

const { values } = parseArgs({ options: { 'if-missing': { type: 'boolean', default: false } } });

const { version } = JSON.parse(await readFile(path.join(REPO_ROOT, 'package.json'), 'utf8')) as {
  version: string;
};
const { versionCode } = androidVersion(version);
const changelogFile = path.join(LISTING_DIR, 'changelogs', `${versionCode}.txt`);

async function exists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

/** Writes `text` to `file` unless it already has it; prints the file when it changed. */
async function update(file: string, text: string): Promise<void> {
  const before = (await exists(file)) ? await readFile(file, 'utf8') : undefined;
  if (before === text) return;
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, text);
  console.log(`Wrote ${path.relative(REPO_ROOT, file)}`);
}

try {
  if (values['if-missing'] && (await exists(changelogFile))) {
    console.log(`${path.relative(REPO_ROOT, changelogFile)} exists.`);
  } else {
    const changelog = await readFile(path.join(REPO_ROOT, 'CHANGELOG.md'), 'utf8');
    const releaseUrl = `${REPO_URL}/releases/tag/v${version}`;
    await update(changelogFile, releaseNotes(changelog, version, releaseUrl));
  }
  if (!values['if-missing']) {
    const recipe = await readFile(FDROID_RECIPE, 'utf8');
    await update(FDROID_RECIPE, stampFdroidRecipe(recipe, version, versionCode));
  }
} catch (error) {
  if (!(error instanceof ChangelogSectionNotFoundError || error instanceof RecipeFormatError)) {
    throw error;
  }
  console.error(`Cannot write the store files of ${version}: ${error.message}.`);
  process.exit(1);
}
