/**
 * Personal data stays on the device: the native projects keep the app's data
 * out of OS backups (Google cloud backup and device-to-device transfer on
 * Android, iCloud and computer backups on iOS). Moving to a new phone goes
 * through the app's own export and import.
 */
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SAVED_CATALOG_DIR } from '../src/lib/catalog/source.ts';
import { USER_DATA_DIR } from '../src/lib/persistence/userDataFile.ts';

const ANDROID_MAIN = '../android/app/src/main/';

/** Every backup domain Android knows (`<include>` / `<exclude>` `domain` values). */
const ANDROID_DOMAINS = [
  'root',
  'file',
  'database',
  'sharedpref',
  'external',
  'device_root',
  'device_file',
  'device_database',
  'device_sharedpref',
];

function read(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

/** XML text without its comments. */
function readXml(path: string): string {
  return read(path).replace(/<!--[\s\S]*?-->/g, '');
}

/** The attributes of the first `<tag>` element, by name. */
function attributes(xml: string, tag: string): Map<string, string> {
  const element = new RegExp(`<${tag}\\s([^>]*)>`).exec(xml);
  expect(element, `<${tag}>`).not.toBeNull();
  return new Map([...element![1]!.matchAll(/([\w:]+)="([^"]*)"/g)].map(([, n, v]) => [n!, v!]));
}

/** The inside of `<tag>…</tag>`. */
function section(xml: string, tag: string): string {
  const match = new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`).exec(xml);
  expect(match, `<${tag}>`).not.toBeNull();
  return match![1]!;
}

/** Asserts that `rules` includes nothing and excludes every domain as a whole. */
function expectExcludesEverything(rules: string): void {
  expect(rules).not.toContain('<include');
  const excluded = [...rules.matchAll(/<exclude\s+domain="([^"]+)"\s+path="\.\/?"\s*\/>/g)].map(
    ([, domain]) => domain,
  );
  expect(excluded.sort()).toEqual([...ANDROID_DOMAINS].sort());
}

describe('Android keeps app data out of OS backups', () => {
  const application = attributes(readXml(`${ANDROID_MAIN}AndroidManifest.xml`), 'application');

  it('turns backup off and points at the rule files', () => {
    expect(application.get('android:allowBackup')).toBe('false');
    expect(application.get('android:dataExtractionRules')).toBe('@xml/data_extraction_rules');
    expect(application.get('android:fullBackupContent')).toBe('@xml/backup_rules');
  });

  it('excludes everything from cloud backup and device transfer on Android 12+', () => {
    const rules = section(
      readXml(`${ANDROID_MAIN}res/xml/data_extraction_rules.xml`),
      'data-extraction-rules',
    );
    expectExcludesEverything(section(rules, 'cloud-backup'));
    expectExcludesEverything(section(rules, 'device-transfer'));
  });

  it('excludes everything from backup on Android 11 and lower', () => {
    const rules = readXml(`${ANDROID_MAIN}res/xml/backup_rules.xml`);
    expectExcludesEverything(section(rules, 'full-backup-content'));
  });
});

describe('iOS keeps app data out of OS backups', () => {
  const appDelegate = read('../ios/App/App/AppDelegate.swift');

  it('excludes the data folder from backup at launch', () => {
    // User data and the saved catalog share one folder in Documents (Directory.Data).
    expect(SAVED_CATALOG_DIR).toBe(USER_DATA_DIR);
    expect(appDelegate).toContain(`.appendingPathComponent("${USER_DATA_DIR}", isDirectory: true)`);
    expect(appDelegate).toContain('.urls(for: .documentDirectory, in: .userDomainMask)');
    expect(appDelegate).toContain('values.isExcludedFromBackup = true');
    expect(appDelegate).toContain('.setResourceValues(values)');
    expect(appDelegate).toMatch(
      /didFinishLaunchingWithOptions[^{]*\{\s*excludeAppDataFromBackup\(\)/,
    );
  });
});
