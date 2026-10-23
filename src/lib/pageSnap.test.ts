import { describe, expect, it } from 'vitest';
import { PAGE_THRESHOLD, snapTarget, type PageBox } from './pageSnap.ts';

const SCREEN = 800;
const THRESHOLD = PAGE_THRESHOLD * SCREEN;

/** Pages of the given heights, one after the other. */
function pages(...heights: number[]): PageBox[] {
  let top = 0;
  return heights.map((height) => {
    const page = { top, height };
    top += height;
    return page;
  });
}

describe('snapTarget', () => {
  const three = pages(SCREEN, SCREEN, SCREEN);

  it('rests on a page that fills the screen', () => {
    expect(snapTarget(three, SCREEN, 800, 1, false)).toEqual({ page: 1, top: 800 });
    expect(snapTarget(three, SCREEN, 800.4, 0, true)).toEqual({ page: 1, top: 800.4 });
  });

  it('moves to the next page once a scroll goes past the threshold', () => {
    expect(snapTarget(three, SCREEN, THRESHOLD + 1, 0, false)).toEqual({ page: 1, top: 800 });
    // About a third of the screen.
    expect(snapTarget(three, SCREEN, SCREEN / 3, 0, false)).toEqual({ page: 1, top: 800 });
  });

  it('moves to the previous page once a scroll up goes past the threshold', () => {
    expect(snapTarget(three, SCREEN, 1600 - SCREEN / 3, 2, false)).toEqual({ page: 1, top: 800 });
  });

  it('waits while a small scroll may still move, then snaps back', () => {
    expect(snapTarget(three, SCREEN, 60, 0, false)).toBeNull();
    expect(snapTarget(three, SCREEN, 60, 0, true)).toEqual({ page: 0, top: 0 });
    expect(snapTarget(three, SCREEN, 1540, 2, true)).toEqual({ page: 2, top: 1600 });
  });

  it('scrolls freely within a page taller than the screen, then snaps past its edges', () => {
    // Pages of 800, 1400 and 800: the tall page rests anywhere from 800 to 1400.
    const tall = pages(SCREEN, 1400, SCREEN);
    expect(snapTarget(tall, SCREEN, 1100, 1, true)).toEqual({ page: 1, top: 1100 });
    expect(snapTarget(tall, SCREEN, 1400, 1, false)).toEqual({ page: 1, top: 1400 });
    // Past its bottom edge: back to it, or on to the next page.
    expect(snapTarget(tall, SCREEN, 1450, 1, true)).toEqual({ page: 1, top: 1400 });
    expect(snapTarget(tall, SCREEN, 1400 + SCREEN / 3, 1, false)).toEqual({ page: 2, top: 2200 });
    // Back up from the next page: to the tall page's bottom edge.
    expect(snapTarget(tall, SCREEN, 2200 - SCREEN / 3, 2, false)).toEqual({ page: 1, top: 1400 });
  });

  it('snaps a jump between two other pages to the one covering more of the screen', () => {
    const four = pages(SCREEN, SCREEN, SCREEN, SCREEN);
    expect(snapTarget(four, SCREEN, 1700, 0, false)).toEqual({ page: 2, top: 1600 });
    expect(snapTarget(four, SCREEN, 2300, 0, false)).toEqual({ page: 3, top: 2400 });
  });

  it('rests on the first page when pulled past the top', () => {
    expect(snapTarget(three, SCREEN, -30, 0, false)).toEqual({ page: 0, top: -30 });
  });

  it('has nothing to do without pages', () => {
    expect(snapTarget([], SCREEN, 0, 0, true)).toBeNull();
  });
});
