import { describe, expect, it } from 'vitest';
import { youTubeSearchUrl } from './external.ts';

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
