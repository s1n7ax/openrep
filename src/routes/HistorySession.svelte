<!--
  A finished workout (`#/history/:id`): when, how long, and every exercise
  with its sets (weights in the user's unit), supersets round by round;
  delete with confirmation.
-->
<script lang="ts">
  import ConfirmDialog from '../components/ConfirmDialog.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import FactGrid from '../components/FactGrid.svelte';
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import SupersetLabel from '../components/SupersetLabel.svelte';
  import { resolveExerciseRef } from '../lib/exerciseRef.ts';
  import { href, paths, router } from '../lib/router.ts';
  import type { LoggedSet, SessionExercise } from '../lib/schema/userData.ts';
  import { catalog } from '../lib/stores/catalog.svelte.ts';
  import { userData } from '../lib/stores/userData.svelte.ts';
  import { findSession } from '../lib/userData/selectors.ts';
  import { deleteSession } from '../lib/userData/sessions.ts';
  import {
    blockKey,
    groupBlocks,
    supersetExerciseLabel,
    supersetRounds,
  } from '../lib/userData/supersets.ts';
  import {
    formatSupersetExerciseTarget,
    formatSupersetSummary,
    formatTarget,
  } from '../lib/userData/targets.ts';
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
      {#each groupBlocks(session.exercises, session.supersets) as block (blockKey(block))}
        {#if block.kind === 'exercise'}
          {@const exercise = block.entry}
          <li class="exercise card" data-testid="history-exercise">
            <header class="head">
              {@render exerciseTitle(exercise, `Target ${formatTarget(exercise.target, unit)}`)}
            </header>
            <ol class="sets">
              {#each exercise.sets as set, index (set.id)}
                {@render setItem(set, String(index + 1))}
              {/each}
            </ol>
          </li>
        {:else}
          {@const rounds = supersetRounds(block.entries)}
          <li
            class="exercise card superset"
            data-testid="history-superset"
            data-superset-id={block.superset.id}
          >
            <header class="head">
              <SupersetLabel
                letter={block.letter}
                summary={formatSupersetSummary(rounds.length, block.superset.restSec)}
                testid="history-superset-summary"
              />
              <ol class="members">
                {#each block.entries as exercise, position (exercise.id)}
                  <li class="member" data-testid="history-exercise">
                    <span class="label">{supersetExerciseLabel(block.letter, position)}</span>
                    <span class="member-text">
                      {@render exerciseTitle(
                        exercise,
                        `Target ${formatSupersetExerciseTarget(exercise.target, unit)}`,
                      )}
                    </span>
                  </li>
                {/each}
              </ol>
            </header>
            {#each rounds as round, roundIndex (roundIndex)}
              <section class="round" data-testid="history-round" data-round={roundIndex + 1}>
                <h3 class="round-title">Round {roundIndex + 1}</h3>
                <ol class="sets">
                  {#each round as row (row.set.id)}
                    {@render setItem(row.set, supersetExerciseLabel(block.letter, row.position))}
                  {/each}
                </ol>
              </section>
            {/each}
          </li>
        {/if}
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

{#snippet exerciseTitle(exercise: SessionExercise, target: string)}
  {@const resolved = resolveExerciseRef(
    exercise.exercise,
    (id) => catalog.exercise(id),
    userData.data.customExercises,
  )}
  {#if resolved.link}
    <a class="name" href={resolved.link}>{resolved.name}</a>
  {:else}
    <span class="name">{resolved.name}</span>
  {/if}
  {#if resolved.note}
    <span class="missing">{resolved.note}</span>
  {/if}
  <span class="target">{target}</span>
{/snippet}

{#snippet setItem(set: LoggedSet, label: string)}
  <li class="set" class:done={set.done} data-testid="history-set">
    <span class="number">{label}</span>
    <span class="value">{formatLoggedSet(set, unit)}</span>
    {#if set.done}
      <span class="state done-state"><Icon name="check" size={18} /> Done</span>
    {:else}
      <span class="state">Skipped</span>
    {/if}
  </li>
{/snippet}

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

  .superset {
    border-left: 3px solid var(--accent);
  }

  .members {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: var(--space-2) 0 0;
    padding: 0;
    list-style: none;
  }

  .member {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
  }

  .label {
    min-width: 20px;
    color: var(--accent-text);
    font-size: var(--text-sm);
    font-weight: 800;
    text-align: center;
  }

  .member-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .round + .round {
    border-top: 1px solid var(--border);
  }

  .round-title {
    padding: var(--space-3) var(--space-4) 0;
    color: var(--text-3);
    font-size: var(--text-xs);
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
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
    min-width: 20px;
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
