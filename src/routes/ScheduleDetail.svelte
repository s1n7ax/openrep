<!--
  A community schedule (`#/schedules/:id`): description, days with exercises,
  supersets and targets, and "Copy to my plans", which creates an editable
  plan and opens it.
-->
<script lang="ts">
  import EmptyState from '../components/EmptyState.svelte';
  import FactGrid from '../components/FactGrid.svelte';
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import SupersetLabel from '../components/SupersetLabel.svelte';
  import { newId, nowIso } from '../lib/ids.ts';
  import { valueLabel } from '../lib/labels.ts';
  import { href, paths, router } from '../lib/router.ts';
  import type { ScheduleDayV2, ScheduleSupersetExercise } from '../lib/schema/schedule.ts';
  import { catalog } from '../lib/stores/catalog.svelte.ts';
  import { userData } from '../lib/stores/userData.svelte.ts';
  import {
    copyScheduleToPlan,
    scheduleDayBlocks,
    scheduleDayExerciseCount,
    scheduleExerciseCount,
  } from '../lib/userData/schedules.ts';
  import { supersetExerciseLabel } from '../lib/userData/supersets.ts';
  import {
    formatSupersetExerciseTarget,
    formatSupersetSummary,
    formatTargetWithRest,
  } from '../lib/userData/targets.ts';

  let { scheduleId }: { scheduleId: string } = $props();

  const schedule = $derived(catalog.schedule(scheduleId));
  // A version 1 day is a version 2 day without supersets.
  const days = $derived<readonly ScheduleDayV2[]>(schedule?.days ?? []);
  const unit = $derived(userData.data.settings.unit);

  /** How an entry is shown: catalog exercises link to their page; name-only entries are plain text. */
  function display(entry: ScheduleSupersetExercise): {
    name: string;
    link: string | null;
    note: string | null;
    animated: boolean;
  } {
    const exercise =
      entry.exerciseId === undefined ? undefined : catalog.exercise(entry.exerciseId);
    if (exercise) {
      return {
        name: exercise.name,
        link: href(paths.exercise(exercise.id)),
        note: null,
        animated: catalog.isAnimated(exercise.id),
      };
    }
    return {
      name: entry.name ?? entry.exerciseId ?? 'Exercise',
      link: null,
      note: entry.exerciseId === undefined ? 'Added as a custom exercise' : 'Not in your catalog',
      animated: false,
    };
  }

  function copy() {
    const current = schedule;
    if (!current) return;
    const planId = newId();
    userData.update((data) =>
      copyScheduleToPlan(data, current, {
        planId,
        newId,
        now: nowIso(),
        findExercise: (id) => catalog.exercise(id),
      }),
    );
    router.navigate(paths.plan(planId));
  }
</script>

<PageHeader title={schedule?.name ?? 'Schedule'} back={paths.schedules()} />

<div class="page">
  {#if !schedule}
    <EmptyState
      icon="alert"
      title="Schedule not found"
      text="It is not in the current catalog."
      testid="schedule-not-found"
    />
  {:else}
    <section class="intro">
      <p class="eyebrow">Community schedule</p>
      <h2 class="name" data-testid="schedule-name">{schedule.name}</h2>
      {#if schedule.description}
        <p class="description" data-testid="schedule-description">{schedule.description}</p>
      {/if}
    </section>

    <div class="block">
      <FactGrid
        facts={[
          ...(schedule.level ? [{ label: 'Level', value: valueLabel(schedule.level) }] : []),
          { label: 'Days', value: String(schedule.days.length) },
          { label: 'Exercises', value: String(scheduleExerciseCount(schedule)) },
        ]}
      />
    </div>

    <button
      type="button"
      class="btn btn-primary btn-lg btn-block copy"
      data-testid="schedule-copy"
      onclick={copy}
    >
      <Icon name="plus" size={22} /> Copy to my plans
    </button>
    <p class="copy-hint">
      You get your own copy to edit: rename days, change sets and swap exercises.
    </p>

    <div class="days">
      {#each days as day, dayIndex (dayIndex)}
        {@const count = scheduleDayExerciseCount(day)}
        <section class="day card" data-testid="schedule-day" aria-labelledby={`sday-${dayIndex}`}>
          <header class="day-head">
            <h2 id={`sday-${dayIndex}`} class="day-name">{day.name}</h2>
            <p class="day-meta">
              {count}
              {count === 1 ? 'exercise' : 'exercises'}
            </p>
          </header>
          <ol class="exercises">
            {#each scheduleDayBlocks(day) as block, index (index)}
              {#if block.kind === 'exercise'}
                <li data-testid="schedule-exercise">
                  {@render exerciseRow(
                    block.entry,
                    String(block.number),
                    formatTargetWithRest(block.entry, unit),
                  )}
                </li>
              {:else}
                <li class="superset" data-testid="schedule-superset">
                  <div class="superset-head">
                    <SupersetLabel
                      letter={block.letter}
                      summary={formatSupersetSummary(block.superset.rounds, block.superset.restSec)}
                      testid="schedule-superset-summary"
                    />
                  </div>
                  <ol class="superset-exercises">
                    {#each block.superset.exercises as member, position (position)}
                      <li data-testid="schedule-exercise">
                        {@render exerciseRow(
                          member,
                          supersetExerciseLabel(block.letter, position),
                          formatSupersetExerciseTarget(member, unit),
                        )}
                      </li>
                    {/each}
                  </ol>
                </li>
              {/if}
            {/each}
          </ol>
        </section>
      {/each}
    </div>
  {/if}
</div>

{#snippet exerciseRow(entry: ScheduleSupersetExercise, label: string, target: string)}
  {@const shown = display(entry)}
  <svelte:element
    this={shown.link ? 'a' : 'div'}
    class="exercise"
    class:link={!!shown.link}
    href={shown.link ?? undefined}
  >
    <span class="number" aria-hidden="true" data-testid="schedule-exercise-label">{label}</span>
    <span class="exercise-text">
      <span class="exercise-name" data-testid="schedule-exercise-name">{shown.name}</span>
      {#if shown.note}
        <span class="note">{shown.note}</span>
      {/if}
      <span class="target">{target}</span>
      {#if entry.notes}
        <span class="notes">{entry.notes}</span>
      {/if}
    </span>
    {#if shown.animated}
      <span class="badge">3D</span>
    {/if}
    {#if shown.link}
      <span class="chevron"><Icon name="chevron-right" size={18} /></span>
    {/if}
  </svelte:element>
{/snippet}

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

  .name {
    font-size: var(--text-2xl);
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.15;
  }

  .description {
    margin-top: var(--space-1);
    color: var(--text-2);
  }

  .block {
    margin-bottom: var(--space-5);
  }

  .copy-hint {
    margin: var(--space-2) 0 var(--space-6);
    color: var(--text-3);
    font-size: var(--text-sm);
    text-align: center;
  }

  .days {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .day {
    overflow: hidden;
  }

  .day-head {
    padding: var(--space-4);
    border-bottom: 1px solid var(--border);
  }

  .day-name {
    font-size: var(--text-lg);
    font-weight: 750;
  }

  .day-meta {
    color: var(--text-3);
    font-size: var(--text-sm);
  }

  .exercises {
    margin: 0;
    padding: 0;
    list-style: none;
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

  .note {
    color: var(--text-3);
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

  .chevron {
    align-self: center;
    color: var(--text-3);
  }
</style>
