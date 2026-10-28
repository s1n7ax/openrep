<!--
  A plan (`#/plans/:id`): its days with exercises, supersets and targets,
  "Start" per day (creates a session and opens the workout), Edit and Submit.
-->
<script lang="ts">
  import Dialog from '../components/Dialog.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import SubmitCard from '../components/SubmitCard.svelte';
  import SupersetLabel from '../components/SupersetLabel.svelte';
  import {
    planToSchedule,
    randomSuffix,
    scheduleContribution,
    type Contribution,
  } from '../lib/contribute.ts';
  import { resolveExerciseRef } from '../lib/exerciseRef.ts';
  import { newId, nowIso } from '../lib/ids.ts';
  import { exportPlanFile } from '../lib/planFileIO.ts';
  import { paths, router } from '../lib/router.ts';
  import type { Plan, PlanDay, PlanExercise } from '../lib/schema/userData.ts';
  import { catalog } from '../lib/stores/catalog.svelte.ts';
  import { userData } from '../lib/stores/userData.svelte.ts';
  import { dayBlocks } from '../lib/userData/plans.ts';
  import { activeSession, findPlan, planStats } from '../lib/userData/selectors.ts';
  import { deleteSession, startSession } from '../lib/userData/sessions.ts';
  import { blockKey, supersetExerciseLabel } from '../lib/userData/supersets.ts';
  import {
    formatSupersetExerciseTarget,
    formatSupersetSummary,
    formatTargetWithRest,
  } from '../lib/userData/targets.ts';

  let { planId }: { planId: string } = $props();

  const plan = $derived(findPlan(userData.data, planId));
  const unit = $derived(userData.data.settings.unit);
  const active = $derived(activeSession(userData.data));
  /** A day the user wants to start while another workout is in progress. */
  let pendingDay = $state<PlanDay | null>(null);
  let exporting = $state(false);
  let exportMessage = $state<string | null>(null);
  let exportError = $state<string | null>(null);

  async function exportCurrent() {
    const current = plan;
    if (!current || exporting) return;
    exportMessage = null;
    exportError = null;
    exporting = true;
    try {
      const outcome = await exportPlanFile(current, userData.data.customExercises);
      if (outcome === 'downloaded') exportMessage = 'Plan file saved to your downloads.';
      else if (outcome === 'shared') exportMessage = 'Plan file ready to share.';
    } catch (error) {
      console.error('Exporting the plan file failed:', error);
      exportError = 'The plan file could not be created. Try again.';
    } finally {
      exporting = false;
    }
  }

  function begin(day: PlanDay) {
    const sessionId = newId();
    userData.update((data) =>
      startSession(data, { sessionId, planId, dayId: day.id }, nowIso(), newId),
    );
    router.navigate(paths.workout(sessionId));
  }

  function start(day: PlanDay) {
    if (active) pendingDay = day;
    else begin(day);
  }

  function resumeActive() {
    pendingDay = null;
    if (active) router.navigate(paths.workout(active.id));
  }

  function discardAndStart() {
    const day = pendingDay;
    const current = active;
    pendingDay = null;
    if (!day) return;
    if (current) userData.update((data) => deleteSession(data, current.id));
    begin(day);
  }

  /** The plan as a new schedule file, to submit. */
  function scheduleFile(current: Plan): Contribution {
    return scheduleContribution(
      planToSchedule(current, {
        customExercises: userData.data.customExercises,
        findExercise: (id) => catalog.exercise(id),
        suffix: randomSuffix(),
      }),
    );
  }

  function dayName(day: PlanDay, index: number): string {
    return day.name.trim() || `Day ${index + 1}`;
  }
</script>

<PageHeader title={plan ? plan.name.trim() || 'Untitled plan' : 'Plan'} back={paths.plans()}>
  {#snippet actions()}
    {#if plan}
      <button
        type="button"
        class="btn btn-ghost header-action"
        disabled={exporting}
        data-testid="plan-export"
        onclick={exportCurrent}
      >
        Export
      </button>
      <button
        type="button"
        class="btn btn-ghost header-action"
        data-testid="plan-edit"
        onclick={() => router.navigate(paths.planEdit(planId))}
      >
        <Icon name="edit" size={20} /> Edit
      </button>
    {/if}
  {/snippet}
</PageHeader>

<div class="page">
  {#if exportError}
    <p class="message error" role="alert" data-testid="plan-export-error">
      <Icon name="alert" size={18} />
      {exportError}
    </p>
  {:else if exportMessage}
    <p class="message ok" role="status" data-testid="plan-export-message">
      <Icon name="check" size={18} />
      {exportMessage}
    </p>
  {/if}

  {#if !plan}
    <EmptyState
      icon="alert"
      title="Plan not found"
      text="It may have been deleted."
      testid="plan-not-found"
    >
      {#snippet actions()}
        <a class="btn btn-primary" href="#/">Go to plans</a>
      {/snippet}
    </EmptyState>
  {:else if plan.days.length === 0}
    <EmptyState
      icon="calendar"
      title="No days yet"
      text="Add training days and exercises to this plan."
    >
      {#snippet actions()}
        <button
          type="button"
          class="btn btn-primary btn-lg"
          onclick={() => router.navigate(paths.planEdit(planId))}
        >
          Edit plan
        </button>
      {/snippet}
    </EmptyState>
  {:else}
    <div class="days">
      {#each plan.days as day, dayIndex (day.id)}
        <section
          class="day card"
          data-testid="plan-day"
          data-day-id={day.id}
          aria-labelledby={`day-${day.id}`}
        >
          <header class="day-head">
            <div class="day-titles">
              <h2 id={`day-${day.id}`} class="day-name">{dayName(day, dayIndex)}</h2>
              <p class="day-meta">
                {day.exercises.length}
                {day.exercises.length === 1 ? 'exercise' : 'exercises'}
              </p>
            </div>
            <button
              type="button"
              class="btn btn-primary start"
              data-testid="day-start"
              disabled={day.exercises.length === 0}
              onclick={() => start(day)}
            >
              <Icon name="play" size={18} /> Start
            </button>
          </header>

          {#if day.exercises.length === 0}
            <p class="empty-day">No exercises on this day yet.</p>
          {:else}
            <ol class="exercises">
              {#each dayBlocks(day) as block (blockKey(block))}
                {#if block.kind === 'exercise'}
                  {@render exerciseItem(
                    block.entry,
                    String(block.index + 1),
                    formatTargetWithRest(block.entry, unit),
                  )}
                {:else}
                  <li
                    class="superset"
                    data-testid="plan-superset"
                    data-superset-id={block.superset.id}
                  >
                    <div class="superset-head">
                      <SupersetLabel
                        letter={block.letter}
                        summary={formatSupersetSummary(
                          block.entries[0]?.sets ?? 0,
                          block.superset.restSec,
                        )}
                        testid="plan-superset-summary"
                      />
                    </div>
                    <ol class="superset-exercises">
                      {#each block.entries as entry, position (entry.id)}
                        {@render exerciseItem(
                          entry,
                          supersetExerciseLabel(block.letter, position),
                          formatSupersetExerciseTarget(entry, unit),
                        )}
                      {/each}
                    </ol>
                  </li>
                {/if}
              {/each}
            </ol>
          {/if}
        </section>
      {/each}
    </div>

    <SubmitCard
      title="Share this plan"
      text="Submit opens GitHub with your plan ready to add as a community schedule."
      canSubmit={planStats(plan).exercises > 0}
      hint="Add exercises to submit this plan."
      build={() => scheduleFile(plan)}
      invalidMessage="This plan cannot be submitted as a schedule."
      testid="plan-submit"
    />
  {/if}
</div>

{#snippet exerciseItem(entry: PlanExercise, label: string, target: string)}
  {@const resolved = resolveExerciseRef(
    entry.exercise,
    (id) => catalog.exercise(id),
    userData.data.customExercises,
  )}
  <li data-testid="plan-exercise" data-plan-exercise-id={entry.id}>
    <svelte:element
      this={resolved.link ? 'a' : 'div'}
      class="exercise"
      class:link={!!resolved.link}
      href={resolved.link ?? undefined}
    >
      <span class="number" aria-hidden="true" data-testid="plan-exercise-label">{label}</span>
      <span class="exercise-text">
        <span class="exercise-name" data-testid="plan-exercise-name">{resolved.name}</span>
        {#if resolved.note}
          <span class="missing" data-testid="missing-note">
            <Icon name="alert" size={14} />
            {resolved.note}
          </span>
        {/if}
        <span class="target" data-testid="plan-exercise-target">{target}</span>
        {#if entry.notes}
          <span class="notes">{entry.notes}</span>
        {/if}
      </span>
      {#if resolved.exercise && catalog.isAnimated(resolved.exercise.id)}
        <span class="badge">3D</span>
      {/if}
      {#if resolved.link}
        <span class="chevron"><Icon name="chevron-right" size={18} /></span>
      {/if}
    </svelte:element>
  </li>
{/snippet}

<Dialog
  open={pendingDay !== null}
  title="A workout is in progress"
  onclose={() => (pendingDay = null)}
  testid="active-workout-dialog"
>
  {#if active}
    <p>
      You are logging <strong>{active.planName} · {active.dayName}</strong>. Resume it, or discard
      it and start {pendingDay
        ? dayName(pendingDay, plan?.days.indexOf(pendingDay) ?? 0)
        : 'this day'}?
    </p>
  {/if}
  {#snippet actions()}
    <button
      type="button"
      class="btn btn-danger-ghost"
      data-testid="discard-and-start"
      onclick={discardAndStart}
    >
      Discard and start
    </button>
    <button
      type="button"
      class="btn btn-primary"
      data-testid="resume-active"
      onclick={resumeActive}
    >
      Resume workout
    </button>
  {/snippet}
</Dialog>

<style>
  .header-action {
    min-height: 40px;
    padding: 0 var(--space-3);
  }

  .days {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    margin-bottom: var(--space-6);
  }

  .day {
    overflow: hidden;
  }

  .day-head {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-4);
    border-bottom: 1px solid var(--border);
  }

  .day-titles {
    flex: 1;
    min-width: 0;
  }

  .day-name {
    overflow: hidden;
    font-size: var(--text-lg);
    font-weight: 750;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .day-meta {
    color: var(--text-3);
    font-size: var(--text-sm);
  }

  .start {
    flex: none;
    min-width: 104px;
  }

  .empty-day {
    padding: var(--space-4);
    color: var(--text-3);
  }

  .exercises {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .exercise {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    min-height: 56px;
    padding: var(--space-3) var(--space-4);
    color: inherit;
    text-decoration: none;
  }

  .exercise.link:active {
    background: var(--surface-2);
  }

  .exercises li + li {
    border-top: 1px solid var(--border);
  }

  .superset {
    border-left: 3px solid var(--accent);
  }

  .superset-head {
    padding: var(--space-3) var(--space-4) 0 calc(var(--space-4) - 3px);
  }

  .superset-exercises {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .superset .exercise {
    padding-left: calc(var(--space-4) - 3px);
  }

  .chevron {
    align-self: center;
    color: var(--text-3);
  }

  .number {
    display: grid;
    flex: none;
    place-items: center;
    min-width: 26px;
    height: 26px;
    padding: 0 var(--space-1);
    margin-top: 1px;
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    color: var(--text-2);
    font-size: var(--text-xs);
    font-weight: 800;
  }

  .superset .number {
    background: var(--accent-soft);
    color: var(--accent-text);
  }

  .exercise-text {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .exercise-name {
    font-weight: 650;
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
</style>
