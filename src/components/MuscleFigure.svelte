<!--
  The body, front and back, with the muscles something trains lit up: the
  primary ones in the accent colour, the secondary ones in a paler shade.
  A picture only (the tappable figure is BodyMap); it draws the same shapes.
-->
<script lang="ts">
  import {
    BODY_HEIGHT,
    BODY_WIDTH,
    MUSCLE_AREAS,
    musclePaths,
    OUTLINE_PATH,
    type BodySide,
  } from '../lib/bodyMap.ts';
  import { muscleLabel } from '../lib/labels.ts';
  import type { Muscle } from '../lib/schema/common.ts';

  interface Props {
    primary: readonly Muscle[];
    secondary: readonly Muscle[];
    testid: string;
  }

  let { primary, secondary, testid }: Props = $props();

  const SIDES: readonly BodySide[] = ['front', 'back'];
  const GAP = 14;

  const label = $derived.by(() => {
    const parts = [];
    if (primary.length > 0) parts.push(`Muscles: ${primary.map(muscleLabel).join(', ')}`);
    if (secondary.length > 0) parts.push(`Secondary: ${secondary.map(muscleLabel).join(', ')}`);
    return parts.length > 0 ? parts.join('. ') : 'No muscles known';
  });

  function level(muscle: Muscle): 'primary' | 'secondary' | 'none' {
    if (primary.includes(muscle)) return 'primary';
    return secondary.includes(muscle) ? 'secondary' : 'none';
  }
</script>

<svg
  class="muscle-figure"
  viewBox={`-2 0 ${2 * BODY_WIDTH + GAP + 4} ${BODY_HEIGHT + 2}`}
  role="img"
  aria-label={label}
  data-testid={testid}
>
  {#each SIDES as side, index (side)}
    <g transform={`translate(${index * (BODY_WIDTH + GAP)} 0)`}>
      <path class="outline" d={OUTLINE_PATH} />
      {#each MUSCLE_AREAS[side] as area (area.muscle)}
        <g
          class={`muscle ${level(area.muscle)}`}
          data-testid={`${testid}-${area.muscle.replace(/\s+/g, '-')}-${side}`}
          data-level={level(area.muscle)}
        >
          {#each musclePaths(area) as d, pathIndex (pathIndex)}
            <path {d} />
          {/each}
        </g>
      {/each}
    </g>
  {/each}
</svg>

<style>
  .muscle-figure {
    display: block;
    width: 100%;
    height: auto;
  }

  .outline {
    fill: var(--surface-2);
    stroke: var(--border-strong);
    stroke-width: 1;
  }

  .muscle {
    fill: color-mix(in srgb, var(--text-3) 18%, var(--surface-2));
    stroke: var(--surface);
    stroke-width: 0.8;
  }

  .muscle.secondary {
    fill: color-mix(in srgb, var(--accent) 38%, var(--surface-2));
  }

  .muscle.primary {
    fill: var(--accent);
  }
</style>
