import { describe, expect, it } from 'vitest';
import { androidVersion, InvalidAppVersionError, parseBadging } from './android-version.ts';

describe('androidVersion', () => {
  it('is major * 10000 + minor * 100 + patch', () => {
    expect(androidVersion('0.1.0')).toEqual({ versionName: '0.1.0', versionCode: 100 });
    expect(androidVersion('1.2.3')).toEqual({ versionName: '1.2.3', versionCode: 10203 });
    expect(androidVersion('12.99.99').versionCode).toBe(129999);
  });

  it('increases with every release', () => {
    const releases = ['0.1.0', '0.1.1', '0.1.99', '0.2.0', '0.99.99', '1.0.0', '1.0.1', '2.0.0'];
    const codes = releases.map((version) => androidVersion(version).versionCode);
    expect(codes).toEqual([...codes].sort((a, b) => a - b));
    expect(new Set(codes).size).toBe(codes.length);
  });

  it('rejects versions without a valid versionCode', () => {
    for (const version of ['0.100.0', '0.1.100', '1.2', '1.2.3-beta.1', '01.2.3', 'v1.2.3', '']) {
      expect(() => androidVersion(version), version).toThrow(InvalidAppVersionError);
    }
    expect(() => androidVersion('210001.0.0')).toThrow(InvalidAppVersionError);
  });
});

describe('parseBadging', () => {
  it('reads versionCode and versionName from aapt2 dump badging', () => {
    const badging =
      "package: name='io.github.s1n7ax.openrep' versionCode='100' versionName='0.1.0' " +
      "platformBuildVersionName='16' platformBuildVersionCode='36'\nsdkVersion:'24'\n";
    expect(parseBadging(badging)).toEqual({ versionName: '0.1.0', versionCode: 100 });
    expect(parseBadging("sdkVersion:'24'\n")).toBeUndefined();
  });
});
