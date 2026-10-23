<!--
  Developer route: one exercise's 3D view full screen, frozen at a loop time.
  Not linked from the app; see `DevPoseRoute` in `src/lib/router.ts`.
-->
<script lang="ts">
  import ExerciseViewer from '../components/ExerciseViewer.svelte';
  import type { DevPoseRoute } from '../lib/router.ts';
  import { catalog } from '../lib/stores/catalog.svelte.ts';

  let { route }: { route: DevPoseRoute } = $props();

  const found = $derived(catalog.exercise(route.exerciseId));
  const exercise = $derived(
    found && route.glow
      ? { ...found, primaryMuscles: route.glow.primary, secondaryMuscles: route.glow.secondary }
      : found,
  );
  const animation = $derived(catalog.animation(route.exerciseId));
</script>

<div class="dev-pose" data-testid="dev-pose">
  {#if catalog.status === 'error'}
    <p class="message">Could not load the catalog.</p>
  {:else if catalog.status === 'loading'}
    <p class="message">Loading…</p>
  {:else if !exercise}
    <p class="message">No exercise with id “{route.exerciseId}”.</p>
  {:else}
    <ExerciseViewer
      {exercise}
      {animation}
      time={route.time}
      view={route.view}
      zoom={route.zoom}
      focus={route.focus}
      fill
    />
  {/if}
</div>

<style>
  .dev-pose {
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }

  .dev-pose > :global(*) {
    flex: 1;
    min-height: 0;
  }

  .message {
    padding: 1rem;
  }
</style>
