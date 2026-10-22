<!--
  A finished workout (`#/history/:id`): when, how long, and every exercise
  with its sets (weights in the user's unit); delete with confirmation.
-->
<script lang="ts">
  import ConfirmDialog from '../components/ConfirmDialog.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import FactGrid from '../components/FactGrid.svelte';
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import { resolveExerciseRef } from '../lib/exerciseRef.ts';
  import { href, paths, router } from '../lib/router.ts';
  import { catalog } from '../lib/stores/catalog.svelte.ts';
  import { userData } from '../lib/stores/userData.svelte.ts';
  import { findSession } from '../lib/userData/selectors.ts';
  import { deleteSession } from '../lib/userData/sessions.ts';
  import { formatTarget } from '../lib/userData/targets.ts';
  import {
    formatDateTime,
    formatLoggedSet,
    formatSessionDuration,
    sessionSetCounts,
  } from '../lib/userData/workoutText.ts';

  let { sessionId }: { sessionId: string } = $props();

  const session = $derived(findSession(userData.data, sessionId));
  const unit = $derived(userData.data.settings.unit);
  let confirmDelete = $state(false);

  function remove() {
    confirmDelete = false;
    userData.update((data) => deleteSession(data, sessionId));
    router.backTo(paths.history());
  }
</script>

<PageHeader
  title={session ? session.dayName.trim() || 'Workout' : 'Workout'}
  subtitle={session?.planName}
  back={paths.history()}
/>

<div class="page">
  {#if !session}
    <EmptyState
      icon="alert"
      title="Workout not found"
      text="It may have been deleted."
      testid="history-not-found"
    >
      {#snippet actions()}
        <a class="btn btn-primary" href={href(paths.history())}>Go to history</a>
      {/snippet}
    </EmptyState>
  {:else}
    {@const counts = sessionSetCounts(session)}
    <section class="intro">
      <p class="eyebrow">{session.finishedAt === null ? 'In progress' : 'Finished workout'}</p>
      <h2 class="when" data-testid="history-date">{formatDateTime(session.startedAt)}</h2>
    </section>

    <div class="block">
      <FactGrid
        facts={[
          {
            label: 'Duration',
            value: formatSessionDuration(session.startedAt, session.finishedAt),
            testid: 'history-duration',
          },
          {
            label: 'Sets done',
            value: `${counts.done} of ${counts.total}`,
            testid: 'history-sets',
          },
        ]}
      />
    </div>

    <ol class="exercises">
      {#each session.exercises as exercise (exercise.id)}
        {@const resolved = resolveExerciseRef(
          exercise.exercise,
          (id) => catalog.exercise(id),
          userData.data.customExercises,
        )}
        <li class="exercise card" data-testid="history-exercise">
          <header class="head">
            {#if resolved.link}
              <a class="name" href={resolved.link}>{resolved.name}</a>
            {:else}
              <span class="name">{resolved.name}</span>
            {/if}
            {#if resolved.note}
              <span class="missing">{resolved.note}</span>
            {/if}
            <span class="target">Target {formatTarget(exercise.target, unit)}</span>
          </header>
          <ol class="sets">
            {#each exercise.sets as set, index (set.id)}
              <li class="set" class:done={set.done} data-testid="history-set">
                <span class="number">{index + 1}</span>
                <span class="value">{formatLoggedSet(set, unit)}</span>
                {#if set.done}
                  <span class="state done-state"><Icon name="check" size={18} /> Done</span>
                {:else}
                  <span class="state">Skipped</span>
                {/if}
              </li>
            {/each}
          </ol>
        </li>
      {/each}
    </ol>

    <button
      type="button"
      class="btn btn-danger-ghost btn-block"
      data-testid="history-delete"
      onclick={() => (confirmDelete = true)}
    >
      <Icon name="trash" size={20} /> Delete workout
    </button>
  {/if}
</div>

<ConfirmDialog
  open={confirmDelete}
  title="Delete this workout?"
  message="It is removed from your history and no longer shown as “last time”."
  confirmLabel="Delete"
  danger
  onconfirm={remove}
  oncancel={() => (confirmDelete = false)}
/>

<style>
  .intro {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-bottom: var(--space-4);
  }

  .eyebrow {
    color: var(--accent-text);
    font-size: var(--text-sm);
    font-weight: 700;
  }

  .when {
    font-size: var(--text-xl);
    font-weight: 800;
    letter-spacing: -0.01em;
    line-height: 1.2;
  }

  .block {
    margin-bottom: var(--space-5);
  }

  .exercises {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin: 0 0 var(--space-6);
    padding: 0;
    list-style: none;
  }

  .exercise {
    overflow: hidden;
  }

  .head {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-3) var(--space-4);
    border-bottom: 1px solid var(--border);
  }

  .name {
    align-self: flex-start;
    color: var(--text);
    font-weight: 750;
    text-decoration: none;
  }

  a.name {
    text-decoration: underline;
    text-decoration-color: var(--border-strong);
    text-underline-offset: 3px;
  }

  .missing {
    color: var(--warning-text);
    font-size: var(--text-xs);
    font-weight: 700;
  }

  .target {
    color: var(--text-3);
    font-size: var(--text-sm);
  }

  .sets {
    margin: 0;
    padding: var(--space-1) 0;
    list-style: none;
  }

  .set {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 40px;
    padding: 0 var(--space-4);
    color: var(--text-3);
    font-variant-numeric: tabular-nums;
  }

  .set.done {
    color: var(--text);
  }

  .number {
    width: 20px;
    color: var(--text-3);
    font-size: var(--text-sm);
    font-weight: 800;
    text-align: center;
  }

  .value {
    flex: 1;
    font-weight: 650;
  }

  .state {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    font-size: var(--text-sm);
  }

  .done-state {
    color: var(--accent-text);
    font-weight: 700;
  }
</style>
