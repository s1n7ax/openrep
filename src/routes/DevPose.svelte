<!--
  Developer route: one exercise's 3D view full screen, frozen at a loop time.
  Not linked from the app; see `src/lib/devRoute.ts`.
-->
<script lang="ts">
  import ExerciseViewer from '../components/ExerciseViewer.svelte';
  import type { DevPoseRoute } from '../lib/devRoute.ts';
  import type { Catalog } from '../lib/schema/catalog.ts';

  let { route }: { route: DevPoseRoute } = $props();

  let catalog = $state<Catalog | null>(null);
  let loadError = $state<string | null>(null);

  $effect(() => {
    fetch(`${import.meta.env.BASE_URL}catalog/catalog.json`)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json() as Promise<Catalog>;
      })
      .then((data) => (catalog = data))
      .catch((error: unknown) => {
        console.error('Could not load the catalog:', error);
        loadError = 'Could not load the catalog.';
      });
  });

  const exercise = $derived(catalog?.exercises.find((e) => e.id === route.exerciseId));
  const animation = $derived(
    catalog?.animations.find((a) => a.exerciseId === route.exerciseId) ?? null,
  );
</script>

<div class="dev-pose" data-testid="dev-pose">
  {#if loadError}
    <p class="message">{loadError}</p>
  {:else if !catalog}
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
  }

  .dev-pose > :global(*) {
    flex: 1;
    min-height: 0;
  }

  .message {
    padding: 1rem;
  }
</style>
