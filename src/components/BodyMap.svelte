<!--
  The body, front and back, to pick by tapping instead of by name: muscle
  groups ("muscles") or where it hurts ("injuries"). Picked areas light up in
  the accent colour; the names of what is picked are listed underneath by
  the caller.
-->
<script lang="ts">
  import {
    BODY_HEIGHT,
    BODY_WIDTH,
    INJURY_SPOTS,
    MUSCLE_AREAS,
    musclePaths,
    OUTLINE_PATH,
    type BodySide,
  } from '../lib/bodyMap.ts';
  import { muscleLabel } from '../lib/labels.ts';
  import { injuryLabel } from '../lib/scheduleChoices.ts';

  interface Props {
    mode: 'muscles' | 'injuries';
    /** Picked muscle groups, or picked injury area keys. */
    selected: readonly string[];
    ontoggle: (key: string) => void;
    testidPrefix: string;
  }

  let { mode, selected, ontoggle, testidPrefix }: Props = $props();

  const SIDES: readonly BodySide[] = ['front', 'back'];
  const GAP = 14;

  function slug(value: string): string {
    return value.replace(/\s+/g, '-');
  }

  function onKey(event: KeyboardEvent, key: string) {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    ontoggle(key);
  }
</script>

<svg
  class="body-map"
  class:injuries={mode === 'injuries'}
  viewBox={`-2 0 ${2 * BODY_WIDTH + GAP + 4} ${BODY_HEIGHT + 22}`}
  role="group"
  aria-label={mode === 'muscles' ? 'Muscles, front and back' : 'Where it hurts, front and back'}
>
  {#each SIDES as side, index (side)}
    <g transform={`translate(${index * (BODY_WIDTH + GAP)} 0)`}>
      <path class="outline" d={OUTLINE_PATH} />
      {#each MUSCLE_AREAS[side] as area (area.muscle)}
        {#if mode === 'muscles'}
          <g
            class="muscle"
            class:on={selected.includes(area.muscle)}
            role="button"
            tabindex="0"
            aria-pressed={selected.includes(area.muscle)}
            aria-label={`${muscleLabel(area.muscle)} (${side})`}
            data-testid={`${testidPrefix}-${slug(area.muscle)}-${side}`}
            onclick={() => ontoggle(area.muscle)}
            onkeydown={(event) => onKey(event, area.muscle)}
          >
            <title>{muscleLabel(area.muscle)}</title>
            {#each musclePaths(area) as d, index (index)}
              <path {d} />
            {/each}
          </g>
        {:else}
          <g class="muscle quiet">
            {#each musclePaths(area) as d, index (index)}
              <path {d} />
            {/each}
          </g>
        {/if}
      {/each}
      {#if mode === 'injuries'}
        {#each INJURY_SPOTS[side] as spot (spot.area)}
          <g
            class="spot"
            class:on={selected.includes(spot.area)}
            role="button"
            tabindex="0"
            aria-pressed={selected.includes(spot.area)}
            aria-label={injuryLabel(spot.area)}
            data-testid={`${testidPrefix}-${spot.area}`}
            onclick={() => ontoggle(spot.area)}
            onkeydown={(event) => onKey(event, spot.area)}
          >
            <circle class="spot-hit" cx={spot.at[0]} cy={spot.at[1]} r="11" />
            <circle class="spot-ring" cx={spot.at[0]} cy={spot.at[1]} r="6.5" />
            <circle class="spot-dot" cx={spot.at[0]} cy={spot.at[1]} r="3" />
            <title>{injuryLabel(spot.area)}</title>
          </g>
        {/each}
      {/if}
      <text class="caption" x={BODY_WIDTH / 2} y={BODY_HEIGHT + 16}>
        {side === 'front' ? 'Front' : 'Back'}
      </text>
      {#if mode === 'injuries'}
        <!-- Which hand is which: on the front view the person's right is on the left. -->
        <text class="side" x="11" y="176">{side === 'front' ? 'R' : 'L'}</text>
        <text class="side" x={BODY_WIDTH - 11} y="176">{side === 'front' ? 'L' : 'R'}</text>
      {/if}
    </g>
  {/each}
</svg>

<style>
  .body-map {
    display: block;
    width: 100%;
    max-width: 380px;
    height: auto;
    margin: 0 auto;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
  }

  .outline {
    fill: var(--surface-2);
    stroke: var(--border-strong);
    stroke-width: 1;
  }

  .muscle {
    fill: color-mix(in srgb, var(--text-3) 22%, var(--surface-2));
    stroke: var(--surface);
    stroke-width: 0.8;
    cursor: pointer;
    transition: fill 140ms ease;
  }

  @media (hover: hover) {
    .muscle:not(.quiet):hover {
      fill: color-mix(in srgb, var(--accent) 30%, var(--surface-2));
    }
  }

  .muscle.on,
  .muscle.on:hover {
    fill: var(--accent);
  }

  @media (prefers-reduced-motion: reduce) {
    .muscle,
    .spot-dot {
      transition: none;
    }
  }

  .muscle:focus,
  .spot:focus {
    outline: none;
  }

  .muscle:focus-visible,
  .spot:focus-visible .spot-ring {
    stroke: var(--focus);
    stroke-width: 2.5;
  }

  .muscle.quiet {
    fill: color-mix(in srgb, var(--text-3) 12%, var(--surface-2));
    cursor: default;
  }

  .spot {
    cursor: pointer;
  }

  .spot-hit {
    fill: transparent;
  }

  .spot-ring {
    fill: var(--surface);
    stroke: var(--danger);
    stroke-width: 1.5;
    opacity: 0.85;
  }

  .spot-dot {
    fill: var(--danger);
    opacity: 0.35;
    transition: opacity 140ms ease;
  }

  .spot.on .spot-ring {
    fill: var(--danger);
    opacity: 1;
  }

  .spot.on .spot-dot {
    fill: var(--on-danger);
    opacity: 1;
  }

  .caption,
  .side {
    fill: var(--text-3);
    font-size: 11px;
    font-weight: 700;
    text-anchor: middle;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .side {
    font-size: 9px;
    opacity: 0.8;
  }
</style>
