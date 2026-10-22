/**
 * Exercise search by name and alternative names, tolerant of the many ways
 * people write gym exercises ("Skull-Crusher", "skullcrusher", "skull crushers").
 *
 * A candidate matches when one of its names (name or alias):
 * 1. equals the query (exact),
 * 2. starts with the query (prefix),
 * 3. has, for every query word, a word starting with it (words), or
 * 4. contains the query with spaces removed, also with spaces removed (compact).
 *
 * Results are ordered by the best of these per candidate, then animated
 * exercises first, then alphabetically.
 */

/** Lowercase, without diacritics or punctuation, single spaces: "Pull-Ups (Wide)" → "pull ups wide". */
export function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** What the index needs to know about a candidate. */
export interface Searchable {
  name: string;
  aliases: readonly string[];
  /** Animated exercises win ties. */
  animated: boolean;
}

/** How well a candidate matched; lower is better. */
export const MatchRank = {
  exact: 0,
  prefix: 1,
  words: 2,
  compact: 3,
} as const;
export type MatchRank = (typeof MatchRank)[keyof typeof MatchRank];

interface IndexedName {
  text: string;
  words: string[];
  compact: string;
}

interface Entry<T> {
  item: T;
  names: IndexedName[];
  animated: boolean;
  sortKey: string;
}

function indexName(name: string): IndexedName {
  const text = normalize(name);
  return { text, words: text.split(' '), compact: text.replaceAll(' ', '') };
}

function rankName(name: IndexedName, query: IndexedName): MatchRank | null {
  if (name.text === query.text) return MatchRank.exact;
  if (name.text.startsWith(query.text)) return MatchRank.prefix;
  if (query.words.every((word) => name.words.some((candidate) => candidate.startsWith(word)))) {
    return MatchRank.words;
  }
  if (name.compact.includes(query.compact)) return MatchRank.compact;
  return null;
}

function rankEntry<T>(entry: Entry<T>, query: IndexedName): MatchRank | null {
  let best: MatchRank | null = null;
  for (const name of entry.names) {
    const rank = rankName(name, query);
    if (rank !== null && (best === null || rank < best)) best = rank;
    if (best === MatchRank.exact) break;
  }
  return best;
}

function compareText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

export interface SearchIndex<T> {
  /**
   * Candidates matching `query` that pass `filter`, best first. An empty
   * query returns every candidate passing the filter, alphabetically.
   */
  search(query: string, filter?: (item: T) => boolean): T[];
}

/** Builds a search index over `items`; `describe` tells how each is named. */
export function createSearchIndex<T>(
  items: readonly T[],
  describe: (item: T) => Searchable,
): SearchIndex<T> {
  const entries: Entry<T>[] = items.map((item) => {
    const { name, aliases, animated } = describe(item);
    const names = [name, ...aliases].map(indexName).filter((indexed) => indexed.text !== '');
    return { item, names, animated, sortKey: normalize(name) };
  });
  const alphabetical = [...entries].sort((a, b) => compareText(a.sortKey, b.sortKey));

  return {
    search(query, filter) {
      const indexedQuery = indexName(query);
      const passes = (entry: Entry<T>) => !filter || filter(entry.item);
      if (indexedQuery.text === '') {
        return alphabetical.filter(passes).map((entry) => entry.item);
      }
      const ranked: { entry: Entry<T>; rank: MatchRank }[] = [];
      for (const entry of entries) {
        if (!passes(entry)) continue;
        const rank = rankEntry(entry, indexedQuery);
        if (rank !== null) ranked.push({ entry, rank });
      }
      ranked.sort(
        (a, b) =>
          a.rank - b.rank ||
          Number(b.entry.animated) - Number(a.entry.animated) ||
          compareText(a.entry.sortKey, b.entry.sortKey),
      );
      return ranked.map(({ entry }) => entry.item);
    },
  };
}
