<!--
  Two-column grid of labelled facts (equipment, level, …). A lone last fact
  spans both columns.
-->
<script lang="ts" module>
  export interface Fact {
    label: string;
    value: string;
    testid?: string;
  }
</script>

<script lang="ts">
  let { facts }: { facts: readonly Fact[] } = $props();
</script>

<dl class="facts card">
  {#each facts as fact (fact.label)}
    <div class="fact">
      <dt>{fact.label}</dt>
      <dd data-testid={fact.testid}>{fact.value}</dd>
    </div>
  {/each}
</dl>

<style>
  .facts {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 1px;
    margin: 0;
    overflow: hidden;
    background: var(--border);
  }

  .fact {
    padding: var(--space-3) var(--space-4);
    background: var(--surface);
  }

  .fact:last-child:nth-child(odd) {
    grid-column: span 2;
  }

  dt {
    color: var(--text-3);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  dd {
    margin: 2px 0 0;
    font-weight: 650;
  }
</style>
