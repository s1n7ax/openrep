<!--
  Workout (`#/workout/:sessionId`): placeholder listing the session's
  exercises until the logging screen replaces it.
-->
<script lang="ts">
  import EmptyState from '../components/EmptyState.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import { resolveExerciseRef } from '../lib/exerciseRef.ts';
  import { paths } from '../lib/router.ts';
  import { catalog } from '../lib/stores/catalog.svelte.ts';
  import { userData } from '../lib/stores/userData.svelte.ts';
  import { findSession } from '../lib/userData/selectors.ts';
  import { formatTarget } from '../lib/userData/targets.ts';

  let { sessionId }: { sessionId: string } = $props();

  const session = $derived(findSession(userData.data, sessionId));
</script>

<PageHeader
  title={session ? session.dayName : 'Workout'}
  subtitle={session?.planName}
  back={paths.plans()}
/>

<div class="page" data-testid="workout-placeholder" data-session-id={sessionId}>
  {#if !session}
    <EmptyState icon="alert" title="Workout not found" text="It may have been discarded." />
  {:else}
    <ol class="card list">
      {#each session.exercises as exercise (exercise.id)}
        <li>
          <span class="name">
            {resolveExerciseRef(
              exercise.exercise,
              (id) => catalog.exercise(id),
              userData.data.customExercises,
            ).name}
          </span>
          <span class="target">{formatTarget(exercise.target, userData.data.settings.unit)}</span>
        </li>
      {/each}
    </ol>
    <p class="hint">Set logging is coming soon.</p>
  {/if}
</div>

<style>
  .list {
    margin: 0 0 var(--space-4);
    padding: 0;
    list-style: none;
  }

  .list li {
    display: flex;
    flex-direction: column;
    padding: var(--space-3) var(--space-4);
  }

  .list li + li {
    border-top: 1px solid var(--border);
  }

  .name {
    font-weight: 650;
  }

  .target,
  .hint {
    color: var(--text-3);
    font-size: var(--text-sm);
  }
</style>
