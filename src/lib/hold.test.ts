import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { HOLD_MS, HOLD_SLOP_PX, SCROLL_SETTLE_MS, pressAndHold } from './hold.ts';

type Listener = (event: FakeEvent) => void;

interface FakeEvent {
  target?: unknown;
  pointerId?: number;
  isPrimary?: boolean;
  button?: number;
  clientX?: number;
  clientY?: number;
  defaultPrevented: boolean;
  propagationStopped: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

/** An event target keeping its listeners (the capture flag is ignored). */
class FakeTarget {
  readonly listeners = new Map<string, Set<Listener>>();

  addEventListener(type: string, listener: Listener) {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: string, listener: Listener) {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string, event: FakeEvent) {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(event);
  }

  count(): number {
    return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0);
  }
}

function event(init: Partial<FakeEvent> = {}): FakeEvent {
  return {
    defaultPrevented: false,
    propagationStopped: false,
    preventDefault() {
      this.defaultPrevented = true;
    },
    stopPropagation() {
      this.propagationStopped = true;
    },
    ...init,
  };
}

const SELECTOR = '[data-exercise-id]';

describe('pressAndHold', () => {
  let win: FakeTarget;
  let list: FakeTarget & { contains: (node: unknown) => boolean };
  /** A row of the list, and what its `closest(SELECTOR)` finds. */
  const row = { closest: (selector: string) => (selector === SELECTOR ? row : null) };
  /** Something outside the rows (a heading). */
  const heading = { closest: () => null };
  let held: unknown[];
  let detach: () => void;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'performance'] });
    win = new FakeTarget();
    vi.stubGlobal('window', win);
    list = Object.assign(new FakeTarget(), { contains: (node: unknown) => node === row });
    held = [];
    detach = pressAndHold(SELECTOR, (target) => held.push(target))(
      list as unknown as HTMLElement,
    ) as () => void;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  /** A pointer event as it reaches the window first (capture), then the list. */
  function pointer(type: string, init: Partial<FakeEvent> = {}): FakeEvent {
    const fired = event({
      target: row,
      pointerId: 1,
      isPrimary: true,
      button: 0,
      clientX: 100,
      clientY: 200,
      ...init,
    });
    win.emit(type, fired);
    if (!fired.propagationStopped) list.emit(type, fired);
    return fired;
  }

  /** A click, as the window sees it (capture); whether it went on to its target. */
  function click(): { prevented: boolean; delivered: boolean } {
    const fired = event({ target: row });
    win.emit('click', fired);
    return { prevented: fired.defaultPrevented, delivered: !fired.propagationStopped };
  }

  function contextMenu(): FakeEvent {
    const fired = event({ target: row });
    win.emit('contextmenu', fired);
    return fired;
  }

  it('holds a row pressed for HOLD_MS without moving', () => {
    pointer('pointerdown');
    vi.advanceTimersByTime(HOLD_MS - 1);
    expect(held).toEqual([]);
    vi.advanceTimersByTime(1);
    expect(held).toEqual([row]);
  });

  it('lets a quick tap click as usual', () => {
    pointer('pointerdown');
    vi.advanceTimersByTime(HOLD_MS / 2);
    pointer('pointerup');
    expect(click()).toEqual({ prevented: false, delivered: true });
    vi.advanceTimersByTime(HOLD_MS);
    expect(held).toEqual([]);
  });

  it('allows a finger to tremble, but a press that moves is a scroll', () => {
    pointer('pointerdown');
    pointer('pointermove', {
      clientX: 100 + HOLD_SLOP_PX * 0.6,
      clientY: 200 + HOLD_SLOP_PX * 0.6,
    });
    vi.advanceTimersByTime(HOLD_MS);
    expect(held).toEqual([row]);
    pointer('pointerup');

    held = [];
    pointer('pointerdown', { pointerId: 2 });
    pointer('pointermove', { pointerId: 2, clientY: 200 + HOLD_SLOP_PX + 1 });
    vi.advanceTimersByTime(HOLD_MS);
    expect(held).toEqual([]);
  });

  it('is no hold when the browser takes the touch over to scroll, or the page scrolls', () => {
    pointer('pointerdown');
    pointer('pointercancel');
    vi.advanceTimersByTime(HOLD_MS);
    expect(held).toEqual([]);

    pointer('pointerdown', { pointerId: 2 });
    win.emit('scroll', event());
    vi.advanceTimersByTime(HOLD_MS);
    expect(held).toEqual([]);
  });

  it('ignores a press that stops a scroll (a fling)', () => {
    win.emit('scroll', event());
    vi.advanceTimersByTime(SCROLL_SETTLE_MS - 1);
    pointer('pointerdown');
    vi.advanceTimersByTime(HOLD_MS);
    expect(held).toEqual([]);
    pointer('pointerup');

    vi.advanceTimersByTime(SCROLL_SETTLE_MS);
    pointer('pointerdown', { pointerId: 2 });
    vi.advanceTimersByTime(HOLD_MS);
    expect(held).toEqual([row]);
  });

  it('is no hold for a second finger, another button, or outside the rows', () => {
    pointer('pointerdown');
    pointer('pointerdown', { pointerId: 2, isPrimary: false });
    vi.advanceTimersByTime(HOLD_MS);
    pointer('pointerdown', { pointerId: 3, button: 2 });
    vi.advanceTimersByTime(HOLD_MS);
    pointer('pointerdown', { pointerId: 4, target: heading });
    vi.advanceTimersByTime(HOLD_MS);
    expect(held).toEqual([]);
  });

  it('holds at once on a long press the platform reports first, and keeps its menu away', () => {
    pointer('pointerdown');
    vi.advanceTimersByTime(HOLD_MS / 2);
    expect(contextMenu().defaultPrevented).toBe(true);
    expect(held).toEqual([row]);
    // Still down after the hold: no menu either, and no second hold.
    expect(contextMenu().defaultPrevented).toBe(true);
    vi.advanceTimersByTime(HOLD_MS);
    expect(held).toEqual([row]);
    pointer('pointerup');
    // Without a press, the menu is left alone (a right click).
    expect(contextMenu().defaultPrevented).toBe(false);
  });

  it('swallows the click of lifting the finger after a hold, until the next press', () => {
    pointer('pointerdown');
    vi.advanceTimersByTime(HOLD_MS);
    pointer('pointerup');
    expect(click()).toEqual({ prevented: true, delivered: false });

    // The next tap clicks.
    pointer('pointerdown', { pointerId: 2 });
    pointer('pointerup', { pointerId: 2 });
    expect(click()).toEqual({ prevented: false, delivered: true });
  });

  it('lets a key click after a hold', () => {
    pointer('pointerdown');
    vi.advanceTimersByTime(HOLD_MS);
    pointer('pointerup');
    win.emit('keydown', event());
    expect(click()).toEqual({ prevented: false, delivered: true });
  });

  it('removes its listeners and timer when detached', () => {
    pointer('pointerdown');
    vi.advanceTimersByTime(HOLD_MS);
    pointer('pointerdown', { pointerId: 2 });
    detach();
    vi.advanceTimersByTime(HOLD_MS);
    expect(held).toEqual([row]);
    expect(win.count()).toBe(0);
    expect(list.count()).toBe(0);
  });
});
