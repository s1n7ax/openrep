<!--
  The plan the assistant should build on: "Start fresh" or one of the user's
  plans, each with its days, so it is recognised by more than its name.
-->
<script lang="ts">
  import type { Plan } from '../lib/schema/userData.ts';
  import { planStats } from '../lib/userData/selectors.ts';
  import Icon from './Icon.svelte';

  interface Props {
    plans: readonly Plan[];
    selected: string | null;
    onchange: (planId: string | null) => void;
  }

  let { plans, selected, onchange }: Props = $props();

  function summary(plan: Plan): string {
    const { days, exercises } = planStats(plan);
    return `${days} ${days === 1 ? 'day' : 'days'} · ${exercises} ${exercises === 1 ? 'exercise' : 'exercises'}`;
  }
</script>

<div class="plans" role="radiogroup" aria-label="Plan to build on">
  <button
    type="button"
    class="plan"
    role="radio"
    aria-checked={selected === null}
    data-testid="creator-plan-none"
    onclick={() => onchange(null)}
  >
    <span class="mark"><Icon name="plus" size={20} /></span>
    <span class="text">
      <span class="name">Start fresh</span>
      <span class="meta">A new plan from your answers</span>
    </span>
  </button>
  {#each plans as plan (plan.id)}
    <button
      type="button"
      class="plan"
      role="radio"
      aria-checked={selected === plan.id}
      disabled={plan.days.length === 0}
      data-testid="creator-plan"
      data-plan-id={plan.id}
      onclick={() => onchange(plan.id)}
    >
      <span class="mark"><Icon name="plans" size={20} /></span>
      <span class="text">
        <span class="name">Build on {plan.name.trim() || 'Untitled plan'}</span>
        <span class="meta"
          >{plan.days.length === 0 ? 'No days yet, so nothing to build on' : summary(plan)}</span
        >
        {#if plan.days.length > 0}
          <span class="days">
            {#each plan.days as day, index (day.id)}
              <span class="day">{day.name.trim() || `Day ${index + 1}`}</span>
            {/each}
          </span>
        {/if}
      </span>
    </button>
  {/each}
  {#if plans.length === 0}
    <p class="none" data-testid="creator-plan-empty">
      You have no plans to build on yet. Copy a schedule or make a plan, and it shows up here.
    </p>
  {/if}
</div>

<style>
  .plans {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .plan {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    width: 100%;
    padding: var(--space-3);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .plan:disabled {
    opacity: 0.55;
    cursor: not-allowed;
  }

  .plan[aria-checked='true'] {
    border-color: var(--accent);
    background: var(--accent-soft);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .mark {
    display: grid;
    flex: none;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text-2);
  }

  .plan[aria-checked='true'] .mark {
    background: var(--accent);
    color: var(--on-accent);
  }

  .text {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .name {
    font-weight: 700;
  }

  .meta,
  .none {
    color: var(--text-3);
    font-size: var(--text-sm);
  }

  .days {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-1);
    margin-top: var(--space-1);
  }

  .day {
    padding: 1px var(--space-2);
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    color: var(--text-2);
    font-size: var(--text-xs);
    font-weight: 650;
  }
</style>
