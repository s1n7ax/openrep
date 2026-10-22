<!--
  Numbered exercise instructions.
-->
<script lang="ts">
  let { steps, testid = 'exercise-steps' }: { steps: readonly string[]; testid?: string } =
    $props();
</script>

<ol class="steps" data-testid={testid}>
  {#each steps as step, index (index)}
    <li class="step">
      <span class="number" aria-hidden="true">{index + 1}</span>
      <p>{step}</p>
    </li>
  {/each}
</ol>

<style>
  .steps {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: 0;
    list-style: none;
  }

  .step {
    display: flex;
    gap: var(--space-3);
  }

  .number {
    display: grid;
    flex: none;
    place-items: center;
    width: 28px;
    height: 28px;
    border-radius: var(--radius-pill);
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: var(--text-sm);
    font-weight: 800;
  }

  p {
    padding-top: 2px;
    color: var(--text-2);
  }
</style>
