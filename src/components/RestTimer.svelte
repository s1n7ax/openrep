<!--
  The rest countdown of the workout screen, docked at its bottom: the time
  left, a bar running down and Skip. At zero it turns into "Start your next
  set" with a short pulse (a plain colour change with reduced motion) and
  stays until dismissed. No sound or vibration.
-->
<script lang="ts">
  import { restSecondsLeft, type Rest } from '../lib/stores/restTimer.svelte.ts';
  import { formatCountdown } from '../lib/userData/workoutText.ts';
  import Icon from './Icon.svelte';

  let { rest, ondismiss }: { rest: Rest; ondismiss: () => void } = $props();

  let now = $state(Date.now());
  const left = $derived(restSecondsLeft(rest, now));
  const over = $derived(left === 0);
  /** Share of the rest still to go, for the bar. */
  const share = $derived(Math.min(1, Math.max(0, (rest.endsAt - now) / (rest.seconds * 1000))));

  // A clock while the countdown runs; times come from `endsAt`, so they stay
  // right when timers pause in the background.
  $effect(() => {
    if (over) return;
    const timer = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(timer);
  });
</script>

<section
  class="rest"
  class:over
  aria-label="Rest"
  data-testid="rest-timer"
  data-state={over ? 'over' : 'running'}
  data-seconds={rest.seconds}
>
  <span class="mark" aria-hidden="true"><Icon name={over ? 'play' : 'timer'} size={22} /></span>
  {#if over}
    <p class="go" data-testid="rest-over">Start your next set</p>
    <button type="button" class="btn action" data-testid="rest-dismiss" onclick={ondismiss}>
      Dismiss
    </button>
  {:else}
    <div class="time-box">
      <span class="label">Rest</span>
      <span class="time" role="timer" data-testid="rest-time">{formatCountdown(left)}</span>
    </div>
    <button type="button" class="btn action" data-testid="rest-skip" onclick={ondismiss}>
      Skip
    </button>
    <span class="track" aria-hidden="true"><span style:transform={`scaleX(${share})`}></span></span>
  {/if}
  <p class="visually-hidden" role="status">{over ? 'Rest over. Start your next set.' : ''}</p>
</section>

<style>
  .rest {
    position: relative;
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 64px;
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-md);
    transition:
      background-color 200ms ease,
      color 200ms ease,
      border-color 200ms ease;
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

  .time-box {
    display: flex;
    flex: 1;
    align-items: baseline;
    gap: var(--space-2);
    min-width: 0;
  }

  .label {
    color: var(--text-2);
    font-size: var(--text-sm);
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
    border-color: var(--border-strong);
    background: transparent;
    font-weight: 700;
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

  .go {
    flex: 1;
    min-width: 0;
    font-size: var(--text-lg);
    font-weight: 800;
    line-height: 1.2;
  }

  .over {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--on-accent);
    animation: pulse 900ms ease-out 3;
  }

  .over .mark {
    background: var(--on-accent);
    color: var(--accent);
    animation: nudge 900ms ease-in-out 3;
  }

  .over .action {
    border-color: currentColor;
    color: inherit;
  }

  /* The bar swells and a ring spreads from it: start the next set. */
  @keyframes pulse {
    0% {
      box-shadow:
        0 0 0 0 color-mix(in srgb, var(--accent) 55%, transparent),
        var(--shadow-md);
      transform: scale(1);
    }
    30% {
      transform: scale(1.03);
    }
    100% {
      box-shadow:
        0 0 0 18px transparent,
        var(--shadow-md);
      transform: scale(1);
    }
  }

  @keyframes nudge {
    0%,
    100% {
      transform: translateX(0);
    }
    40% {
      transform: translateX(4px);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .rest,
    .track span {
      transition: none;
    }

    .over,
    .over .mark {
      animation: none;
    }
  }
</style>
