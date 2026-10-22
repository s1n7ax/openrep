import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseNotices } from './notices.ts';

describe('parseNotices', () => {
  it('reads the table and licence texts', () => {
    const markdown = [
      '# Third-party notices',
      '',
      'Intro.',
      '',
      '| Work | Used for | Licence |',
      '| --- | --- | --- |',
      '| [Lib](https://example.com/lib) | Things | MIT |',
      '| Plain | Data in `data/` | CC0 |',
      '',
      '## Lib',
      '',
      'Imported by',
      '`scripts/x.ts`.',
      '',
      '```text',
      'MIT License',
      '```',
    ].join('\n');
    expect(parseNotices(markdown)).toEqual([
      {
        name: 'Lib',
        url: 'https://example.com/lib',
        usedFor: 'Things',
        licence: 'MIT',
        text: 'Imported by scripts/x.ts.\n\nMIT License',
      },
      { name: 'Plain', url: null, usedFor: 'Data in data/', licence: 'CC0', text: '' },
    ]);
  });

  it('parses the repository notices file with a licence text for every work', () => {
    const notices = parseNotices(readFileSync('THIRD_PARTY_NOTICES.md', 'utf8'));
    expect(notices.map((notice) => notice.name)).toEqual(
      expect.arrayContaining(['free-exercise-db', 'three.js', 'Svelte', 'Capacitor', 'Zod']),
    );
    for (const notice of notices) {
      expect(notice.url).toMatch(/^https:\/\//);
      expect(notice.text.length).toBeGreaterThan(100);
    }
  });
});
