/**
 * Checks that an APK carries package.json's version: versionName is the
 * version and versionCode is major * 10000 + minor * 100 + patch, the rule in
 * android/app/build.gradle. Prints the version found and exits 1 on a
 * mismatch.
 *
 * Usage: `npm run check:apk-version -- <apk> [--expect <version>]`
 * (`--expect`: package.json's version must also be this one, e.g. the release
 * being built). Reads the APK with aapt2 from the newest build-tools in
 * `$ANDROID_HOME`.
 */
import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parseArgs } from 'node:util';
import { androidVersion, parseBadging } from './lib/android-version.ts';
import { REPO_ROOT } from './lib/paths.ts';

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

const { values, positionals } = parseArgs({
  options: { expect: { type: 'string' } },
  allowPositionals: true,
});
const [apk] = positionals;
if (!apk || positionals.length > 1) {
  fail('Usage: npm run check:apk-version -- <apk> [--expect <version>]');
}

const packageJson = path.join(REPO_ROOT, 'package.json');
const { version } = JSON.parse(readFileSync(packageJson, 'utf8')) as { version: string };
if (values.expect !== undefined && values.expect !== version) {
  fail(`${packageJson} has version ${version}, expected ${values.expect}.`);
}
const expected = androidVersion(version);

const androidHome = process.env.ANDROID_HOME;
if (!androidHome) {
  fail('ANDROID_HOME is not set: it is needed for aapt2.');
}
const buildToolsDir = path.join(androidHome, 'build-tools');
const [newestBuildTools] = readdirSync(buildToolsDir).sort((a, b) =>
  b.localeCompare(a, 'en', { numeric: true }),
);
if (!newestBuildTools) {
  fail(`No build-tools in ${buildToolsDir}.`);
}
const aapt2 = path.join(buildToolsDir, newestBuildTools, 'aapt2');

const actual = parseBadging(execFileSync(aapt2, ['dump', 'badging', apk], { encoding: 'utf8' }));
if (!actual) {
  fail(`aapt2 dump badging ${apk} printed no versionCode and versionName.`);
}
console.log(`${apk}: versionName ${actual.versionName}, versionCode ${actual.versionCode}`);
if (actual.versionName !== expected.versionName || actual.versionCode !== expected.versionCode) {
  fail(
    `Expected versionName ${expected.versionName} and versionCode ${expected.versionCode} ` +
      `(from package.json's version ${version}).`,
  );
}
