/**
 * Vertical paging for a scroll container whose children are full-screen
 * pages (each at least as tall as the container). The native scroll follows
 * the finger; when it stops between two pages, the container snaps to one of
 * them: to the next (or previous) page once the scroll went more than a fifth
 * of the screen past the edge of the page it started on, otherwise back. A
 * page taller than the screen scrolls freely and snaps only past its top or
 * bottom edge, and only for a scroll that began at that edge: a scroll (or
 * its momentum) that began within the page stops at its edge. (CSS scroll
 * snapping snaps to the nearest page, so a third of a screen would snap
 * back.) The app can also move to a page itself (`goTo`), and hears when the
 * user starts scrolling (`onUserScroll`).
 */

/** How far, as a share of the screen height, a scroll goes past a page's edge to move on. */
export const PAGE_THRESHOLD = 0.2;

/** Without scroll events for this long, a scroll (or its momentum) has ended. */
const SETTLE_MS = 150;

/** How long a snap takes, at the least and at the most. */
const MIN_SNAP_MS = 180;
const MAX_SNAP_MS = 400;

/** Scroll positions are fractional; offsets are whole pixels. */
const EPSILON = 1;

/** A page's place in the scroll container's content. */
export interface PageBox {
  top: number;
  height: number;
}

/** A page to come to rest on, at scroll position `top`. */
export interface Snap {
  page: number;
  top: number;
  /** The scroll began within `page`, away from this edge, so it stops here. */
  held?: true;
}

/** The last scroll position at which `page` still fills the screen. */
function restEnd(page: PageBox, viewport: number): number {
  return page.top + Math.max(0, page.height - viewport);
}

/**
 * Where the pager comes to rest from scroll position `position`, the screen
 * showing page `current` before the scroll.
 *
 * - The screen is within one page (possibly a tall one): that page, as it is.
 * - Between `current` and its neighbour: the neighbour once the scroll is
 *   past the threshold; back to `current` once the scroll has `settled`
 *   short of it; null (wait) while it may still be moving.
 * - Between the same two pages as `grabbed`, the position where a snap to
 *   `current` was grabbed and stopped: as above, but the threshold counts
 *   from there, either way; short of it the snap goes on to `current`.
 * - Between `current` and its neighbour, the scroll having begun at `start`
 *   within `current` (a tall page) short of the edge it crossed: back to
 *   `current`'s edge, `held`, however far it went.
 * - Between two other pages (a jump, e.g. to a focused field): the page that
 *   covers more of the screen.
 */
export function snapTarget(
  pages: readonly PageBox[],
  viewport: number,
  position: number,
  current: number,
  settled: boolean,
  grabbed: number | null = null,
  start: number | null = null,
): Snap | null {
  if (pages.length === 0) return null;
  for (const [index, page] of pages.entries()) {
    if (position <= restEnd(page, viewport) + EPSILON) {
      if (position >= page.top - EPSILON || index === 0) return { page: index, top: position };
      // Between the page above and this one.
      const above = pages[index - 1]!;
      // Whole pixels (scroll positions may be rounded), inside the pages.
      const lower = Math.floor(restEnd(above, viewport));
      const upper = Math.ceil(page.top);
      const toAbove = { page: index - 1, top: lower };
      const toBelow = { page: index, top: upper };
      const stay = current === index - 1 ? toAbove : current === index ? toBelow : null;
      if (stay === null) return position - lower < upper - position ? toAbove : toBelow;
      // A scroll that began within `current`, short of the edge it crossed.
      const resting = pages[current]!;
      if (
        start !== null &&
        start >= resting.top - EPSILON &&
        start <= restEnd(resting, viewport) + EPSILON &&
        (current === index - 1 ? start < lower - EPSILON : start > upper + EPSILON)
      ) {
        return { ...stay, held: true };
      }
      // Where the scroll started: the edge of `current`, or where a snap was grabbed.
      const from = grabbed !== null && grabbed > lower && grabbed < upper ? grabbed : stay.top;
      const threshold = PAGE_THRESHOLD * viewport;
      if (position - from > threshold) return toBelow;
      if (from - position > threshold) return toAbove;
      return settled ? stay : null;
    }
  }
  return { page: pages.length - 1, top: position };
}

export interface PagerOptions {
  /** Called when the screen comes to rest on another page. */
  onPageChange: (page: number) => void;
  /**
   * Called as a finger or the wheel scrolls the pages, from the start of
   * the scroll (long before it settles); never for the pager's own moves.
   */
  onUserScroll: () => void;
}

/**
 * Pages a scroll container (see the module comment). Its children are the
 * pages. Starts on page `initial`.
 */
export class PageSnapper {
  readonly #scroller: HTMLElement;
  readonly #options: PagerOptions;
  readonly #resizeObserver: ResizeObserver;
  #current: number;
  /** Scroll position within the current page, kept when the pages change size. */
  #offset = 0;
  #touching = false;
  /** The scroll position when the finger went down. */
  #touchTop = 0;
  #frame: number | null = null;
  /** The page an animated snap is heading for. */
  #target: number | null = null;
  /** Where a snap was grabbed and stopped, until the pager snaps or rests again. */
  #grabbed: number | null = null;
  #settleTimer: ReturnType<typeof setTimeout> | null = null;
  /** Where the scroll going on began, until it comes to rest. */
  #start: number | null = null;
  /** The scroll position at the last scroll event. */
  #lastTop = 0;

  constructor(scroller: HTMLElement, initial: number, options: PagerOptions) {
    this.#scroller = scroller;
    this.#options = options;
    this.#current = Math.max(0, Math.min(initial, scroller.children.length - 1));
    scroller.scrollTop = this.#boxes()[this.#current]?.top ?? 0;
    this.#lastTop = scroller.scrollTop;
    scroller.addEventListener('scroll', this.#onScroll, { passive: true });
    scroller.addEventListener('touchstart', this.#onTouchStart, { passive: true });
    scroller.addEventListener('touchend', this.#onTouchEnd, { passive: true });
    scroller.addEventListener('touchcancel', this.#onTouchEnd, { passive: true });
    scroller.addEventListener('wheel', this.#onWheel, { passive: true });
    // The screen (on-screen keyboard) or a page (sets added or removed) changed size.
    this.#resizeObserver = new ResizeObserver(() => this.#keepPage());
    this.#resizeObserver.observe(scroller);
    for (const page of scroller.children) this.#resizeObserver.observe(page);
  }

  /**
   * Moves to the top of page `index` as a snap does (see `#animate`). Not
   * while a finger is on the screen: its scroll goes on as it would.
   */
  goTo(index: number): void {
    const page = this.#boxes()[index];
    if (!page || this.#touching) return;
    this.#clearSettle();
    this.#stopAnimation();
    this.#grabbed = null;
    this.#animate({ page: index, top: page.top });
  }

  dispose(): void {
    this.#stopAnimation();
    this.#clearSettle();
    this.#resizeObserver.disconnect();
    this.#scroller.removeEventListener('scroll', this.#onScroll);
    this.#scroller.removeEventListener('touchstart', this.#onTouchStart);
    this.#scroller.removeEventListener('touchend', this.#onTouchEnd);
    this.#scroller.removeEventListener('touchcancel', this.#onTouchEnd);
    this.#scroller.removeEventListener('wheel', this.#onWheel);
  }

  /** The pages' boxes, to the fraction of a pixel (offsetTop and offsetHeight are rounded). */
  #boxes(): PageBox[] {
    const scroller = this.#scroller;
    const origin = scroller.getBoundingClientRect().top - scroller.scrollTop;
    return Array.from(scroller.children, (child) => {
      const { top, height } = child.getBoundingClientRect();
      return { top: top - origin, height };
    });
  }

  readonly #onTouchStart = () => {
    this.#touching = true;
    this.#clearSettle();
    // Grabbing the page mid-snap stops it there; the snap's page counts as
    // current, and the next scroll counts from where it stopped.
    const target = this.#target;
    if (target !== null) {
      this.#stopAnimation();
      this.#rest(target);
      this.#grabbed = this.#scroller.scrollTop;
    }
    this.#touchTop = this.#scroller.scrollTop;
    this.#start = this.#touchTop;
  };

  readonly #onTouchEnd = (event: TouchEvent) => {
    if (event.touches.length > 0) return;
    this.#touching = false;
    // A flick may be let go before its first scroll event.
    this.#noticeSwipe();
    this.#update(false);
  };

  readonly #onScroll = () => {
    const top = this.#scroller.scrollTop;
    if (this.#touching) this.#noticeSwipe();
    else if (this.#frame === null) {
      // The wheel, or a scroll from outside, begins where the last one left off.
      this.#start ??= this.#lastTop;
      this.#update(false, true);
    }
    this.#lastTop = top;
  };

  readonly #onWheel = (event: WheelEvent) => {
    // Not a wheel a page took for itself (a 3D view zooms with it).
    if (event.deltaY !== 0 && !event.defaultPrevented) this.#options.onUserScroll();
  };

  /**
   * Tells the app once the finger has moved the pages; not for a tap, nor
   * for a scroll event left over from a snap the finger stopped.
   */
  #noticeSwipe(): void {
    if (Math.abs(this.#scroller.scrollTop - this.#touchTop) >= EPSILON) {
      this.#options.onUserScroll();
    }
  }

  /**
   * Snaps when the scroll calls for it; otherwise waits for it to settle.
   * Without a finger on the screen (`moving`: momentum or the wheel), a
   * scroll held at a page's edge stops there at once.
   */
  #update(settled: boolean, moving = false): void {
    this.#clearSettle();
    const scroller = this.#scroller;
    const snap = snapTarget(
      this.#boxes(),
      scroller.clientHeight,
      scroller.scrollTop,
      this.#current,
      settled,
      this.#grabbed,
      this.#start,
    );
    if (snap === null) {
      this.#settleTimer = setTimeout(() => this.#update(true), SETTLE_MS);
      return;
    }
    this.#grabbed = null;
    if (Math.abs(snap.top - scroller.scrollTop) < EPSILON) {
      this.#rest(snap.page);
      // Momentum within a tall page may still carry it past an edge.
      if (!settled) this.#settleTimer = setTimeout(() => this.#update(true), SETTLE_MS);
      else this.#start = null;
    } else {
      this.#animate(snap, moving && snap.held === true);
    }
  }

  #rest(page: number): void {
    this.#offset = this.#scroller.scrollTop - (this.#boxes()[page]?.top ?? 0);
    if (page === this.#current) return;
    this.#current = page;
    this.#options.onPageChange(page);
  }

  /**
   * The scroll position `offset` into page `index` as the pages are laid out
   * now, short of where the page would stop filling the screen; null when
   * there is no such page.
   */
  #positionIn(index: number, offset: number): number | null {
    const page = this.#boxes()[index];
    if (!page) return null;
    return Math.min(page.top + Math.max(0, offset), restEnd(page, this.#scroller.clientHeight));
  }

  /** Back within the current page after a size change, at the same place in it. */
  #keepPage(): void {
    if (this.#touching || this.#frame !== null) return;
    const top = this.#positionIn(this.#current, this.#offset);
    if (top !== null && Math.abs(top - this.#scroller.scrollTop) >= EPSILON) {
      this.#scroller.scrollTop = top;
    }
  }

  /**
   * Scrolls to `snap` with an ease-out, or at once with reduced motion or
   * when `atOnce`. The scroll is locked meanwhile (when at once, as long as
   * the shortest snap), which also stops momentum. Pages that change size
   * meanwhile (a tap outside them, say) move the end along with its page.
   */
  #animate(snap: Snap, atOnce = false): void {
    const scroller = this.#scroller;
    const from = scroller.scrollTop;
    const distance = snap.top - from;
    const offset = snap.top - (this.#boxes()[snap.page]?.top ?? 0);
    const instant = atOnce || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const duration = instant
      ? MIN_SNAP_MS
      : Math.min(MAX_SNAP_MS, Math.max(MIN_SNAP_MS, Math.abs(distance) * 0.5));
    const ease = instant ? () => 1 : (t: number) => 1 - (1 - t) ** 3;
    const start = performance.now();
    scroller.style.overflowY = 'hidden';
    this.#target = snap.page;
    const step = () => {
      // Timed by the clock `start` came from, not the frame's time (the
      // callback's argument): that can be earlier than `start`, and the ease
      // of a negative time throws the scroll far back past where it started.
      const t = Math.min(1, (performance.now() - start) / duration);
      const to = this.#positionIn(snap.page, offset) ?? snap.top;
      scroller.scrollTop = from + (to - from) * ease(t);
      if (t < 1) {
        this.#frame = requestAnimationFrame(step);
        return;
      }
      this.#stopAnimation();
      this.#rest(snap.page);
      this.#lastTop = scroller.scrollTop;
      // A held scroll ends only once its momentum (a trackpad's lasts long
      // after the lock) has stopped: until then it is still held at the edge.
      if (snap.held) this.#settleTimer = setTimeout(() => this.#update(true), SETTLE_MS);
      else this.#start = null;
    };
    step();
  }

  #stopAnimation(): void {
    if (this.#frame !== null) cancelAnimationFrame(this.#frame);
    this.#frame = null;
    this.#target = null;
    this.#scroller.style.overflowY = '';
  }

  #clearSettle(): void {
    if (this.#settleTimer !== null) clearTimeout(this.#settleTimer);
    this.#settleTimer = null;
  }
}
