<script lang="ts">
  import { parseDevPoseRoute } from './lib/devRoute.ts';
  import DevPose from './routes/DevPose.svelte';

  // Minimal hash handling until the app router exists: only the dev pose route.
  let hash = $state(window.location.hash);

  $effect(() => {
    const onHashChange = () => (hash = window.location.hash);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  });

  const devPose = $derived(parseDevPoseRoute(hash));
</script>

{#if devPose}
  <DevPose route={devPose} />
{:else}
  <main>
    <h1>OpenRep</h1>
  </main>
{/if}

<style>
  main {
    padding: 1rem;
  }
</style>
