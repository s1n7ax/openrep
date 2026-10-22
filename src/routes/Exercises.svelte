<!--
  Exercises tab (`#/exercises`): search the catalog by name or alternative
  name, filter by muscle and equipment; the user's custom exercises first.
-->
<script lang="ts">
  import ExerciseBrowser from '../components/ExerciseBrowser.svelte';
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import { paths, router } from '../lib/router.ts';
  import { exercisesBrowse } from '../lib/stores/browse.svelte.ts';
  import { catalog } from '../lib/stores/catalog.svelte.ts';
</script>

<PageHeader title="Exercises" large subtitle={`${catalog.exercises.length} in the catalog`}>
  {#snippet actions()}
    <button
      type="button"
      class="btn btn-ghost new"
      data-testid="new-custom-exercise"
      onclick={() => router.navigate(paths.customNew())}
    >
      <Icon name="plus" size={20} /> Custom
    </button>
  {/snippet}
</PageHeader>

<div class="page">
  <ExerciseBrowser
    state={exercisesBrowse}
    mode="browse"
    oncreate={(name) => router.navigate(paths.customNew({ name }))}
  />
</div>

<style>
  .new {
    padding: 0 var(--space-3);
  }
</style>
