<!--
  Editor for one superset of a plan day: its round count and the rest after
  each round, its exercises (each with its own editor, labelled A1, A2, …),
  move the whole superset up/down, superset it with the next exercise and
  ungroup it. Valid edits are saved as they are typed.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { newId, nowIso } from '../lib/ids.ts';
  import type { PlanExercise, Superset, Unit } from '../lib/schema/userData.ts';
  import { userData } from '../lib/stores/userData.svelte.ts';
  import {
    moveSuperset,
    setSupersetRest,
    setSupersetRounds,
    supersetWithNext,
    ungroupSuperset,
  } from '../lib/userData/plans.ts';
  import { supersetExerciseLabel } from '../lib/userData/supersets.ts';
  import { isValidRestText } from '../lib/userData/targets.ts';
  import Icon from './Icon.svelte';
  import TargetEditor from './TargetEditor.svelte';

  interface Props {
    planId: string;
    dayId: string;
    superset: Superset;
    letter: string;
    /** Its exercises, in order (at least two). */
    entries: PlanExercise[];
    canMoveUp: boolean;
    canMoveDown: boolean;
    /** Whether there is a next exercise or superset to superset with. */
    canJoinNext: boolean;
    unit: Unit;
  }

  let {
    planId,
    dayId,
    superset,
    letter,
    entries,
    canMoveUp,
    canMoveDown,
    canJoinNext,
    unit,
  }: Props = $props();

  const rounds = $derived(entries[0]?.sets ?? 1);

  // Seeded once from the stored rest (the parent keys this component by superset id).
  let restText = $state(
    untrack(() => (superset.restSec === undefined ? '' : String(superset.restSec))),
  );
  const restValid = $derived(isValidRestText(restText));

  const id = $props.id();

  function setRounds(next: number) {
    userData.update((data) => setSupersetRounds(data, planId, dayId, superset.id, next, nowIso()));
  }

  function onRestInput() {
    if (!restValid) return;
    const text = restText.trim();
    const restSec = text === '' ? undefined : Number(text);
    userData.update((data) => setSupersetRest(data, planId, dayId, superset.id, restSec, nowIso()));
  }

  function move(delta: number) {
    userData.update((data) => moveSuperset(data, planId, dayId, superset.id, delta, nowIso()));
  }

  function joinNext() {
    const first = entries[0];
    if (!first) return;
    const supersetId = newId();
    userData.update((data) =>
      supersetWithNext(data, planId, dayId, first.id, supersetId, nowIso()),
    );
  }

  function ungroup() {
    userData.update((data) => ungroupSuperset(data, planId, dayId, superset.id, nowIso()));
  }
</script>

<li class="superset" data-testid="edit-superset" data-superset-id={superset.id}>
  <div class="head">
    <span class="title" data-testid="edit-superset-label">Superset {letter}</span>
    <div class="tools">
      <button
        type="button"
        class="icon-btn"
        aria-label={`Move superset ${letter} up`}
        data-testid="superset-move-up"
        disabled={!canMoveUp}
        onclick={() => move(-1)}
      >
        <Icon name="chevron-up" />
      </button>
      <button
        type="button"
        class="icon-btn"
        aria-label={`Move superset ${letter} down`}
        data-testid="superset-move-down"
        disabled={!canMoveDown}
        onclick={() => move(1)}
      >
        <Icon name="chevron-down" />
      </button>
      <button
        type="button"
        class="icon-btn"
        aria-label={`Superset ${letter} with the next exercise`}
        data-testid="superset-join-next"
        disabled={!canJoinNext}
        onclick={joinNext}
      >
        <Icon name="link" />
      </button>
      <button
        type="button"
        class="icon-btn"
        aria-label={`Ungroup superset ${letter}`}
        data-testid="superset-ungroup"
        onclick={ungroup}
      >
        <Icon name="unlink" />
      </button>
    </div>
  </div>

  <div class="row">
    <div class="field">
      <span class="field-label" id={`${id}-rounds`}>Rounds</span>
      <div class="stepper" role="group" aria-labelledby={`${id}-rounds`}>
        <button
          type="button"
          class="step-btn"
          aria-label="Fewer rounds"
          data-testid="superset-rounds-dec"
          disabled={rounds <= 1}
          onclick={() => setRounds(rounds - 1)}>−</button
        >
        <output class="rounds" aria-live="polite" data-testid="superset-rounds">{rounds}</output>
        <button
          type="button"
          class="step-btn"
          aria-label="More rounds"
          data-testid="superset-rounds-inc"
          disabled={rounds >= 20}
          onclick={() => setRounds(rounds + 1)}>+</button
        >
      </div>
    </div>
    <div class="field">
      <label class="field-label" for={`${id}-rest`}>Rest after each round (s)</label>
      <input
        id={`${id}-rest`}
        class="input"
        type="text"
        inputmode="numeric"
        autocomplete="off"
        placeholder="—"
        aria-invalid={!restValid}
        data-testid="superset-rest"
        bind:value={restText}
        oninput={onRestInput}
      />
    </div>
  </div>
  {#if !restValid}
    <p class="field-error" aria-live="polite">Rest: whole seconds up to 3600, or empty.</p>
  {/if}

  <ol class="members">
    {#each entries as entry, position (entry.id)}
      <TargetEditor
        {planId}
        {dayId}
        {entry}
        label={supersetExerciseLabel(letter, position)}
        canMoveUp={position > 0}
        canMoveDown={position < entries.length - 1}
        member
        {unit}
      />
    {/each}
  </ol>
</li>

<style>
  .superset {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding-top: var(--space-3);
    border-left: 3px solid var(--accent);
  }

  .head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: 0 var(--space-2) 0 calc(var(--space-4) - 3px);
  }

  .title {
    flex: 1;
    min-width: 0;
    color: var(--accent-text);
    font-size: var(--text-sm);
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .tools {
    display: flex;
    flex: none;
  }

  .row {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-3);
    padding: 0 var(--space-4) 0 calc(var(--space-4) - 3px);
  }

  .stepper {
    display: flex;
    align-items: center;
    height: var(--tap);
    overflow: hidden;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface);
  }

  .step-btn {
    width: var(--tap);
    height: 100%;
    border: none;
    background: var(--surface-2);
    font-size: var(--text-xl);
    font-weight: 600;
    cursor: pointer;
  }

  .step-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .rounds {
    min-width: 40px;
    font-size: var(--text-lg);
    font-weight: 750;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .input {
    font-variant-numeric: tabular-nums;
  }

  .field-error {
    margin-top: calc(-1 * var(--space-2));
    padding: 0 var(--space-4) 0 calc(var(--space-4) - 3px);
  }

  .members {
    margin: 0;
    padding: 0;
    border-top: 1px solid var(--border);
    list-style: none;
  }

  .members :global(li + li) {
    border-top: 1px solid var(--border);
  }

  .members :global(.entry) {
    padding-left: calc(var(--space-4) - 3px);
  }
</style>
