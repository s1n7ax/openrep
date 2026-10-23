<!--
  The heading of a superset: "Superset A" and what it is done for, e.g.
  "3 rounds · rest 90 s after each round".
-->
<script lang="ts">
  interface Props {
    letter: string;
    summary: string;
    /** Test id of the summary text. */
    testid: string;
  }

  let { letter, summary, testid }: Props = $props();
</script>

<div class="superset-label">
  <span class="tag">Superset {letter}</span>
  <span class="summary" data-testid={testid}>{summary}</span>
</div>

<style>
  .superset-label {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: var(--space-1) var(--space-2);
    min-width: 0;
  }

  .tag {
    color: var(--accent-text);
    font-size: var(--text-xs);
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .summary {
    color: var(--text-2);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }
</style>
