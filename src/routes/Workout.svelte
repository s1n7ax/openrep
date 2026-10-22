<!--
  Workout logging (`#/workout/:sessionId`): per exercise, set rows with
  weight (in the user's unit), reps or seconds and a done tick; what was done
  last time; add and remove sets; the exercise name opens its page. Finish
  saves the workout to history; Discard deletes it.
-->
<script lang="ts">
  import ConfirmDialog from '../components/ConfirmDialog.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import SetRow from '../components/SetRow.svelte';
  import { resolveExerciseRef } from '../lib/exerciseRef.ts';
  import { newId, nowIso } from '../lib/ids.ts';
  import { href, paths, router } from '../lib/router.ts';
  import type { SessionExercise } from '../lib/schema/userData.ts';
  import { catalog } from '../lib/stores/catalog.svelte.ts';
  import { userData } from '../lib/stores/userData.svelte.ts';
  import { findSession, lastTimeFor } from '../lib/userData/selectors.ts';
  import { addLoggedSet, deleteSession, finishSession } from '../lib/userData/sessions.ts';
  import { formatReps, formatTargetWithRest } from '../lib/userData/targets.ts';
  import { formatDay, formatSets, sessionSetCounts } from '../lib/userData/workoutText.ts';

  let { sessionId }: { sessionId: string } = $props();

  const session = $derived(findSession(userData.data, sessionId));
  const unit = $derived(userData.data.settings.unit);
  const counts = $derived(session ? sessionSetCounts(session) : { done: 0, total: 0 });

  /** The confirmation being asked: discarding, or finishing with no set ticked. */
  let confirming = $state<'discard' | 'finish-empty' | null>(null);

  function mode(exercise: SessionExercise): 'reps' | 'time' {
    return exercise.target.durationSec !== undefined ? 'time' : 'reps';
  }

  function amountPlaceholder(exercise: SessionExercise): string {
    const { reps, durationSec } = exercise.target;
    if (durationSec !== undefined) return String(durationSec);
    return reps === undefined ? '—' : formatReps(reps);
  }

  function addSet(exercise: SessionExercise) {
    userData.update((data) => addLoggedSet(data, sessionId, exercise.id, newId()));
  }

  function finish() {
    if (counts.done === 0 && confirming === null) {
      confirming = 'finish-empty';
      return;
    }
    confirming = null;
    userData.update((data) => finishSession(data, sessionId, nowIso()));
    router.navigate(paths.historySession(sessionId), { replace: true });
  }

  function discard() {
    confirming = null;
    userData.update((data) => deleteSession(data, sessionId));
    router.back(paths.plans());
  }
</script>

<PageHeader
  title={session ? session.dayName.trim() || 'Workout' : 'Workout'}
  subtitle={session?.planName}
  back={paths.plans()}
/>

<div class="page" data-testid="workout" data-session-id={sessionId}>
  {#if !session}
    <EmptyState
      icon="alert"
      title="Workout not found"
      text="It may have been discarded."
      testid="workout-not-found"
    />
  {:else if session.finishedAt !== null}
    <EmptyState
      icon="check"
      title="Workout finished"
      text="This workout is saved in your history."
      testid="workout-finished"
    >
      {#snippet actions()}
        <a class="btn btn-primary btn-lg" href={href(paths.historySession(session.id))}>
          View in history
        </a>
      {/snippet}
    </EmptyState>
  {:else}
    <div
      class="progress card"
      data-testid="workout-progress"
      data-done={counts.done}
      data-total={counts.total}
    >
      <div class="progress-text">
        <strong>{counts.done} of {counts.total}</strong> sets done
      </div>
      <div
        class="bar"
        role="progressbar"
        aria-label="Sets done"
        aria-valuemin={0}
        aria-valuemax={counts.total}
        aria-valuenow={counts.done}
      >
        <span style:width={`${counts.total === 0 ? 0 : (100 * counts.done) / counts.total}%`}
        ></span>
      </div>
    </div>

    <ol class="exercises">
      {#each session.exercises as exercise, exerciseIndex (exercise.id)}
        {@const resolved = resolveExerciseRef(
          exercise.exercise,
          (id) => catalog.exercise(id),
          userData.data.customExercises,
        )}
        {@const last = lastTimeFor(userData.data.sessions, exercise.exercise, sessionId)}
        <li
          class="exercise card"
          data-testid="workout-exercise"
          data-session-exercise-id={exercise.id}
        >
          <header class="head">
            <span class="number" aria-hidden="true">{exerciseIndex + 1}</span>
            <div class="titles">
              {#if resolved.link}
                <a class="name" href={resolved.link} data-testid="workout-exercise-name">
                  {resolved.name}
                  <Icon name="chevron-right" size={16} />
                </a>
              {:else}
                <span class="name" data-testid="workout-exercise-name">{resolved.name}</span>
              {/if}
              {#if resolved.note}
                <span class="missing" data-testid="missing-note">
                  <Icon name="alert" size={14} />
                  {resolved.note}
                </span>
              {/if}
              <span class="target" data-testid="workout-target">
                {formatTargetWithRest(exercise.target, unit)}
              </span>
              {#if exercise.target.notes}
                <span class="notes">{exercise.target.notes}</span>
              {/if}
            </div>
          </header>

          {#if last}
            <p class="last-time" data-testid="last-time">
              <Icon name="history" size={16} />
              <span>
                <span class="last-label">Last time · {formatDay(last.session.startedAt)}:</span>
                {formatSets(last.sets, unit)}
              </span>
            </p>
          {/if}

          <div class="columns" aria-hidden="true">
            <span>Set</span>
            <span>{unit}</span>
            <span>{mode(exercise) === 'time' ? 'Seconds' : 'Reps'}</span>
            <span>Done</span>
            <span></span>
          </div>
          <ol class="sets">
            {#each exercise.sets as set, index (set.id)}
              <SetRow
                {sessionId}
                sessionExerciseId={exercise.id}
                {set}
                {index}
                mode={mode(exercise)}
                {unit}
                amountPlaceholder={amountPlaceholder(exercise)}
                canRemove={exercise.sets.length > 1}
              />
            {/each}
          </ol>
          <button
            type="button"
            class="btn btn-ghost add-set"
            data-testid="set-add"
            onclick={() => addSet(exercise)}
          >
            <Icon name="plus" size={20} /> Add set
          </button>
        </li>
      {/each}
    </ol>

    <div class="finish">
      <button
        type="button"
        class="btn btn-primary btn-lg btn-block"
        data-testid="workout-finish"
        onclick={finish}
      >
        <Icon name="check" size={22} /> Finish workout
      </button>
      <button
        type="button"
        class="btn btn-danger-ghost btn-block"
        data-testid="workout-discard"
        onclick={() => (confirming = 'discard')}
      >
        <Icon name="trash" size={20} /> Discard workout
      </button>
    </div>
  {/if}
</div>

<ConfirmDialog
  open={confirming !== null}
  title={confirming === 'discard' ? 'Discard this workout?' : 'No sets ticked off'}
  message={confirming === 'discard'
    ? 'Everything logged in this workout is deleted. This cannot be undone.'
    : 'Finish anyway? The workout is saved to your history without completed sets.'}
  confirmLabel={confirming === 'discard' ? 'Discard' : 'Finish'}
  danger={confirming === 'discard'}
  onconfirm={() => (confirming === 'discard' ? discard() : finish())}
  oncancel={() => (confirming = null)}
/>

<style>
  .progress {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-4);
    padding: var(--space-3) var(--space-4);
  }

  .progress-text {
    color: var(--text-2);
    font-size: var(--text-sm);
  }

  .progress-text strong {
    color: var(--text);
    font-size: var(--text-md);
    font-variant-numeric: tabular-nums;
  }

  .bar {
    height: 8px;
    overflow: hidden;
    border-radius: var(--radius-pill);
    background: var(--surface-2);
  }

  .bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--accent);
    transition: width 200ms ease;
  }

  .exercises {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    margin: 0 0 var(--space-6);
    padding: 0;
    list-style: none;
  }

  .exercise {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-4) var(--space-2) var(--space-2);
  }

  .head {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: 0 var(--space-2);
  }

  .number {
    display: grid;
    flex: none;
    place-items: center;
    width: 26px;
    height: 26px;
    margin-top: 1px;
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    color: var(--text-2);
    font-size: var(--text-xs);
    font-weight: 800;
  }

  .titles {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .name {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    align-self: flex-start;
    color: var(--text);
    font-size: var(--text-lg);
    font-weight: 750;
    line-height: 1.25;
    text-decoration: none;
  }

  a.name :global(.icon) {
    color: var(--text-3);
  }

  .missing {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--warning-text);
    font-size: var(--text-xs);
    font-weight: 700;
  }

  .target {
    color: var(--text-2);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  .notes {
    color: var(--text-3);
    font-size: var(--text-sm);
    font-style: italic;
  }

  .last-time {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    margin: var(--space-1) var(--space-2) 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text-2);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  .last-time :global(.icon) {
    margin-top: 2px;
    color: var(--text-3);
  }

  .last-label {
    color: var(--text);
    font-weight: 700;
  }

  .columns {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) minmax(0, 1fr) var(--tap) var(--tap);
    gap: 6px;
    margin-top: var(--space-2);
    padding: 0 var(--space-2) 0 var(--space-3);
    color: var(--text-3);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-align: center;
    text-transform: uppercase;
  }

  .sets {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .add-set {
    align-self: flex-start;
    margin-left: var(--space-1);
  }

  .finish {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
</style>
