/**
 * The Android version of the app, derived from package.json's version by the
 * same rule as android/app/build.gradle: versionName is the version and
 * versionCode is major * 10000 + minor * 100 + patch. minor and patch stay
 * below 100, so every release has a higher versionCode than the one before.
 */

/** versionName and versionCode of an APK. */
export interface AndroidVersion {
  versionName: string;
  versionCode: number;
}

/** A version that gives no valid versionCode. */
export class InvalidAppVersionError extends Error {
  override name = 'InvalidAppVersionError';
}

/** Android's largest allowed versionCode. */
const MAX_VERSION_CODE = 2_100_000_000;

const VERSION = /^(0|[1-9]\d*)\.(0|[1-9]\d?)\.(0|[1-9]\d?)$/;

/**
 * The versionName and versionCode for `version` (package.json's).
 *
 * @throws {InvalidAppVersionError} when `version` is not MAJOR.MINOR.PATCH with
 *   MINOR and PATCH below 100, or its versionCode is above Android's limit.
 */
export function androidVersion(version: string): AndroidVersion {
  const match = VERSION.exec(version);
  if (!match) {
    throw new InvalidAppVersionError(
      `"${version}" is not MAJOR.MINOR.PATCH with MINOR and PATCH below 100`,
    );
  }
  const [major, minor, patch] = match.slice(1).map(Number) as [number, number, number];
  const versionCode = major * 10_000 + minor * 100 + patch;
  if (versionCode > MAX_VERSION_CODE) {
    throw new InvalidAppVersionError(
      `"${version}" gives versionCode ${versionCode}, above Android's limit of ${MAX_VERSION_CODE}`,
    );
  }
  return { versionName: version, versionCode };
}

/** The versionName and versionCode in `aapt2 dump badging` output, if present. */
export function parseBadging(badging: string): AndroidVersion | undefined {
  const match = /^package: .*\bversionCode='(\d+)' versionName='([^']*)'/m.exec(badging);
  return match ? { versionCode: Number(match[1]), versionName: match[2]! } : undefined;
}
