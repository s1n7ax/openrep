<!--
  History tab (`#/history`): finished workouts, newest first, grouped by
  month, with date, plan and day, duration and sets done.
-->
<script lang="ts">
  import EmptyState from '../components/EmptyState.svelte';
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import { href, paths } from '../lib/router.ts';
  import type { Session } from '../lib/schema/userData.ts';
  import { userData } from '../lib/stores/userData.svelte.ts';
  import { history } from '../lib/userData/selectors.ts';
  import {
    formatMonth,
    formatSessionDuration,
    sessionSetCounts,
  } from '../lib/userData/workoutText.ts';

  const sessions = $derived(history(userData.data.sessions));

  /** Sessions in runs of the same month, keeping the newest-first order. */
  const months = $derived.by(() => {
    const groups: { month: string; sessions: Session[] }[] = [];
    for (const session of sessions) {
      const month = formatMonth(session.startedAt);
      const group = groups.at(-1);
      if (group?.month === month) group.sessions.push(session);
      else groups.push({ month, sessions: [session] });
    }
    return groups;
  });

  function dayOfMonth(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { day: 'numeric' });
  }

  function weekday(iso: string): string {
    return new Date(iso).toLocaleDateString(undefined, { weekday: 'short' });
  }

  function setsText(session: Session): string {
    const { done } = sessionSetCounts(session);
    return `${done} ${done === 1 ? 'set' : 'sets'}`;
  }
</script>

<PageHeader title="History" large />

<div class="page">
  {#if sessions.length === 0}
    <EmptyState
      icon="history"
      title="No workouts yet"
      text="Start a day from one of your plans. Finished workouts show up here."
      testid="history-empty"
    >
      {#snippet actions()}
        <a class="btn btn-primary btn-lg" href={href(paths.plans())}>Go to plans</a>
      {/snippet}
    </EmptyState>
  {:else}
    {#each months as group (group.month)}
      <section class="month" aria-label={group.month}>
        <h2 class="section-title">{group.month}</h2>
        <ul class="sessions card">
          {#each group.sessions as session (session.id)}
            <li>
              <a
                class="row"
                href={href(paths.historySession(session.id))}
                data-testid="history-row"
                data-session-id={session.id}
              >
                <span class="date" aria-hidden="true">
                  <span class="weekday">{weekday(session.startedAt)}</span>
                  <span class="day">{dayOfMonth(session.startedAt)}</span>
                </span>
                <span class="text">
                  <span class="title">{session.dayName.trim() || 'Workout'}</span>
                  <span class="plan">{session.planName.trim() || 'Untitled plan'}</span>
                  <span class="meta" data-testid="history-meta">
                    {formatSessionDuration(session.startedAt, session.finishedAt)} · {setsText(
                      session,
                    )}
                  </span>
                </span>
                <span class="chevron"><Icon name="chevron-right" size={20} /></span>
              </a>
            </li>
          {/each}
        </ul>
      </section>
    {/each}
  {/if}
</div>

<style>
  .month {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-bottom: var(--space-6);
  }

  .section-title {
    padding-left: var(--space-1);
  }

  .sessions {
    margin: 0;
    padding: 0;
    overflow: hidden;
    list-style: none;
  }

  .sessions li + li {
    border-top: 1px solid var(--border);
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 72px;
    padding: var(--space-3) var(--space-4);
    color: inherit;
    text-decoration: none;
  }

  .row:active {
    background: var(--surface-2);
  }

  .date {
    display: flex;
    flex: none;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 48px;
    height: 52px;
    border-radius: var(--radius-sm);
    background: var(--accent-soft);
    color: var(--accent-text);
    line-height: 1.1;
  }

  .weekday {
    font-size: var(--text-xs);
    font-weight: 700;
    text-transform: uppercase;
  }

  .day {
    font-size: var(--text-xl);
    font-weight: 800;
    font-variant-numeric: tabular-nums;
  }

  .text {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  .title {
    overflow: hidden;
    font-weight: 750;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .plan {
    overflow: hidden;
    color: var(--text-2);
    font-size: var(--text-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .meta {
    color: var(--text-3);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  .chevron {
    color: var(--text-3);
  }
</style>
