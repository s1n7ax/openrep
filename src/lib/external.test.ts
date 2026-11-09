import { afterEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  platform: 'web',
  opened: [] as string[],
  /** The URLs that something on the device opens. */
  handled: new Set<string>(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: () => native.platform !== 'web',
    getPlatform: () => native.platform,
  },
}));

vi.mock('@capacitor/app-launcher', () => ({
  AppLauncher: {
    openUrl: async ({ url }: { url: string }) => {
      native.opened.push(url);
      return { completed: native.handled.has(url) };
    },
  },
}));

const { openYouTubeSearch, youTubeAppSearchUrl, youTubeSearchUrl } = await import('./external.ts');

const WEB = 'https://www.youtube.com/results?search_query=Dumbbell%20Bicep%20Curl';
const APP = 'youtube://results?search_query=Dumbbell%20Bicep%20Curl';

describe('youTubeSearchUrl', () => {
  it('searches YouTube for an exercise name', () => {
    expect(youTubeSearchUrl('Dumbbell Bicep Curl')).toBe(
      'https://www.youtube.com/results?search_query=Dumbbell%20Bicep%20Curl',
    );
  });

  it('escapes characters that would change the query', () => {
    expect(youTubeSearchUrl('row & press #2')).toBe(
      'https://www.youtube.com/results?search_query=row%20%26%20press%20%232',
    );
  });

  it('escapes non-ASCII names', () => {
    expect(youTubeSearchUrl('Kniebeuge über Kopf')).toBe(
      'https://www.youtube.com/results?search_query=Kniebeuge%20%C3%BCber%20Kopf',
    );
  });

  it('trims the name', () => {
    expect(youTubeSearchUrl('  pushups  ')).toBe(
      'https://www.youtube.com/results?search_query=pushups',
    );
  });
});

describe('youTubeAppSearchUrl', () => {
  it('searches in the YouTube app', () => {
    expect(youTubeAppSearchUrl(' Dumbbell Bicep Curl ')).toBe(APP);
  });
});

describe('openYouTubeSearch on a device', () => {
  afterEach(() => {
    native.platform = 'web';
    native.opened = [];
    native.handled.clear();
  });

  it('on Android, hands the web link to the system (the YouTube app or the browser)', async () => {
    native.platform = 'android';
    native.handled.add(WEB);
    await openYouTubeSearch('Dumbbell Bicep Curl');
    expect(native.opened).toEqual([WEB]);
  });

  it('on iOS, opens the YouTube app when it is installed', async () => {
    native.platform = 'ios';
    native.handled.add(APP).add(WEB);
    await openYouTubeSearch('Dumbbell Bicep Curl');
    expect(native.opened).toEqual([APP]);
  });

  it('on iOS without the YouTube app, opens the web link in Safari', async () => {
    native.platform = 'ios';
    native.handled.add(WEB);
    await openYouTubeSearch('Dumbbell Bicep Curl');
    expect(native.opened).toEqual([APP, WEB]);
  });

  it('rejects when nothing on the device opens it', async () => {
    native.platform = 'android';
    await expect(openYouTubeSearch('Dumbbell Bicep Curl')).rejects.toThrow(
      'YouTube could not be opened.',
    );
  });
});
