<!--
  A labelled − / + stepper for a number of sets: an exercise's sets, or a
  superset's rounds. It stays within the bounds plans and schedules allow.
-->
<script lang="ts">
  import { MAX_SETS, MIN_SETS } from '../lib/schema/common.ts';

  interface Props {
    /** "Sets" or "Rounds"; the buttons are named after it ("More sets"). */
    label: string;
    value: number;
    /** Test id of the value; the buttons get it with "-dec" and "-inc". */
    testid: string;
    onchange: (value: number) => void;
  }

  let { label, value, testid, onchange }: Props = $props();

  const noun = $derived(label.toLowerCase());
  const id = $props.id();
</script>

<div class="field">
  <span class="field-label" id={`${id}-label`}>{label}</span>
  <div class="stepper" role="group" aria-labelledby={`${id}-label`}>
    <button
      type="button"
      class="step-btn"
      aria-label={`Fewer ${noun}`}
      data-testid={`${testid}-dec`}
      disabled={value <= MIN_SETS}
      onclick={() => onchange(value - 1)}>−</button
    >
    <output class="value" aria-live="polite" data-testid={testid}>{value}</output>
    <button
      type="button"
      class="step-btn"
      aria-label={`More ${noun}`}
      data-testid={`${testid}-inc`}
      disabled={value >= MAX_SETS}
      onclick={() => onchange(value + 1)}>+</button
    >
  </div>
</div>

<style>
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

  .value {
    min-width: 40px;
    font-size: var(--text-lg);
    font-weight: 750;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
</style>
