<!--
  The countdown of a timed set, docked at the bottom of the workout screen
  where the rest countdown shows: the time left, a bar running down, Done
  (the set is over now) and Cancel. The workout screen ticks the set off at
  zero. No sound or vibration.
-->
<script lang="ts">
  import { restSecondsLeft } from '../lib/stores/restTimer.svelte.ts';
  import type { TimedSet } from '../lib/stores/setTimer.svelte.ts';
  import { formatCountdown } from '../lib/userData/workoutText.ts';
  import Icon from './Icon.svelte';

  let { timed, ondone, oncancel }: { timed: TimedSet; ondone: () => void; oncancel: () => void } =
    $props();

  let now = $state(Date.now());
  const left = $derived(restSecondsLeft(timed, now));
  /** Share of the set still to go, for the bar. */
  const share = $derived(Math.min(1, Math.max(0, (timed.endsAt - now) / (timed.seconds * 1000))));

  // A clock while it runs; times come from `endsAt`, so they stay right when
  // timers pause in the background.
  $effect(() => {
    const timer = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(timer);
  });
</script>

<section
  class="set-timer"
  aria-label="Set countdown"
  data-testid="set-timer"
  data-seconds={timed.seconds}
>
  <span class="mark" aria-hidden="true"><Icon name="timer" size={22} /></span>
  <div class="time-box">
    <span class="label">Hold</span>
    <span class="time" role="timer" data-testid="set-timer-time">{formatCountdown(left)}</span>
  </div>
  <button type="button" class="btn action" data-testid="set-timer-cancel" onclick={oncancel}>
    Cancel
  </button>
  <button
    type="button"
    class="btn btn-primary action"
    data-testid="set-timer-done"
    onclick={ondone}
  >
    Done
  </button>
  <span class="track" aria-hidden="true"><span style:transform={`scaleX(${share})`}></span></span>
</section>

<style>
  .set-timer {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 64px;
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
    overflow: hidden;
    border: 1px solid var(--accent);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-md);
  }

  .mark {
    display: grid;
    flex: none;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent-text);
  }

  /* "Hold" above the time, leaving room for two buttons on a narrow phone. */
  .time-box {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    line-height: 1.1;
  }

  .label {
    color: var(--text-2);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .time {
    font-size: var(--text-2xl);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
    letter-spacing: -0.01em;
  }

  .action {
    flex: none;
    font-weight: 700;
  }

  .action:not(.btn-primary) {
    border-color: var(--border-strong);
    background: transparent;
  }

  .track {
    position: absolute;
    right: 0;
    bottom: 0;
    left: 0;
    height: 3px;
    background: var(--surface-2);
  }

  .track span {
    display: block;
    height: 100%;
    background: var(--accent);
    transform-origin: left;
    transition: transform 250ms linear;
  }

  @media (prefers-reduced-motion: reduce) {
    .track span {
      transition: none;
    }
  }
</style>
