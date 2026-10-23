<!--
  Editor for one exercise of a plan day: sets, reps (number or range) or
  time, optional weight (in the user's unit), rest and notes; move up/down,
  superset with the next exercise and remove. An exercise of a superset has
  no sets or rest of its own (the superset's editor sets them) and can be
  taken out of the superset instead. Valid edits are saved as they are typed;
  an invalid field shows an error and keeps the last valid value.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { resolveExerciseRef } from '../lib/exerciseRef.ts';
  import { newId, nowIso } from '../lib/ids.ts';
  import type { PlanExercise, Unit } from '../lib/schema/userData.ts';
  import { catalog } from '../lib/stores/catalog.svelte.ts';
  import { userData } from '../lib/stores/userData.svelte.ts';
  import { formatWeight, parseWeight } from '../lib/units.ts';
  import {
    deletePlanExercise,
    movePlanExercise,
    removeFromSuperset,
    supersetWithNext,
    updatePlanExerciseTarget,
  } from '../lib/userData/plans.ts';
  import {
    applyTargetForm,
    DEFAULT_DURATION_SEC,
    DEFAULT_REPS,
    isValidDurationText,
    isValidRepsText,
    isValidRestText,
  } from '../lib/userData/targets.ts';
  import Icon from './Icon.svelte';

  interface Props {
    planId: string;
    dayId: string;
    entry: PlanExercise;
    /** Its number in the day ("3"), or its label in a superset ("A1"). */
    label: string;
    canMoveUp: boolean;
    canMoveDown: boolean;
    /** Whether the exercise is part of a superset. */
    member?: boolean;
    /** Whether there is a next exercise or superset to superset with. */
    canJoinNext?: boolean;
    unit: Unit;
  }

  let {
    planId,
    dayId,
    entry,
    label,
    canMoveUp,
    canMoveDown,
    member = false,
    canJoinNext = false,
    unit,
  }: Props = $props();

  const resolved = $derived(
    resolveExerciseRef(entry.exercise, (id) => catalog.exercise(id), userData.data.customExercises),
  );

  // Text being edited, seeded once from the stored target (the parent keys this
  // component by entry id).
  const initial = untrack(() => ({ ...entry, unit }));
  let mode = $state<'reps' | 'time'>(initial.durationSec !== undefined ? 'time' : 'reps');
  let repsText = $state(initial.reps ?? DEFAULT_REPS);
  let durationText = $state(String(initial.durationSec ?? DEFAULT_DURATION_SEC));
  let weightText = $state(
    initial.weightKg !== undefined ? formatWeight(initial.weightKg, initial.unit) : '',
  );
  let restText = $state(initial.restSec !== undefined ? String(initial.restSec) : '');
  let notesText = $state(initial.notes ?? '');
  /** The weight field shows the stored weight rounded; it is saved only once edited. */
  let weightEdited = false;

  const repsValid = $derived(isValidRepsText(repsText));
  const durationValid = $derived(isValidDurationText(durationText));
  const parsedWeight = $derived(parseWeight(weightText, unit));
  const restValid = $derived(isValidRestText(restText));

  const id = $props.id();

  /** Saves every valid field; invalid ones keep their stored value. */
  function commit(sets = entry.sets) {
    const target = applyTargetForm(
      { ...entry, sets },
      {
        mode,
        reps: repsText,
        duration: durationText,
        weight: weightText,
        rest: restText,
        notes: notesText,
        weightEdited,
      },
      unit,
    );
    userData.update((data) =>
      updatePlanExerciseTarget(data, planId, dayId, entry.id, target, nowIso()),
    );
  }

  function onWeightInput() {
    weightEdited = true;
    commit();
  }

  function setMode(next: 'reps' | 'time') {
    mode = next;
    commit();
  }

  function move(delta: number) {
    userData.update((data) => movePlanExercise(data, planId, dayId, entry.id, delta, nowIso()));
  }

  function remove() {
    userData.update((data) => deletePlanExercise(data, planId, dayId, entry.id, nowIso()));
  }

  function joinNext() {
    const supersetId = newId();
    userData.update((data) =>
      supersetWithNext(data, planId, dayId, entry.id, supersetId, nowIso()),
    );
  }

  function leaveSuperset() {
    userData.update((data) => removeFromSuperset(data, planId, dayId, entry.id, nowIso()));
  }
</script>

<li class="entry" class:member data-testid="edit-exercise" data-plan-exercise-id={entry.id}>
  <div class="head">
    <span class="number" aria-hidden="true" data-testid="edit-exercise-label">{label}</span>
    <div class="title">
      <span class="name" data-testid="edit-exercise-name">{resolved.name}</span>
      {#if resolved.note}
        <span class="missing" data-testid="missing-note">{resolved.note}</span>
      {/if}
    </div>
    <div class="tools">
      <button
        type="button"
        class="icon-btn"
        aria-label={`Move ${resolved.name} up`}
        data-testid="exercise-move-up"
        disabled={!canMoveUp}
        onclick={() => move(-1)}
      >
        <Icon name="chevron-up" />
      </button>
      <button
        type="button"
        class="icon-btn"
        aria-label={`Move ${resolved.name} down`}
        data-testid="exercise-move-down"
        disabled={!canMoveDown}
        onclick={() => move(1)}
      >
        <Icon name="chevron-down" />
      </button>
      {#if member}
        <button
          type="button"
          class="icon-btn"
          aria-label={`Take ${resolved.name} out of the superset`}
          data-testid="exercise-superset-remove"
          onclick={leaveSuperset}
        >
          <Icon name="unlink" />
        </button>
      {:else}
        <button
          type="button"
          class="icon-btn"
          aria-label={`Superset ${resolved.name} with the next exercise`}
          data-testid="exercise-superset-next"
          disabled={!canJoinNext}
          onclick={joinNext}
        >
          <Icon name="link" />
        </button>
      {/if}
      <button
        type="button"
        class="icon-btn danger"
        aria-label={`Remove ${resolved.name}`}
        data-testid="exercise-remove"
        onclick={remove}
      >
        <Icon name="trash" />
      </button>
    </div>
  </div>

  <div class="row" class:single={member}>
    {#if !member}
      <div class="field">
        <span class="field-label" id={`${id}-sets`}>Sets</span>
        <div class="stepper" role="group" aria-labelledby={`${id}-sets`}>
          <button
            type="button"
            class="step-btn"
            aria-label="Fewer sets"
            data-testid="target-sets-dec"
            disabled={entry.sets <= 1}
            onclick={() => commit(entry.sets - 1)}>−</button
          >
          <output class="sets" aria-live="polite" data-testid="target-sets">{entry.sets}</output>
          <button
            type="button"
            class="step-btn"
            aria-label="More sets"
            data-testid="target-sets-inc"
            disabled={entry.sets >= 20}
            onclick={() => commit(entry.sets + 1)}>+</button
          >
        </div>
      </div>
    {/if}
    <div class="field">
      <span class="field-label" id={`${id}-mode`}>Each set</span>
      <div class="segmented" role="group" aria-labelledby={`${id}-mode`}>
        <button
          type="button"
          aria-pressed={mode === 'reps'}
          data-testid="target-mode-reps"
          onclick={() => setMode('reps')}>Reps</button
        >
        <button
          type="button"
          aria-pressed={mode === 'time'}
          data-testid="target-mode-time"
          onclick={() => setMode('time')}>Time</button
        >
      </div>
    </div>
  </div>

  <div class="row three" class:two={member}>
    {#if mode === 'reps'}
      <div class="field">
        <label class="field-label" for={`${id}-reps`}>Reps</label>
        <input
          id={`${id}-reps`}
          class="input"
          type="text"
          autocomplete="off"
          placeholder="8-12"
          aria-invalid={!repsValid}
          data-testid="target-reps"
          bind:value={repsText}
          oninput={() => commit()}
        />
      </div>
    {:else}
      <div class="field">
        <label class="field-label" for={`${id}-duration`}>Seconds</label>
        <input
          id={`${id}-duration`}
          class="input"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          aria-invalid={!durationValid}
          data-testid="target-duration"
          bind:value={durationText}
          oninput={() => commit()}
        />
      </div>
    {/if}
    <div class="field">
      <label class="field-label" for={`${id}-weight`}>Weight ({unit})</label>
      <input
        id={`${id}-weight`}
        class="input"
        type="text"
        inputmode="decimal"
        autocomplete="off"
        placeholder="—"
        aria-invalid={!parsedWeight.ok}
        data-testid="target-weight"
        bind:value={weightText}
        oninput={onWeightInput}
      />
    </div>
    {#if !member}
      <div class="field">
        <label class="field-label" for={`${id}-rest`}>Rest (s)</label>
        <input
          id={`${id}-rest`}
          class="input"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          placeholder="—"
          aria-invalid={!restValid}
          data-testid="target-rest"
          bind:value={restText}
          oninput={() => commit()}
        />
      </div>
    {/if}
  </div>

  {#if (mode === 'reps' && !repsValid) || (mode === 'time' && !durationValid) || !parsedWeight.ok || !restValid}
    <ul class="errors" aria-live="polite">
      {#if mode === 'reps' && !repsValid}
        <li class="field-error">Reps: a number like 8 or a range like 8-12.</li>
      {/if}
      {#if mode === 'time' && !durationValid}
        <li class="field-error">Seconds: a whole number from 1 to 3600.</li>
      {/if}
      {#if !parsedWeight.ok}
        <li class="field-error">Weight: a number, or empty for none.</li>
      {/if}
      {#if !restValid}
        <li class="field-error">Rest: whole seconds up to 3600, or empty.</li>
      {/if}
    </ul>
  {/if}

  <div class="field">
    <label class="visually-hidden" for={`${id}-notes`}>Notes</label>
    <input
      id={`${id}-notes`}
      class="input notes"
      type="text"
      autocomplete="off"
      placeholder="Notes (optional)"
      data-testid="target-notes"
      bind:value={notesText}
      oninput={() => commit()}
    />
  </div>
</li>

<style>
  .entry {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4) var(--space-4);
  }

  .head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
  }

  .number {
    display: grid;
    flex: none;
    place-items: center;
    min-width: 26px;
    height: 26px;
    padding: 0 var(--space-1);
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    color: var(--text-2);
    font-size: var(--text-xs);
    font-weight: 800;
  }

  .member .number {
    background: var(--accent-soft);
    color: var(--accent-text);
  }

  .title {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  .name {
    display: -webkit-box;
    overflow: hidden;
    font-weight: 700;
    line-height: 1.25;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
  }

  .missing {
    color: var(--warning-text);
    font-size: var(--text-xs);
    font-weight: 700;
  }

  .tools {
    display: flex;
    flex: none;
    margin-right: calc(-1 * var(--space-2));
  }

  .row {
    display: grid;
    grid-template-columns: auto 1fr;
    gap: var(--space-3);
  }

  .row.single {
    grid-template-columns: 1fr;
  }

  .row.three {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }

  .row.three.two {
    grid-template-columns: repeat(2, minmax(0, 1fr));
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

  .sets {
    min-width: 40px;
    font-size: var(--text-lg);
    font-weight: 750;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .segmented {
    display: grid;
    grid-template-columns: 1fr 1fr;
    height: var(--tap);
    padding: 3px;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
  }

  .segmented button {
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--text-2);
    font-weight: 650;
    cursor: pointer;
  }

  .segmented button[aria-pressed='true'] {
    background: var(--surface);
    color: var(--text);
    box-shadow: var(--shadow-sm);
  }

  .input {
    font-variant-numeric: tabular-nums;
  }

  .errors {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: calc(-1 * var(--space-1)) 0 0;
    padding: 0;
    list-style: none;
  }

  .notes {
    min-height: 40px;
  }
</style>
