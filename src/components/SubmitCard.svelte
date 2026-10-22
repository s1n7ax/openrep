<!--
  The "share" card of a plan or custom exercise: Submit builds the data file,
  copies it and opens GitHub's "new file" page for it (see `submit.ts`), then
  a dialog explains how to finish the pull request there.
-->
<script lang="ts">
  import type { Contribution } from '../lib/contribute.ts';
  import { submitContribution, type SubmitResult } from '../lib/submit.ts';
  import Icon from './Icon.svelte';
  import SubmitDialog from './SubmitDialog.svelte';

  interface Props {
    title: string;
    text: string;
    /** Whether there is enough to submit; otherwise `hint` says what is missing. */
    canSubmit: boolean;
    hint: string;
    /** Builds the file to submit. Throws when it cannot be built. */
    build: () => Contribution;
    /** Shown when `build` throws. */
    invalidMessage: string;
    /** Test id of the Submit button; the hint's is `<testid>-hint`. */
    testid: string;
  }

  let { title, text, canSubmit, hint, build, invalidMessage, testid }: Props = $props();

  const hintId = $props.id();
  let submitting = $state(false);
  let submitted = $state<{ contribution: Contribution; result: SubmitResult } | null>(null);
  let submitError = $state<string | null>(null);

  /** Opens GitHub with the file ready to propose as a pull request. */
  async function submit() {
    if (submitting) return;
    submitError = null;
    let contribution: Contribution;
    try {
      contribution = build();
    } catch (error) {
      console.error('The contribution cannot be built:', error);
      submitError = invalidMessage;
      return;
    }
    submitting = true;
    try {
      submitted = { contribution, result: await submitContribution(contribution) };
    } catch (error) {
      console.error('Opening GitHub failed:', error);
      submitError = 'GitHub could not be opened. Check that a web browser is installed.';
    } finally {
      submitting = false;
    }
  }
</script>

<section class="share card">
  <h2 class="share-title">{title}</h2>
  <p class="share-text">{text}</p>
  <button
    type="button"
    class="btn btn-outline btn-block"
    disabled={!canSubmit || submitting}
    aria-describedby={canSubmit ? undefined : hintId}
    data-testid={testid}
    onclick={submit}
  >
    <Icon name="send" size={20} /> Submit to OpenRep
  </button>
  {#if !canSubmit}
    <p id={hintId} class="field-hint" data-testid={`${testid}-hint`}>{hint}</p>
  {/if}
  {#if submitError}
    <p class="field-error" role="alert" data-testid="submit-error">{submitError}</p>
  {/if}
</section>

<SubmitDialog {submitted} onclose={() => (submitted = null)} />

<style>
  .share {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-5) var(--space-4);
  }

  .share-title {
    font-size: var(--text-lg);
    font-weight: 750;
  }

  .share-text {
    color: var(--text-2);
  }
</style>
