<!--
  One set of a workout being logged: weight (in the user's unit), reps or
  seconds, a done tick box and a remove button. Valid entries are saved as
  they are typed; an invalid entry is marked and keeps the last valid value.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import {
    MAX_LOGGED_REPS,
    MAX_LOGGED_SECONDS,
    type LoggedSet,
    type Unit,
  } from '../lib/schema/userData.ts';
  import { userData } from '../lib/stores/userData.svelte.ts';
  import { formatWeight, parseWeight } from '../lib/units.ts';
  import { removeLoggedSet, setLoggedSetDone, updateLoggedSet } from '../lib/userData/sessions.ts';
  import Icon from './Icon.svelte';

  interface Props {
    sessionId: string;
    sessionExerciseId: string;
    set: LoggedSet;
    index: number;
    /** Shown in place of the set number, e.g. "A1" for an exercise of a superset. */
    marker?: string;
    /** Names the row for screen readers; default "Set <n>". */
    name?: string;
    /** Whether the exercise is done for reps or held for a time. */
    mode: 'reps' | 'time';
    unit: Unit;
    /** Placeholder for the reps or seconds field (the target). */
    amountPlaceholder: string;
    canRemove: boolean;
    /** Called after the set was ticked off (`true`) or un-ticked (`false`). */
    ondone?: (done: boolean) => void;
  }

  let {
    sessionId,
    sessionExerciseId,
    set,
    index,
    marker,
    name,
    mode,
    unit,
    amountPlaceholder,
    canRemove,
    ondone,
  }: Props = $props();

  /** A whole number typed in a field: null when empty, undefined when not valid. */
  function parseCount(text: string, max: number): number | null | undefined {
    const trimmed = text.trim();
    if (trimmed === '') return null;
    if (!/^\d+$/.test(trimmed)) return undefined;
    const value = Number(trimmed);
    return value <= max ? value : undefined;
  }

  const amountMax = $derived(mode === 'time' ? MAX_LOGGED_SECONDS : MAX_LOGGED_REPS);
  const storedAmount = $derived(mode === 'time' ? set.durationSec : set.reps);

  let weightText = $state(
    untrack(() => (set.weightKg === null ? '' : formatWeight(set.weightKg, unit))),
  );
  let amountText = $state(untrack(() => (storedAmount === null ? '' : String(storedAmount))));

  const weightValid = $derived(parseWeight(weightText, unit).ok);
  const amountValid = $derived(parseCount(amountText, amountMax) !== undefined);

  // Show values changed elsewhere (ticking a set fills empty reps from the target).
  $effect(() => {
    const amount = storedAmount;
    untrack(() => {
      if (parseCount(amountText, amountMax) !== amount) {
        amountText = amount === null ? '' : String(amount);
      }
    });
  });

  function update(patch: Partial<Omit<LoggedSet, 'id'>>) {
    userData.update((data) => updateLoggedSet(data, sessionId, sessionExerciseId, set.id, patch));
  }

  function onWeightInput() {
    const parsed = parseWeight(weightText, unit);
    if (parsed.ok) update({ weightKg: parsed.kg });
  }

  function onAmountInput() {
    const value = parseCount(amountText, amountMax);
    if (value === undefined) return;
    update(mode === 'time' ? { durationSec: value } : { reps: value });
  }

  function onDoneChange(event: Event & { currentTarget: HTMLInputElement }) {
    const done = event.currentTarget.checked;
    userData.update((data) => setLoggedSetDone(data, sessionId, sessionExerciseId, set.id, done));
    ondone?.(done);
  }

  function remove() {
    userData.update((data) => removeLoggedSet(data, sessionId, sessionExerciseId, set.id));
  }

  const label = $derived(name ?? `Set ${index + 1}`);
</script>

<li class="set" class:done={set.done} data-testid="set-row" data-set-id={set.id}>
  <span class="number" aria-hidden="true" data-testid="set-marker">{marker ?? index + 1}</span>
  <input
    class="input"
    type="text"
    inputmode="decimal"
    autocomplete="off"
    enterkeyhint="next"
    placeholder="—"
    aria-label={`${label} weight (${unit})`}
    aria-invalid={!weightValid}
    data-testid="set-weight"
    bind:value={weightText}
    oninput={onWeightInput}
  />
  <input
    class="input"
    type="text"
    inputmode="numeric"
    autocomplete="off"
    enterkeyhint="done"
    placeholder={amountPlaceholder}
    aria-label={`${label} ${mode === 'time' ? 'seconds' : 'reps'}`}
    aria-invalid={!amountValid}
    data-testid={mode === 'time' ? 'set-duration' : 'set-reps'}
    bind:value={amountText}
    oninput={onAmountInput}
  />
  <span class="done-cell">
    <input
      type="checkbox"
      class="done-box"
      aria-label={`${label} done`}
      checked={set.done}
      data-testid="set-done"
      onchange={onDoneChange}
    />
    <span class="tick" aria-hidden="true"><Icon name="check" size={22} /></span>
  </span>
  <button
    type="button"
    class="icon-btn remove"
    aria-label={`Remove ${label.toLowerCase()}`}
    disabled={!canRemove}
    data-testid="set-remove"
    onclick={remove}
  >
    <Icon name="close" size={20} />
  </button>
</li>

<style>
  .set {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) minmax(0, 1fr) var(--tap) var(--tap);
    align-items: center;
    gap: 6px;
    padding: var(--space-1) var(--space-2) var(--space-1) var(--space-3);
    border-radius: var(--radius-md);
    transition: background-color 120ms ease;
  }

  .set.done {
    background: var(--accent-soft);
  }

  .number {
    color: var(--text-3);
    font-size: var(--text-sm);
    font-weight: 800;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .done .number {
    color: var(--accent-text);
  }

  .input {
    padding: 0 var(--space-2);
    font-size: var(--text-lg);
    font-weight: 650;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .input::placeholder {
    color: var(--text-3);
    font-weight: 500;
    opacity: 0.8;
  }

  .done-cell {
    position: relative;
    width: var(--tap);
    height: var(--tap);
  }

  .done-box {
    appearance: none;
    width: 100%;
    height: 100%;
    margin: 0;
    border: 2px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface);
    cursor: pointer;
    transition:
      background-color 120ms ease,
      border-color 120ms ease;
  }

  .done-box:checked {
    border-color: var(--accent);
    background: var(--accent);
  }

  .done-box:focus-visible {
    outline: 3px solid var(--focus);
    outline-offset: 2px;
  }

  .tick {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    color: var(--on-accent);
    opacity: 0;
    pointer-events: none;
    transform: scale(0.6);
    transition:
      opacity 120ms ease,
      transform 120ms ease;
  }

  .done-box:checked + .tick {
    opacity: 1;
    transform: scale(1);
  }

  .remove {
    color: var(--text-3);
  }
</style>
