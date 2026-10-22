<!--
  Unknown route.
-->
<script lang="ts">
  import EmptyState from '../components/EmptyState.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import { href, paths } from '../lib/router.ts';
</script>

<PageHeader title="Not found" back={paths.plans()} />

<div class="page">
  <EmptyState
    icon="alert"
    title="Page not found"
    text="This link does not lead anywhere."
    testid="not-found"
  >
    {#snippet actions()}
      <a class="btn btn-primary" href={href(paths.plans())}>Go to plans</a>
    {/snippet}
  </EmptyState>
</div>
