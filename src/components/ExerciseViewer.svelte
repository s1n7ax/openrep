<!--
  3D view of an exercise: the figure performing the animation (or standing
  still) with the primary muscles glowing strongly and the secondary ones
  faintly, plus a legend naming them. Drag to rotate, pinch / wheel to zoom.
  Compact, it is a picture only (no legend, buttons or gestures), for pages
  that are scrolled and swiped through.
-->
<script lang="ts">
  import { onMount, type Snippet } from 'svelte';
  import type { Animation } from '../lib/schema/animation.ts';
  import type { Muscle } from '../lib/schema/common.ts';
  import { GLOW_COLORS } from '../lib/three/colors.ts';
  import type { ExerciseContent, ExerciseViewer, ViewPreset } from '../lib/three/viewer.ts';

  interface Props {
    exercise: {
      name: string;
      primaryMuscles: readonly Muscle[];
      secondaryMuscles: readonly Muscle[];
    };
    animation: Animation | null;
    /** Freeze the movement at this loop time (0–1); playback when omitted. */
    time?: number | null;
    /** Initial camera direction. */
    view?: ViewPreset;
    /** Camera zoom factor for review tooling (> 1 is closer). */
    zoom?: number;
    /** World point the camera looks at, for review tooling. */
    focus?: readonly [number, number, number] | null;
    /** Fill the parent instead of using the default height. */
    fill?: boolean;
    /** No legend and buttons; drags and swipes go to the page instead of turning the figure. */
    compact?: boolean;
    /** Extra overlay actions, next to Play and Reset view (hidden when compact). */
    actions?: Snippet;
  }

  let {
    exercise,
    animation,
    time = null,
    view = 'default',
    zoom = 1,
    focus = null,
    fill = false,
    compact = false,
    actions,
  }: Props = $props();

  let canvas: HTMLCanvasElement | undefined = $state();
  let viewer = $state<ExerciseViewer | null>(null);
  let frames = $state(0);
  let playing = $state(true);
  let failed = $state(false);

  const animated = $derived(animation !== null);
  const showPlayback = $derived(animated && time === null);

  onMount(() => {
    let disposed = false;
    let instance: ExerciseViewer | null = null;
    // three.js and the figure are loaded on demand so screens without a viewer stay light.
    Promise.all([
      import('../lib/three/viewer.ts'),
      import('../lib/three/loadFigure.ts').then(({ loadFigureAsset }) => loadFigureAsset()),
    ])
      .then(([{ ExerciseViewer }, asset]) => {
        if (disposed || !canvas) return;
        instance = new ExerciseViewer(canvas, asset, { onFrame: (count) => (frames = count) });
        viewer = instance;
      })
      .catch((error: unknown) => {
        console.error('The 3D view could not start:', error);
        failed = true;
      });
    return () => {
      disposed = true;
      instance?.dispose();
      viewer = null;
    };
  });

  /** What the viewer shows: a parent passing the same exercise anew does not restart it. */
  let shown: ExerciseContent | null = null;

  $effect(() => {
    if (!viewer) return;
    const content = {
      primary: exercise.primaryMuscles,
      secondary: exercise.secondaryMuscles,
      animation,
    };
    if (
      shown?.primary === content.primary &&
      shown.secondary === content.secondary &&
      shown.animation === content.animation
    ) {
      return;
    }
    shown = content;
    viewer.setContent(content);
  });

  $effect(() => {
    viewer?.setTime(time);
  });

  $effect(() => {
    viewer?.setView(view, zoom, focus);
  });

  function togglePlayback() {
    playing = !playing;
    if (playing) viewer?.play();
    else viewer?.pause();
  }

  function resetView() {
    viewer?.resetView();
  }

  function names(muscles: readonly Muscle[]): string {
    return muscles.join(', ');
  }
</script>

<figure
  class="viewer"
  class:fill
  class:compact
  data-testid="exercise-viewer"
  data-animated={animated}
  data-primary={exercise.primaryMuscles.join(',')}
  data-secondary={exercise.secondaryMuscles.join(',')}
  data-frame={frames}
>
  <div class="stage">
    <canvas
      bind:this={canvas}
      aria-label={`3D figure ${animated ? 'performing' : 'showing the muscles of'} ${exercise.name}`}
    ></canvas>
    {#if failed}
      <p class="error">The 3D view is not available on this device.</p>
    {/if}
    {#if !compact}
      <div class="buttons">
        {#if showPlayback}
          <button type="button" onclick={togglePlayback} aria-pressed={!playing}>
            {playing ? 'Pause' : 'Play'}
          </button>
        {/if}
        <button type="button" onclick={resetView}>Reset view</button>
        {@render actions?.()}
      </div>
    {/if}
  </div>
  {#if !compact}
    <figcaption class="legend">
      <span class="entry">
        <span class="swatch" style:background={GLOW_COLORS.primary}></span>
        <span class="label">Primary</span>
        <span class="muscles" data-testid="primary-muscles">{names(exercise.primaryMuscles)}</span>
      </span>
      {#if exercise.secondaryMuscles.length > 0}
        <span class="entry">
          <span class="swatch secondary" style:background={GLOW_COLORS.secondary}></span>
          <span class="label">Secondary</span>
          <span class="muscles" data-testid="secondary-muscles"
            >{names(exercise.secondaryMuscles)}</span
          >
        </span>
      {/if}
    </figcaption>
  {/if}
</figure>

<style>
  .viewer {
    --stage-top: #f6f8fb;
    --stage-bottom: #d9dee6;
    --viewer-text: #20242b;
    --viewer-muted: #5b6370;
    --button-bg: rgb(255 255 255 / 0.78);
    --button-border: rgb(0 0 0 / 0.12);
    margin: 0;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    color: var(--viewer-text);
  }

  @media (prefers-color-scheme: dark) {
    .viewer {
      --stage-top: #2b3342;
      --stage-bottom: #12151b;
      --viewer-text: #eef1f5;
      --viewer-muted: #a3acb9;
      --button-bg: rgb(20 24 31 / 0.72);
      --button-border: rgb(255 255 255 / 0.16);
    }
  }

  .stage {
    position: relative;
    height: var(--viewer-height, min(68vh, 34rem));
    border-radius: 12px;
    overflow: hidden;
    background: radial-gradient(
      ellipse 90% 75% at 50% 32%,
      var(--stage-top) 0%,
      var(--stage-bottom) 100%
    );
  }

  .fill {
    height: 100%;
  }

  .fill .stage {
    flex: 1;
    height: auto;
    border-radius: 0;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
    touch-action: none;
    cursor: grab;
  }

  canvas:active {
    cursor: grabbing;
  }

  .compact canvas {
    pointer-events: none;
  }

  .error {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    margin: 0;
    padding: 1rem;
    text-align: center;
    color: var(--viewer-muted);
  }

  .buttons {
    position: absolute;
    right: 0.5rem;
    bottom: 0.5rem;
    display: flex;
    gap: 0.5rem;
  }

  button {
    min-height: 44px;
    min-width: 44px;
    padding: 0 0.9rem;
    border: 1px solid var(--button-border);
    border-radius: 999px;
    background: var(--button-bg);
    color: var(--viewer-text);
    font: inherit;
    font-size: 0.875rem;
    backdrop-filter: blur(6px);
  }

  .legend {
    display: flex;
    flex-wrap: wrap;
    gap: 0.35rem 1.25rem;
    font-size: 0.875rem;
    padding: 0 0.25rem;
  }

  .fill .legend {
    padding: 0.5rem 1rem calc(0.5rem + env(safe-area-inset-bottom));
  }

  .entry {
    display: inline-flex;
    align-items: baseline;
    gap: 0.4rem;
  }

  .swatch {
    align-self: center;
    width: 0.75rem;
    height: 0.75rem;
    border-radius: 50%;
    box-shadow: 0 0 0.45rem currentColor;
  }

  .swatch.secondary {
    opacity: 0.85;
  }

  .label {
    font-weight: 600;
  }

  .muscles {
    color: var(--viewer-muted);
    text-transform: capitalize;
  }
</style>
