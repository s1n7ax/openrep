<!--
  Multi-select of muscle groups as toggle chips.
-->
<script lang="ts">
  import { muscleLabel } from '../lib/labels.ts';
  import { MUSCLES, type Muscle } from '../lib/schema/common.ts';

  interface Props {
    label: string;
    selected: readonly Muscle[];
    /** Muscles shown as unavailable (e.g. already primary). */
    disabled?: readonly Muscle[];
    ontoggle: (muscle: Muscle) => void;
    testidPrefix: string;
  }

  let { label, selected, disabled = [], ontoggle, testidPrefix }: Props = $props();
</script>

<fieldset class="group">
  <legend class="field-label">{label}</legend>
  <div class="chips">
    {#each MUSCLES as muscle (muscle)}
      <button
        type="button"
        class="chip"
        aria-pressed={selected.includes(muscle)}
        disabled={disabled.includes(muscle)}
        data-testid={`${testidPrefix}-${muscle.replace(/\s+/g, '-')}`}
        onclick={() => ontoggle(muscle)}>{muscleLabel(muscle)}</button
      >
    {/each}
  </div>
</fieldset>

<style>
  .group {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: none;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .chip:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
</style>
