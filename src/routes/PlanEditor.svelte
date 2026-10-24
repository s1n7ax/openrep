<!--
  Plan editor (`#/plans/:id/edit`): name; days added, renamed, reordered and
  deleted; exercises added through the picker, targets edited, reordered and
  removed; exercises grouped into supersets. Every change is saved as it is
  made.
-->
<script lang="ts">
  import ConfirmDialog from '../components/ConfirmDialog.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import SupersetEditor from '../components/SupersetEditor.svelte';
  import TargetEditor from '../components/TargetEditor.svelte';
  import { newId, nowIso } from '../lib/ids.ts';
  import { paths, router } from '../lib/router.ts';
  import type { PlanDay } from '../lib/schema/userData.ts';
  import { userData } from '../lib/stores/userData.svelte.ts';
  import {
    addDay,
    dayBlocks,
    deleteDay,
    deletePlan,
    moveDay,
    renameDay,
    renamePlan,
  } from '../lib/userData/plans.ts';
  import { findPlan } from '../lib/userData/selectors.ts';
  import { blockKey } from '../lib/userData/supersets.ts';

  let { planId }: { planId: string } = $props();

  const plan = $derived(findPlan(userData.data, planId));
  const unit = $derived(userData.data.settings.unit);

  let deletingDay = $state<PlanDay | null>(null);
  let deletingPlan = $state(false);

  function addNewDay() {
    const dayId = newId();
    const name = `Day ${(plan?.days.length ?? 0) + 1}`;
    userData.update((data) => addDay(data, planId, { id: dayId, name }, nowIso()));
  }

  function removeDay(day: PlanDay) {
    if (day.exercises.length > 0) deletingDay = day;
    else userData.update((data) => deleteDay(data, planId, day.id, nowIso()));
  }

  function confirmDeleteDay() {
    const day = deletingDay;
    deletingDay = null;
    if (day) userData.update((data) => deleteDay(data, planId, day.id, nowIso()));
  }

  function confirmDeletePlan() {
    deletingPlan = false;
    userData.update((data) => deletePlan(data, planId));
    router.navigate(paths.plans(), { replace: true });
  }
</script>

<PageHeader title="Edit plan" back>
  {#snippet actions()}
    {#if plan}
      <button
        type="button"
        class="btn btn-primary done"
        data-testid="editor-done"
        onclick={() => router.backTo(paths.plan(planId))}
      >
        Done
      </button>
    {/if}
  {/snippet}
</PageHeader>

<div class="page">
  {#if !plan}
    <EmptyState icon="alert" title="Plan not found" text="It may have been deleted." />
  {:else}
    <div class="field name-field">
      <label class="field-label" for="plan-name">Plan name</label>
      <input
        id="plan-name"
        class="input plan-name"
        type="text"
        autocomplete="off"
        maxlength="80"
        placeholder="Untitled plan"
        data-testid="edit-plan-name"
        value={plan.name}
        oninput={(event) => {
          const name = event.currentTarget.value;
          userData.update((data) => renamePlan(data, planId, name, nowIso()));
        }}
      />
    </div>

    <div class="days">
      {#each plan.days as day, dayIndex (day.id)}
        <section class="day card" data-testid="edit-day" data-day-id={day.id}>
          <div class="day-head">
            <label class="visually-hidden" for={`day-name-${day.id}`}>Day {dayIndex + 1} name</label
            >
            <input
              id={`day-name-${day.id}`}
              class="input day-name"
              type="text"
              autocomplete="off"
              maxlength="60"
              placeholder={`Day ${dayIndex + 1}`}
              data-testid="day-name-input"
              value={day.name}
              oninput={(event) => {
                const name = event.currentTarget.value;
                userData.update((data) => renameDay(data, planId, day.id, name, nowIso()));
              }}
            />
            <div class="tools">
              <button
                type="button"
                class="icon-btn"
                aria-label={`Move day ${dayIndex + 1} up`}
                data-testid="day-move-up"
                disabled={dayIndex === 0}
                onclick={() =>
                  userData.update((data) => moveDay(data, planId, day.id, -1, nowIso()))}
              >
                <Icon name="chevron-up" />
              </button>
              <button
                type="button"
                class="icon-btn"
                aria-label={`Move day ${dayIndex + 1} down`}
                data-testid="day-move-down"
                disabled={dayIndex === plan.days.length - 1}
                onclick={() =>
                  userData.update((data) => moveDay(data, planId, day.id, 1, nowIso()))}
              >
                <Icon name="chevron-down" />
              </button>
              <button
                type="button"
                class="icon-btn danger"
                aria-label={`Delete day ${dayIndex + 1}`}
                data-testid="day-delete"
                onclick={() => removeDay(day)}
              >
                <Icon name="trash" />
              </button>
            </div>
          </div>

          {#if day.exercises.length > 0}
            {@const blocks = dayBlocks(day)}
            <ol class="exercises">
              {#each blocks as block, blockIndex (blockKey(block))}
                {@const last = blockIndex === blocks.length - 1}
                {#if block.kind === 'exercise'}
                  <TargetEditor
                    {planId}
                    dayId={day.id}
                    entry={block.entry}
                    label={String(block.index + 1)}
                    canMoveUp={blockIndex > 0}
                    canMoveDown={!last}
                    canJoinNext={!last}
                    {unit}
                  />
                {:else}
                  <SupersetEditor
                    {planId}
                    dayId={day.id}
                    superset={block.superset}
                    letter={block.letter}
                    entries={block.entries}
                    canMoveUp={blockIndex > 0}
                    canMoveDown={!last}
                    canJoinNext={!last}
                    {unit}
                  />
                {/if}
              {/each}
            </ol>
          {/if}

          <div class="day-foot">
            <button
              type="button"
              class="btn btn-outline btn-block add-exercise"
              data-testid="add-exercise"
              onclick={() => router.navigate(paths.planAddExercise(planId, day.id))}
            >
              <Icon name="plus" size={20} /> Add exercise
            </button>
          </div>
        </section>
      {/each}
    </div>

    <button
      type="button"
      class="btn btn-primary btn-lg btn-block"
      data-testid="add-day"
      onclick={addNewDay}
    >
      <Icon name="plus" size={20} /> Add day
    </button>

    <button
      type="button"
      class="btn btn-danger-ghost btn-block delete-plan"
      data-testid="delete-plan"
      onclick={() => (deletingPlan = true)}
    >
      <Icon name="trash" size={20} /> Delete plan
    </button>

    <ConfirmDialog
      open={deletingDay !== null}
      title={`Delete “${deletingDay?.name.trim() || 'this day'}”?`}
      message={`It has ${deletingDay?.exercises.length ?? 0} exercise(s). They are removed from the plan.`}
      confirmLabel="Delete day"
      danger
      onconfirm={confirmDeleteDay}
      oncancel={() => (deletingDay = null)}
    />
    <ConfirmDialog
      open={deletingPlan}
      title={`Delete “${plan.name.trim() || 'Untitled plan'}”?`}
      message="The plan is removed. Workouts you logged from it stay in your history."
      confirmLabel="Delete plan"
      danger
      onconfirm={confirmDeletePlan}
      oncancel={() => (deletingPlan = false)}
    />
  {/if}
</div>

<style>
  .done {
    min-height: 40px;
    margin-right: var(--space-1);
  }

  .name-field {
    margin-bottom: var(--space-5);
  }

  .plan-name {
    min-height: var(--tap-lg);
    font-size: var(--text-lg);
    font-weight: 700;
  }

  .days {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    margin-bottom: var(--space-4);
  }

  .day {
    overflow: hidden;
  }

  .day-head {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    padding: var(--space-3) var(--space-2) var(--space-3) var(--space-3);
    border-bottom: 1px solid var(--border);
    background: var(--surface-2);
  }

  .day-name {
    flex: 1;
    font-weight: 700;
  }

  .tools {
    display: flex;
    flex: none;
  }

  .exercises {
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .exercises :global(li + li) {
    border-top: 1px solid var(--border);
  }

  .day-foot {
    padding: var(--space-3) var(--space-4) var(--space-4);
  }

  .add-exercise {
    border-style: dashed;
  }

  .delete-plan {
    margin-top: var(--space-6);
  }
</style>
