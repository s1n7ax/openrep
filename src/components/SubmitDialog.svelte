<!--
  What happens next after Submit opened GitHub: commit the pre-filled file
  and propose the change. When the content could not be pre-filled it says to
  paste the copied content; when copying failed it shows the content to copy.
-->
<script lang="ts">
  import type { Contribution } from '../lib/contribute.ts';
  import type { SubmitResult } from '../lib/submit.ts';
  import Dialog from './Dialog.svelte';

  interface Props {
    /** The submitted file and how it went; null when closed. */
    submitted: { contribution: Contribution; result: SubmitResult } | null;
    onclose: () => void;
  }

  let { submitted, onclose }: Props = $props();
</script>

<Dialog open={submitted !== null} title="Finish on GitHub" {onclose} testid="submit-dialog">
  {#if submitted}
    {@const { contribution, result } = submitted}
    <div class="body" data-testid="submit-message">
      {#if result.includesContent}
        <p>
          GitHub opened with <code>{contribution.path}</code> filled in{result.copied
            ? ', and a copy is on your clipboard'
            : ''}.
        </p>
      {:else if result.copied}
        <p data-testid="submit-paste-hint">
          GitHub opened with the file name filled in. <strong>Paste the copied content</strong> into the
          empty editor.
        </p>
      {:else}
        <p data-testid="submit-paste-hint">
          GitHub opened with the file name filled in. Copying failed: select the content below, copy
          it and paste it into the empty editor.
        </p>
        <textarea
          class="input content"
          readonly
          rows="8"
          aria-label="File content"
          data-testid="submit-content">{contribution.json}</textarea
        >
      {/if}
      <p>
        Then choose <strong>Commit changes…</strong> and <strong>Propose changes</strong> to open a pull
        request. You need a free GitHub account.
      </p>
    </div>
  {/if}
  {#snippet actions()}
    <button type="button" class="btn btn-primary" data-testid="submit-done" onclick={onclose}>
      Done
    </button>
  {/snippet}
</Dialog>

<style>
  .body {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  code {
    overflow-wrap: anywhere;
    font-size: var(--text-sm);
  }

  .content {
    font-family: ui-monospace, 'SF Mono', Menlo, Consolas, monospace;
    font-size: var(--text-xs);
  }
</style>
