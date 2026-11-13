import { afterEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  platform: 'web',
  opened: [] as string[],
  /** The URLs that something on the device opens. */
  handled: new Set<string>(),
  /** What the share sheet plugin was given. */
  shared: [] as unknown[],
  /** How the share sheet plugin ends: `null` when an app is picked. */
  shareError: null as Error | null,
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

vi.mock('@capacitor/share', () => ({
  Share: {
    share: async (options: unknown) => {
      native.shared.push(options);
      if (native.shareError) throw native.shareError;
      return { activityType: 'com.openai.chatgpt' };
    },
  },
}));

const { canShareText, openYouTubeSearch, shareText, youTubeAppSearchUrl, youTubeSearchUrl } =
  await import('./external.ts');

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

/** A long prompt: a full gym's exercise list is tens of kilobytes. */
const PROMPT = `Write me a plan.\n\n## Exercises\n${'barbell-squat: quadriceps, glutes – “ü”\n'.repeat(1200)}`;

describe('shareText on a device', () => {
  afterEach(() => {
    native.platform = 'web';
    native.shared = [];
    native.shareError = null;
  });

  it('can share on iOS and Android', () => {
    native.platform = 'ios';
    expect(canShareText()).toBe(true);
    native.platform = 'android';
    expect(canShareText()).toBe(true);
  });

  it('hands the whole text to the share sheet, without a subject', async () => {
    native.platform = 'android';
    expect(PROMPT.length).toBeGreaterThan(40_000);
    await expect(shareText(PROMPT, 'Send the prompt to')).resolves.toBe('shared');
    expect(native.shared).toEqual([{ text: PROMPT, dialogTitle: 'Send the prompt to' }]);
  });

  it('resolves to cancelled when the sheet is dismissed', async () => {
    native.platform = 'ios';
    native.shareError = new Error('Share canceled');
    await expect(shareText(PROMPT, 'Send the prompt to')).resolves.toBe('cancelled');
  });

  it('rejects when the sheet cannot be shown', async () => {
    native.platform = 'android';
    native.shareError = new Error("Can't share while sharing is in progress");
    await expect(shareText(PROMPT, 'Send the prompt to')).rejects.toThrow(
      "Can't share while sharing is in progress",
    );
  });
});

describe('shareText in a browser', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('cannot share where the browser has no Web Share API', () => {
    vi.stubGlobal('navigator', {});
    expect(canShareText()).toBe(false);
  });

  it('hands the whole text to the Web Share API, not the plugin', async () => {
    const share = vi.fn(async () => {});
    vi.stubGlobal('navigator', { share });
    expect(canShareText()).toBe(true);
    await expect(shareText(PROMPT, 'Send the prompt to')).resolves.toBe('shared');
    expect(share).toHaveBeenCalledWith({ text: PROMPT });
    expect(native.shared).toEqual([]);
  });

  it('resolves to cancelled when the sheet is dismissed', async () => {
    vi.stubGlobal('navigator', {
      share: async () => {
        throw new DOMException('Share canceled', 'AbortError');
      },
    });
    await expect(shareText(PROMPT, 'Send the prompt to')).resolves.toBe('cancelled');
  });

  it('rejects when the browser refuses to share', async () => {
    vi.stubGlobal('navigator', {
      share: async () => {
        throw new DOMException('Permission denied', 'NotAllowedError');
      },
    });
    await expect(shareText(PROMPT, 'Send the prompt to')).rejects.toThrow('Permission denied');
  });
});
