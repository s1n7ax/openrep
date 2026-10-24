/**
 * Press and hold on the rows of a list: a finger (or the mouse button) kept
 * still on a row for HOLD_MS. A quick tap still clicks; a press that scrolls,
 * or that stops a scroll, is not a hold. A hold neither clicks nor brings up
 * the system's long-press menu (the rows also need `user-select: none` and
 * `-webkit-touch-callout: none` against text selection).
 */
import type { Attachment } from 'svelte/attachments';

/** How long a press lasts before it is a hold. */
export const HOLD_MS = 500;

/** A press that moves farther than this is a scroll (browsers start scrolling at about 16 px). */
export const HOLD_SLOP_PX = 10;

/** A press this soon after a scroll stops the scroll (a fling) rather than holding a row. */
export const SCROLL_SETTLE_MS = 150;

interface Press {
  pointerId: number;
  x: number;
  y: number;
  target: HTMLElement;
  /** Running until the press is a hold; null once it is, while the finger stays down. */
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * Calls `onhold` with the element matching `selector`, inside the element
 * this is attached to, that is held: pressed for HOLD_MS without moving, or
 * long-pressed as the platform tells first (a touch `contextmenu`).
 *
 * After a hold, clicks are swallowed until the next press or key: lifting
 * the finger can still click (a mouse always does), which would hit the row
 * or whatever the hold opened over it.
 */
export function pressAndHold(
  selector: string,
  onhold: (target: HTMLElement) => void,
): Attachment<HTMLElement> {
  return (container) => {
    let press: Press | null = null;
    let lastScroll = -Infinity;

    const onPointerDown = (event: PointerEvent) => {
      if (!event.isPrimary || event.button !== 0) return;
      const target = (event.target as Element | null)?.closest<HTMLElement>(selector);
      if (!target || !container.contains(target)) return;
      if (performance.now() - lastScroll < SCROLL_SETTLE_MS) return;
      press = {
        pointerId: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        target,
        timer: setTimeout(hold, HOLD_MS),
      };
      // Any later pointer (a second finger) ends the press.
      window.addEventListener('pointerdown', release, true);
      window.addEventListener('pointermove', onPointerMove, true);
      window.addEventListener('pointerup', onPointerUp, true);
      window.addEventListener('pointercancel', onPointerUp, true);
      window.addEventListener('contextmenu', onContextMenu, true);
    };

    function pending(): boolean {
      return press !== null && press.timer !== null;
    }

    function hold() {
      if (!press) return;
      if (press.timer !== null) clearTimeout(press.timer);
      press.timer = null;
      window.addEventListener('click', swallowClick, true);
      window.addEventListener('pointerdown', stopSwallowing, true);
      window.addEventListener('keydown', stopSwallowing, true);
      onhold(press.target);
    }

    /** Stops following the press, before or after it became a hold. */
    function release() {
      if (!press) return;
      if (press.timer !== null) clearTimeout(press.timer);
      press = null;
      window.removeEventListener('pointerdown', release, true);
      window.removeEventListener('pointermove', onPointerMove, true);
      window.removeEventListener('pointerup', onPointerUp, true);
      window.removeEventListener('pointercancel', onPointerUp, true);
      window.removeEventListener('contextmenu', onContextMenu, true);
    }

    const onPointerMove = (event: PointerEvent) => {
      if (!press || !pending() || event.pointerId !== press.pointerId) return;
      if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > HOLD_SLOP_PX) release();
    };

    // Lifted, or `pointercancel`: the browser took the touch over to scroll.
    const onPointerUp = (event: PointerEvent) => {
      if (event.pointerId === press?.pointerId) release();
    };

    // A long press opens the system's menu (link, image) unless prevented.
    const onContextMenu = (event: Event) => {
      event.preventDefault();
      if (pending()) hold();
    };

    const onScroll = () => {
      lastScroll = performance.now();
      if (pending()) release();
    };

    function swallowClick(event: Event) {
      event.preventDefault();
      event.stopPropagation();
    }

    function stopSwallowing() {
      window.removeEventListener('click', swallowClick, true);
      window.removeEventListener('pointerdown', stopSwallowing, true);
      window.removeEventListener('keydown', stopSwallowing, true);
    }

    container.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('scroll', onScroll, { capture: true, passive: true });
    return () => {
      release();
      stopSwallowing();
      container.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('scroll', onScroll, { capture: true });
    };
  };
}
