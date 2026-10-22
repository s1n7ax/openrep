<!--
  Schedules tab (`#/schedules`): the community schedules of the catalog,
  each opening its detail page where it can be copied into the user's plans.
-->
<script lang="ts">
  import EmptyState from '../components/EmptyState.svelte';
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import { valueLabel } from '../lib/labels.ts';
  import { href, paths } from '../lib/router.ts';
  import type { Schedule } from '../lib/schema/schedule.ts';
  import { catalog } from '../lib/stores/catalog.svelte.ts';
  import { scheduleExerciseCount } from '../lib/userData/schedules.ts';

  const LEVEL_ORDER = { beginner: 0, intermediate: 1, expert: 2 } as const;

  /** Easiest first, then by name. */
  const schedules = $derived(
    [...catalog.schedules].sort(
      (a, b) =>
        (a.level ? LEVEL_ORDER[a.level] : 3) - (b.level ? LEVEL_ORDER[b.level] : 3) ||
        a.name.localeCompare(b.name),
    ),
  );

  function summary(schedule: Schedule): string {
    const days = schedule.days.length;
    const exercises = scheduleExerciseCount(schedule);
    return `${days} ${days === 1 ? 'day' : 'days'} · ${exercises} ${exercises === 1 ? 'exercise' : 'exercises'}`;
  }
</script>

<PageHeader title="Schedules" large />

<div class="page">
  <p class="lead">
    Ready-made schedules from the community. Copy one into your plans and make it yours.
  </p>

  {#if schedules.length === 0}
    <EmptyState
      icon="calendar"
      title="No schedules"
      text="The catalog has no schedules yet."
      testid="schedules-empty"
    />
  {:else}
    <ul class="schedules" aria-label="Schedules">
      {#each schedules as schedule (schedule.id)}
        <li class="card" data-testid="schedule-card" data-schedule-id={schedule.id}>
          <a class="row" href={href(paths.schedule(schedule.id))} data-testid="schedule-link">
            <div class="text">
              <div class="title-line">
                <h2 class="name">{schedule.name}</h2>
                {#if schedule.level}
                  <span class="badge level">{valueLabel(schedule.level)}</span>
                {/if}
              </div>
              <p class="meta">{summary(schedule)}</p>
              {#if schedule.description}
                <p class="description">{schedule.description}</p>
              {/if}
              <ul class="day-names" aria-label="Days">
                {#each schedule.days as day, index (index)}
                  <li>{day.name}</li>
                {/each}
              </ul>
            </div>
            <span class="chevron"><Icon name="chevron-right" size={20} /></span>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</div>

<style>
  .lead {
    margin-bottom: var(--space-4);
    color: var(--text-2);
  }

  .schedules {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-4);
    color: inherit;
    text-decoration: none;
  }

  .row:active {
    background: var(--surface-2);
    border-radius: var(--radius-lg);
  }

  .text {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .title-line {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-width: 0;
  }

  .name {
    overflow: hidden;
    font-size: var(--text-lg);
    font-weight: 750;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    color: var(--text-3);
    font-size: var(--text-sm);
  }

  .description {
    display: -webkit-box;
    margin-top: var(--space-1);
    overflow: hidden;
    color: var(--text-2);
    font-size: var(--text-sm);
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .day-names {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-top: var(--space-2);
    padding: 0;
    list-style: none;
  }

  .day-names li {
    padding: 2px var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    color: var(--text-2);
    font-size: var(--text-xs);
    font-weight: 650;
  }

  .chevron {
    color: var(--text-3);
  }
</style>
