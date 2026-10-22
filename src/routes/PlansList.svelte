<!--
  Plans tab (`#/`): the user's plans; create, reorder (up/down), delete with
  confirmation, and resume a workout in progress.
-->
<script lang="ts">
  import ConfirmDialog from '../components/ConfirmDialog.svelte';
  import Dialog from '../components/Dialog.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import { newId, nowIso } from '../lib/ids.ts';
  import { href, paths, router } from '../lib/router.ts';
  import type { Plan } from '../lib/schema/userData.ts';
  import { userData } from '../lib/stores/userData.svelte.ts';
  import { createPlan, deletePlan, movePlan } from '../lib/userData/plans.ts';
  import { activeSession, planStats } from '../lib/userData/selectors.ts';

  const plans = $derived(userData.data.plans);
  const active = $derived(activeSession(userData.data));

  let reordering = $state(false);
  let creating = $state(false);
  let newName = $state('');
  let deleting = $state<Plan | null>(null);

  /** Edit mode (reorder and delete buttons); off once the last plan is deleted. */
  const editing = $derived(reordering && plans.length > 0);

  function openCreate() {
    newName = '';
    creating = true;
  }

  function create(event: SubmitEvent) {
    event.preventDefault();
    const id = newId();
    const name = newName.trim() || `Plan ${plans.length + 1}`;
    userData.update((data) =>
      createPlan(data, { id, name, firstDay: { id: newId(), name: 'Day 1' } }, nowIso()),
    );
    creating = false;
    router.navigate(paths.planEdit(id));
  }

  function confirmDelete() {
    const plan = deleting;
    deleting = null;
    if (plan) userData.update((data) => deletePlan(data, plan.id));
  }

  function summary(plan: Plan): string {
    const { days, exercises } = planStats(plan);
    return `${days} ${days === 1 ? 'day' : 'days'} · ${exercises} ${exercises === 1 ? 'exercise' : 'exercises'}`;
  }

  function displayName(plan: Plan): string {
    return plan.name.trim() || 'Untitled plan';
  }
</script>

<PageHeader title="Plans" large>
  {#snippet actions()}
    {#if plans.length > 0}
      <button
        type="button"
        class="btn btn-ghost reorder-toggle"
        aria-pressed={editing}
        data-testid="plans-reorder-toggle"
        onclick={() => (reordering = !editing)}
      >
        {editing ? 'Done' : 'Edit'}
      </button>
    {/if}
  {/snippet}
</PageHeader>

<div class="page with-fab">
  {#if active}
    <a class="resume" href={href(paths.workout(active.id))} data-testid="resume-workout">
      <span class="resume-icon"><Icon name="play" size={20} /></span>
      <span class="resume-text">
        <span class="resume-title">Workout in progress</span>
        <span class="resume-meta">{active.planName} · {active.dayName}</span>
      </span>
      <span class="resume-action">Resume</span>
    </a>
  {/if}

  {#if plans.length === 0}
    <EmptyState
      icon="plans"
      title="No plans yet"
      text="Create one or copy a starter schedule."
      testid="plans-empty"
    >
      {#snippet actions()}
        <button
          type="button"
          class="btn btn-primary btn-lg"
          data-testid="new-plan"
          onclick={openCreate}
        >
          <Icon name="plus" size={20} /> Create a plan
        </button>
        <a
          class="btn btn-outline btn-lg"
          href={href(paths.schedules())}
          data-testid="browse-schedules"
        >
          Browse starter schedules
        </a>
      {/snippet}
    </EmptyState>
  {:else}
    <ul class="plans" aria-label="Your plans">
      {#each plans as plan, index (plan.id)}
        <li class="plan card" data-testid="plan-card" data-plan-id={plan.id}>
          {#if editing}
            <div class="plan-row">
              <div class="plan-text">
                <h2 class="plan-name">{displayName(plan)}</h2>
                <p class="plan-meta">{summary(plan)}</p>
              </div>
              <div class="tools">
                <button
                  type="button"
                  class="icon-btn"
                  aria-label={`Move ${displayName(plan)} up`}
                  data-testid="plan-move-up"
                  disabled={index === 0}
                  onclick={() => userData.update((data) => movePlan(data, plan.id, -1))}
                >
                  <Icon name="chevron-up" />
                </button>
                <button
                  type="button"
                  class="icon-btn"
                  aria-label={`Move ${displayName(plan)} down`}
                  data-testid="plan-move-down"
                  disabled={index === plans.length - 1}
                  onclick={() => userData.update((data) => movePlan(data, plan.id, 1))}
                >
                  <Icon name="chevron-down" />
                </button>
                <button
                  type="button"
                  class="icon-btn danger"
                  aria-label={`Delete ${displayName(plan)}`}
                  data-testid="plan-delete"
                  onclick={() => (deleting = plan)}
                >
                  <Icon name="trash" />
                </button>
              </div>
            </div>
          {:else}
            <a class="plan-row link" href={href(paths.plan(plan.id))} data-testid="plan-link">
              <div class="plan-text">
                <h2 class="plan-name">{displayName(plan)}</h2>
                <p class="plan-meta">{summary(plan)}</p>
                {#if plan.days.length > 0}
                  <ul class="day-names" aria-label="Days">
                    {#each plan.days as day (day.id)}
                      <li>{day.name.trim() || 'Untitled day'}</li>
                    {/each}
                  </ul>
                {/if}
              </div>
              <span class="chevron"><Icon name="chevron-right" size={20} /></span>
            </a>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}
</div>

{#if plans.length > 0 && !editing}
  <button
    type="button"
    class="fab btn btn-primary btn-lg"
    data-testid="new-plan"
    onclick={openCreate}
  >
    <Icon name="plus" size={22} /> New plan
  </button>
{/if}

<Dialog
  open={creating}
  title="New plan"
  onclose={() => (creating = false)}
  testid="new-plan-dialog"
>
  <form id="new-plan-form" class="new-plan" onsubmit={create}>
    <label class="field-label" for="new-plan-name">Name</label>
    <input
      id="new-plan-name"
      class="input"
      type="text"
      autocomplete="off"
      enterkeyhint="done"
      maxlength="80"
      placeholder={`Plan ${plans.length + 1}`}
      data-testid="new-plan-name"
      bind:value={newName}
    />
  </form>
  {#snippet actions()}
    <button type="button" class="btn btn-outline" onclick={() => (creating = false)}>Cancel</button>
    <button
      type="submit"
      form="new-plan-form"
      class="btn btn-primary"
      data-testid="new-plan-create"
    >
      Create
    </button>
  {/snippet}
</Dialog>

<ConfirmDialog
  open={deleting !== null}
  title={`Delete “${deleting ? displayName(deleting) : ''}”?`}
  message="The plan is removed. Workouts you logged from it stay in your history."
  confirmLabel="Delete plan"
  danger
  onconfirm={confirmDelete}
  oncancel={() => (deleting = null)}
/>

<style>
  .with-fab {
    padding-bottom: 112px;
  }

  .reorder-toggle {
    min-height: 40px;
    padding: 0 var(--space-3);
  }

  .resume {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-lg);
    background: var(--accent);
    color: var(--on-accent);
    text-decoration: none;
    box-shadow: var(--shadow-md);
  }

  .resume-icon {
    display: grid;
    flex: none;
    place-items: center;
    width: 40px;
    height: 40px;
    border-radius: var(--radius-pill);
    background: rgb(255 255 255 / 0.2);
  }

  .resume-text {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  .resume-title {
    font-weight: 750;
  }

  .resume-meta {
    overflow: hidden;
    font-size: var(--text-sm);
    opacity: 0.9;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .resume-action {
    font-weight: 750;
  }

  .plans {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .plan-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 76px;
    padding: var(--space-4);
    color: inherit;
    text-decoration: none;
  }

  .plan-row.link:active {
    background: var(--surface-2);
    border-radius: var(--radius-lg);
  }

  .plan-text {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .plan-name {
    overflow: hidden;
    font-size: var(--text-lg);
    font-weight: 750;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .plan-meta {
    color: var(--text-3);
    font-size: var(--text-sm);
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

  .tools {
    display: flex;
    flex: none;
  }

  .fab {
    position: fixed;
    right: calc(var(--space-4) + var(--safe-right));
    bottom: calc(var(--tabbar-height) + var(--safe-bottom) + var(--space-4));
    z-index: 25;
    box-shadow: var(--shadow-md);
  }

  .new-plan {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
  }
</style>
