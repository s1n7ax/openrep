<!--
  A community schedule (`#/schedules/:id`): description, days with exercises
  and targets, and "Copy to my plans", which creates an editable plan and
  opens it.
-->
<script lang="ts">
  import EmptyState from '../components/EmptyState.svelte';
  import FactGrid from '../components/FactGrid.svelte';
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import { newId, nowIso } from '../lib/ids.ts';
  import { valueLabel } from '../lib/labels.ts';
  import { href, paths, router } from '../lib/router.ts';
  import type { ScheduleEntry } from '../lib/schema/schedule.ts';
  import { catalog } from '../lib/stores/catalog.svelte.ts';
  import { userData } from '../lib/stores/userData.svelte.ts';
  import { copyScheduleToPlan, scheduleExerciseCount } from '../lib/userData/schedules.ts';
  import { formatTargetWithRest } from '../lib/userData/targets.ts';

  let { scheduleId }: { scheduleId: string } = $props();

  const schedule = $derived(catalog.schedule(scheduleId));
  const unit = $derived(userData.data.settings.unit);

  /** How an entry is shown: catalog exercises link to their page; name-only entries are plain text. */
  function display(entry: ScheduleEntry): {
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
      {#each schedule.days as day, dayIndex (dayIndex)}
        <section class="day card" data-testid="schedule-day" aria-labelledby={`sday-${dayIndex}`}>
          <header class="day-head">
            <h2 id={`sday-${dayIndex}`} class="day-name">{day.name}</h2>
            <p class="day-meta">
              {day.exercises.length}
              {day.exercises.length === 1 ? 'exercise' : 'exercises'}
            </p>
          </header>
          <ol class="exercises">
            {#each day.exercises as entry, index (index)}
              {@const shown = display(entry)}
              <li data-testid="schedule-exercise">
                <svelte:element
                  this={shown.link ? 'a' : 'div'}
                  class="exercise"
                  class:link={!!shown.link}
                  href={shown.link ?? undefined}
                >
                  <span class="number" aria-hidden="true">{index + 1}</span>
                  <span class="exercise-text">
                    <span class="exercise-name">{shown.name}</span>
                    {#if shown.note}
                      <span class="note">{shown.note}</span>
                    {/if}
                    <span class="target">{formatTargetWithRest(entry, unit)}</span>
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
              </li>
            {/each}
          </ol>
        </section>
      {/each}
    </div>
  {/if}
</div>

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
    width: 26px;
    height: 26px;
    margin-top: 1px;
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    color: var(--text-2);
    font-size: var(--text-xs);
    font-weight: 800;
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
