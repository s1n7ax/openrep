import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PAGE_THRESHOLD, PageSnapper, snapTarget, type PageBox } from './pageSnap.ts';

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

  it('counts the threshold from where a snap was grabbed, between the same pages', () => {
    // A snap from page 0 to page 1 grabbed at 544: page 1 counts as current.
    expect(snapTarget(three, SCREEN, 600, 1, false, 544)).toBeNull();
    expect(snapTarget(three, SCREEN, 600, 1, true, 544)).toEqual({ page: 1, top: 800 });
    expect(snapTarget(three, SCREEN, 500, 1, true, 544)).toEqual({ page: 1, top: 800 });
    expect(snapTarget(three, SCREEN, 544 + THRESHOLD + 1, 1, false, 544)).toEqual({
      page: 1,
      top: 800,
    });
    expect(snapTarget(three, SCREEN, 544 - THRESHOLD - 1, 1, false, 544)).toEqual({
      page: 0,
      top: 0,
    });
    // Between two other pages, the grab does not count.
    expect(snapTarget(three, SCREEN, 900, 1, true, 544)).toEqual({ page: 1, top: 800 });
    expect(snapTarget(three, SCREEN, 800 + THRESHOLD + 1, 1, false, 544)).toEqual({
      page: 2,
      top: 1600,
    });
  });

  it('rests on the first page when pulled past the top', () => {
    expect(snapTarget(three, SCREEN, -30, 0, false)).toEqual({ page: 0, top: -30 });
  });

  it('has nothing to do without pages', () => {
    expect(snapTarget([], SCREEN, 0, 0, true)).toBeNull();
  });
});

/** The parts of the events the pager reads. */
interface FakeEvent {
  touches: unknown[];
  deltaY: number;
  defaultPrevented: boolean;
}

/**
 * A scroll container of pages laid out as `boxes`. It has no layout or events
 * of its own: a test sets `scrollTop` and dispatches the events a browser would.
 */
class FakeScroller {
  scrollTop = 0;
  readonly clientHeight = SCREEN;
  readonly style = { overflowY: '' };
  readonly children: { getBoundingClientRect: () => { top: number; height: number } }[];
  readonly #boxes: PageBox[];
  readonly #listeners = new Map<string, (event: FakeEvent) => void>();

  constructor(boxes: readonly PageBox[]) {
    this.#boxes = boxes.map((box) => ({ ...box }));
    this.children = this.#boxes.map((box) => ({
      getBoundingClientRect: () => ({ top: box.top - this.scrollTop, height: box.height }),
    }));
  }

  /** Page `index` becomes `height` high; the pages below it move with it. */
  resize(index: number, height: number) {
    const box = this.#boxes[index]!;
    const change = height - box.height;
    box.height = height;
    for (const below of this.#boxes.slice(index + 1)) below.top += change;
  }

  getBoundingClientRect() {
    return { top: 0 };
  }

  addEventListener(type: string, listener: (event: FakeEvent) => void) {
    this.#listeners.set(type, listener);
  }

  removeEventListener(type: string) {
    this.#listeners.delete(type);
  }

  /** Dispatches an event of `type`, no finger left on the screen, as `event` says otherwise. */
  dispatch(type: 'scroll' | 'touchstart' | 'touchend' | 'wheel', event: Partial<FakeEvent> = {}) {
    this.#listeners.get(type)?.({ touches: [], deltaY: 0, defaultPrevented: false, ...event });
  }

  /** A finger drags the content to scroll position `to` and lets go. */
  drag(to: number) {
    this.dispatch('touchstart');
    this.scrollTop = to;
    this.dispatch('scroll');
    this.dispatch('touchend');
  }

  /**
   * A fling's momentum scrolls on by `distance` a frame for `frames` frames,
   * unless the scroll is locked (`overflow-y: hidden` stops it).
   */
  fling(distance: number, frames: number) {
    for (let frame = 0; frame < frames; frame += 1) {
      if (this.style.overflowY === 'hidden') return;
      this.scrollTop += distance;
      this.dispatch('scroll');
      vi.advanceTimersByTime(16);
    }
  }
}

describe('PageSnapper', () => {
  let reducedMotion = false;

  beforeEach(() => {
    reducedMotion = false;
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    vi.stubGlobal('window', {
      matchMedia: () => ({ matches: reducedMotion }),
    });
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    );
    vi.stubGlobal('requestAnimationFrame', (step: (now: number) => void) =>
      setTimeout(() => step(performance.now()), 16),
    );
    vi.stubGlobal('cancelAnimationFrame', (frame: ReturnType<typeof setTimeout>) =>
      clearTimeout(frame),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /**
   * A pager over `boxes` (three screen-high pages), on page `initial` (the
   * first); `changes` records its page changes, `userScroll` is told of the
   * user's scrolling.
   */
  function pager(boxes = pages(SCREEN, SCREEN, SCREEN), initial = 0) {
    const scroller = new FakeScroller(boxes);
    const changes: number[] = [];
    const userScroll = vi.fn();
    const snapper = new PageSnapper(scroller as unknown as HTMLElement, initial, {
      onPageChange: (page) => changes.push(page),
      onUserScroll: userScroll,
    });
    return { scroller, changes, userScroll, snapper };
  }

  it('snaps to the next page after a drag past the threshold', () => {
    const { scroller, changes } = pager();
    scroller.drag(SCREEN / 3);
    vi.advanceTimersByTime(1000);
    expect(scroller.scrollTop).toBe(800);
    expect(scroller.style.overflowY).toBe('');
    expect(changes).toEqual([1]);
  });

  it('snaps only onwards when the frames’ times are earlier than the snap’s start', () => {
    vi.stubGlobal('requestAnimationFrame', (step: (now: number) => void) =>
      setTimeout(() => step(performance.now() - 500), 16),
    );
    const { scroller, changes } = pager();
    scroller.drag(SCREEN / 3);
    const positions: number[] = [];
    for (let frame = 0; frame < 20; frame += 1) {
      vi.advanceTimersByTime(16);
      positions.push(scroller.scrollTop);
    }
    expect(Math.min(...positions)).toBeGreaterThanOrEqual(SCREEN / 3);
    expect(positions).toEqual(positions.toSorted((a, b) => a - b));
    expect(scroller.scrollTop).toBe(800);
    expect(changes).toEqual([1]);
  });

  it('ends a snap on its page when a page above changes size meanwhile', () => {
    // Snapping from page 1 to page 2 when the tall page 0 loses 76 px (the
    // rest countdown's room, dismissed from outside the pages).
    const { scroller, changes } = pager(pages(1200, SCREEN, SCREEN), 1);
    scroller.drag(1200 + SCREEN / 3);
    vi.advanceTimersByTime(50);
    scroller.resize(0, 1200 - 76);
    vi.advanceTimersByTime(1000);
    expect(scroller.scrollTop).toBe(2000 - 76);
    expect(changes).toEqual([2]);
  });

  describe('a snap grabbed mid-way', () => {
    /** Drags 300 px down and grabs the snap to the next page ~50 ms in, around 540. */
    function grabbed() {
      const result = pager();
      result.scroller.drag(300);
      vi.advanceTimersByTime(50);
      const position = result.scroller.scrollTop;
      expect(position).toBeGreaterThan(300 + THRESHOLD);
      expect(position).toBeLessThan(800 - THRESHOLD);
      return { ...result, position };
    }

    it('finishes after a small drag on (a second flick)', () => {
      const { scroller, changes, position } = grabbed();
      scroller.drag(position + 50);
      vi.advanceTimersByTime(1000);
      expect(scroller.scrollTop).toBe(800);
      expect(changes).toEqual([1]);
    });

    it('finishes after a small drag back', () => {
      const { scroller, changes, position } = grabbed();
      scroller.drag(position - 50);
      vi.advanceTimersByTime(1000);
      expect(scroller.scrollTop).toBe(800);
      expect(changes).toEqual([1]);
    });

    it('goes back after a drag back past the threshold', () => {
      const { scroller, changes, position } = grabbed();
      scroller.drag(position - THRESHOLD - 40);
      vi.advanceTimersByTime(1000);
      expect(scroller.scrollTop).toBe(0);
      expect(changes).toEqual([1, 0]);
    });
  });

  it('goes to a page it is told to, as a snap', () => {
    const { scroller, changes, snapper } = pager();
    snapper.goTo(2);
    expect(scroller.style.overflowY).toBe('hidden');
    vi.advanceTimersByTime(1000);
    expect(scroller.scrollTop).toBe(1600);
    expect(scroller.style.overflowY).toBe('');
    expect(changes).toEqual([2]);
    // There is no page 3.
    snapper.goTo(3);
    vi.advanceTimersByTime(1000);
    expect(scroller.scrollTop).toBe(1600);
  });

  it('does not go to a page while a finger is on the screen', () => {
    const { scroller, changes, snapper } = pager();
    scroller.dispatch('touchstart');
    snapper.goTo(1);
    vi.advanceTimersByTime(1000);
    expect(scroller.scrollTop).toBe(0);
    expect(scroller.style.overflowY).toBe('');
    expect(changes).toEqual([]);
  });

  describe('the user scrolling', () => {
    it('is told as soon as a finger moves the pages, before it is let go', () => {
      const { scroller, userScroll } = pager();
      scroller.dispatch('touchstart');
      scroller.scrollTop = 40;
      scroller.dispatch('scroll');
      expect(userScroll).toHaveBeenCalled();
    });

    it('is told when a flick is let go before its first scroll event', () => {
      const { scroller, userScroll } = pager();
      scroller.dispatch('touchstart');
      scroller.scrollTop = 300;
      scroller.dispatch('touchend');
      expect(userScroll).toHaveBeenCalled();
    });

    it('is told when the wheel scrolls the pages, not sideways or when a page took it', () => {
      const { scroller, userScroll } = pager();
      scroller.dispatch('wheel');
      scroller.dispatch('wheel', { deltaY: 100, defaultPrevented: true });
      expect(userScroll).not.toHaveBeenCalled();
      scroller.dispatch('wheel', { deltaY: 100 });
      expect(userScroll).toHaveBeenCalled();
    });

    it('is not told of a tap, nor of a move the pager was told to, grabbed or not', () => {
      const { scroller, userScroll, snapper } = pager();
      scroller.dispatch('touchstart');
      scroller.dispatch('touchend');
      snapper.goTo(1);
      vi.advanceTimersByTime(50);
      scroller.dispatch('scroll');
      vi.advanceTimersByTime(1000);
      scroller.dispatch('scroll');
      expect(scroller.scrollTop).toBe(800);
      // A tap mid-way stops the move; the scroll event of its last frame comes after.
      snapper.goTo(2);
      vi.advanceTimersByTime(50);
      scroller.dispatch('touchstart');
      scroller.dispatch('scroll');
      scroller.dispatch('touchend');
      vi.advanceTimersByTime(1000);
      expect(scroller.scrollTop).toBe(1600);
      expect(userScroll).not.toHaveBeenCalled();
    });
  });

  it('with reduced motion, jumps to the next page and stops the fling there', () => {
    reducedMotion = true;
    const { scroller, changes } = pager();
    scroller.drag(100);
    scroller.fling(100, 15);
    expect(scroller.scrollTop).toBe(800);
    vi.advanceTimersByTime(1000);
    expect(scroller.scrollTop).toBe(800);
    expect(scroller.style.overflowY).toBe('');
    expect(changes).toEqual([1]);
  });
});
