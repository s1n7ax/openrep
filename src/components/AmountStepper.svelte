<!--
  − n + for the reps or seconds of one logged set; the number can be typed
  too. A valid entry is saved as it is typed; an invalid one is marked and
  keeps the last valid value. While nothing is entered it shows the target.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { PlanTarget } from '../lib/schema/userData.ts';
  import {
    AMOUNT_MAX,
    amountBase,
    amountKind,
    parseAmount,
    plannedAmount,
    stepAmount,
  } from '../lib/userData/setCircles.ts';
  import Icon from './Icon.svelte';

  interface Props {
    /** Names the set for screen readers: "Set 1", "Round 2 A1". */
    name: string;
    /** The reps or seconds logged; null when none were entered. */
    value: number | null;
    /** The exercise's target: whether it is reps or seconds, and what it plans. */
    target: Pick<PlanTarget, 'reps' | 'durationSec'>;
    onchange: (value: number | null) => void;
  }

  let { name, value, target, onchange }: Props = $props();

  const kind = $derived(amountKind(target));
  const noun = $derived(kind === 'time' ? 'seconds' : 'reps');
  /** What − / + step from. */
  const current = $derived(value ?? amountBase(target));

  function format(amount: number | null): string {
    return amount === null ? '' : String(amount);
  }

  let text = $state(untrack(() => format(value)));
  const valid = $derived(parseAmount(text, kind) !== undefined);

  // Show values changed with − / +.
  $effect(() => {
    const stored = value;
    untrack(() => {
      if (parseAmount(text, kind) !== stored) text = format(stored);
    });
  });

  function onInput() {
    const typed = parseAmount(text, kind);
    if (typed !== undefined) onchange(typed);
  }

  function onKeydown(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
    if (event.key === 'Enter') event.currentTarget.blur();
  }
</script>

<div class="stepper" role="group" aria-label={`${name} ${noun}`}>
  <button
    type="button"
    class="step-btn"
    aria-label={`Fewer ${noun}`}
    data-testid="amount-dec"
    disabled={current <= 0}
    onclick={() => onchange(stepAmount(value, target, -1))}
  >
    <Icon name="minus" size={20} />
  </button>
  <input
    class="value"
    type="text"
    inputmode="numeric"
    autocomplete="off"
    enterkeyhint="done"
    placeholder={plannedAmount(target)}
    aria-label={`${name} ${noun}`}
    aria-invalid={!valid}
    data-testid={kind === 'time' ? 'set-duration' : 'set-reps'}
    bind:value={text}
    oninput={onInput}
    onfocus={(event) => event.currentTarget.select()}
    onblur={() => (text = format(value))}
    onkeydown={onKeydown}
  />
  <button
    type="button"
    class="step-btn"
    aria-label={`More ${noun}`}
    data-testid="amount-inc"
    disabled={current >= AMOUNT_MAX[kind]}
    onclick={() => onchange(stepAmount(value, target, 1))}
  >
    <Icon name="plus" size={20} />
  </button>
</div>

<style>
  .stepper {
    display: flex;
    flex: none;
    align-items: center;
    height: var(--tap);
    overflow: hidden;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-sm);
    background: var(--surface);
  }

  .step-btn {
    display: grid;
    place-items: center;
    width: var(--tap);
    height: 100%;
    padding: 0;
    border: none;
    background: var(--surface-2);
    color: var(--text);
    cursor: pointer;
  }

  .step-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .value {
    width: 56px;
    height: 100%;
    padding: 0 var(--space-1);
    border: none;
    background: transparent;
    color: var(--text);
    font-size: var(--text-lg);
    font-weight: 750;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  .value::placeholder {
    color: var(--text-3);
    font-weight: 600;
  }

  .value:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: -2px;
  }

  .value[aria-invalid='true'] {
    color: var(--danger);
  }
</style>
