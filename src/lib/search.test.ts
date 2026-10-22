import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadCatalog } from '../../scripts/lib/catalog.ts';
import { createSearchIndex, normalize, type Searchable } from './search.ts';

interface Item extends Searchable {
  id: string;
}

const item = (id: string, name: string, aliases: string[] = [], animated = false): Item => ({
  id,
  name,
  aliases,
  animated,
});

const ITEMS: Item[] = [
  item('band-skull-crusher', 'Band Skull Crusher'),
  item('decline-close-grip-bench-to-skull-crusher', 'Decline Close-Grip Bench To Skull Crusher'),
  item('ez-bar-skullcrusher', 'EZ-Bar Skullcrusher'),
  item(
    'lying-triceps-press',
    'Lying Triceps Press',
    ['skull crusher', 'skullcrusher', 'lying triceps extension'],
    true,
  ),
  item('pullups', 'Pullups', ['pull-up', 'pull up'], true),
  item('wide-grip-pulldown-behind-the-neck', 'Wide-Grip Pulldown Behind The Neck'),
  item('wide-grip-lat-pulldown', 'Wide-Grip Lat Pulldown', ['lat pulldown'], true),
  item('crepe', 'Crêpe Curl'),
];

const ids = (results: Item[]) => results.map((result) => result.id);
const index = createSearchIndex(ITEMS, (entry) => entry);

describe('normalize', () => {
  it('lowercases and strips diacritics and punctuation', () => {
    expect(normalize('  Pull-Ups (Wide)  ')).toBe('pull ups wide');
    expect(normalize('Crêpe')).toBe('crepe');
    expect(normalize("Farmer's  walk")).toBe('farmer s walk');
  });
});

describe('createSearchIndex', () => {
  it('ranks an exact alias first: "skull crusher" finds lying triceps press', () => {
    const results = ids(index.search('skull crusher'));
    expect(results[0]).toBe('lying-triceps-press');
    expect(results).toEqual([
      'lying-triceps-press',
      'band-skull-crusher',
      'decline-close-grip-bench-to-skull-crusher',
      'ez-bar-skullcrusher',
    ]);
  });

  it('matches the compact form across spacing and punctuation', () => {
    expect(ids(index.search('skullcrusher'))[0]).toBe('lying-triceps-press');
    expect(ids(index.search('Skull-Crusher'))[0]).toBe('lying-triceps-press');
    expect(ids(index.search('pullup'))).toContain('pullups');
    expect(ids(index.search('crepe'))).toEqual(['crepe']);
  });

  it('matches word prefixes in any order', () => {
    expect(ids(index.search('press tri'))).toEqual(['lying-triceps-press']);
  });

  it('prefers exact over prefix over word matches, then animated, then alphabetical', () => {
    expect(ids(index.search('lat pulldown'))[0]).toBe('wide-grip-lat-pulldown');
    // Both are word matches; the animated one wins the tie.
    expect(ids(index.search('wide pull'))).toEqual([
      'wide-grip-lat-pulldown',
      'wide-grip-pulldown-behind-the-neck',
    ]);
    // An alias prefix first, then the word matches alphabetically.
    expect(ids(index.search('skull'))).toEqual([
      'lying-triceps-press',
      'band-skull-crusher',
      'decline-close-grip-bench-to-skull-crusher',
      'ez-bar-skullcrusher',
    ]);
  });

  it('returns everything alphabetically for an empty query and applies the filter', () => {
    expect(ids(index.search('   '))).toEqual([
      'band-skull-crusher',
      'crepe',
      'decline-close-grip-bench-to-skull-crusher',
      'ez-bar-skullcrusher',
      'lying-triceps-press',
      'pullups',
      'wide-grip-lat-pulldown',
      'wide-grip-pulldown-behind-the-neck',
    ]);
    expect(ids(index.search('', (entry) => entry.animated))).toEqual([
      'lying-triceps-press',
      'pullups',
      'wide-grip-lat-pulldown',
    ]);
    expect(ids(index.search('skull', (entry) => !entry.animated))).not.toContain(
      'lying-triceps-press',
    );
  });

  it('finds nothing for a nonsense query', () => {
    expect(index.search('zzqx nonexistent')).toEqual([]);
  });
});

describe('search over the repository catalog', () => {
  it('lists Lying Triceps Press first for "skull crusher"', async () => {
    const catalog = await loadCatalog(path.resolve(import.meta.dirname, '../../data'));
    const animated = new Set(catalog.animations.map((animation) => animation.exerciseId));
    const catalogIndex = createSearchIndex(catalog.exercises, (exercise) => ({
      name: exercise.name,
      aliases: exercise.aliases,
      animated: animated.has(exercise.id),
    }));
    const results = catalogIndex.search('skull crusher');
    expect(results[0]?.name).toBe('Lying Triceps Press');
    expect(catalogIndex.search('zzqx nonexistent')).toEqual([]);
  });
});
