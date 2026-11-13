<!--
  The schedule creator's result (`#/schedule-creator/prompt`): the prompt built
  from the saved answers, to read, send to an AI assistant app through the
  share sheet or copy, and the way on to pasting the assistant's reply.
-->
<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import { canShareText, copyText, shareText } from '../lib/external.ts';
  import { href, paths } from '../lib/router.ts';
  import { buildSchedulePrompt } from '../lib/schedulePrompt.ts';
  import { catalog } from '../lib/stores/catalog.svelte.ts';
  import { userData } from '../lib/stores/userData.svelte.ts';
  import { emptyScheduleAnswers } from '../lib/userData/scheduleAnswers.ts';

  const prompt = $derived(
    buildSchedulePrompt({
      answers: userData.data.scheduleAnswers ?? emptyScheduleAnswers(),
      unit: userData.data.settings.unit,
      exercises: catalog.exercises,
      sessions: userData.data.sessions,
      now: new Date(),
    }),
  );

  const canShare = canShareText();

  /** What the last Send or Copy showed; `null` before the first, or after a send. */
  let notice = $state<'copied' | 'copy-failed' | 'share-failed' | null>(null);

  async function copy() {
    notice = (await copyText(prompt)) ? 'copied' : 'copy-failed';
  }

  async function share() {
    try {
      // A dismissed share sheet leaves the screen as it was.
      if ((await shareText(prompt, 'Send the prompt to')) === 'shared') notice = null;
    } catch (error) {
      console.error('Sharing the prompt failed:', error);
      notice = 'share-failed';
    }
  }
</script>

<PageHeader title="Your prompt" back={paths.scheduleCreator()} />

<div class="page">
  <div class="content">
    <ol class="steps">
      {#if canShare}
        <li>Send the prompt to your AI assistant app, or copy it and paste it there.</li>
      {:else}
        <li>Copy the prompt and paste it into your AI assistant.</li>
      {/if}
      <li>Copy the assistant's whole reply.</li>
      <li>Paste it here to add the plan.</li>
    </ol>

    <label class="visually-hidden" for="creator-prompt">Prompt</label>
    <textarea
      id="creator-prompt"
      class="input prompt"
      rows="12"
      readonly
      data-testid="creator-prompt"
      value={prompt}></textarea>

    {#if notice === 'copied'}
      <p class="message ok" role="status" data-testid="creator-copied">
        <Icon name="check" size={18} />
        Copied. Paste it into your AI assistant.
      </p>
    {:else if notice === 'copy-failed'}
      <p class="message error" role="alert" data-testid="creator-copy-error">
        <Icon name="alert" size={18} />
        The prompt could not be copied. Select the text above and copy it yourself.
      </p>
    {:else if notice === 'share-failed'}
      <p class="message error" role="alert" data-testid="creator-share-error">
        <Icon name="alert" size={18} />
        The prompt could not be sent. Copy it instead and paste it into your AI assistant.
      </p>
    {/if}

    {#if canShare}
      <button
        type="button"
        class="btn btn-primary btn-lg btn-block"
        data-testid="creator-share"
        onclick={share}
      >
        <Icon name="send" size={20} /> Send to AI app
      </button>
    {/if}
    <button
      type="button"
      class="btn btn-lg btn-block {canShare ? 'btn-outline' : 'btn-primary'}"
      data-testid="creator-copy"
      onclick={copy}
    >
      Copy prompt
    </button>
    <a
      class="btn btn-outline btn-lg btn-block"
      href={href(paths.scheduleCreatorPaste())}
      data-testid="creator-paste-open"
    >
      Paste the reply
    </a>
  </div>
</div>

<style>
  .content {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .steps {
    margin: 0;
    padding-left: var(--space-5);
    color: var(--text-2);
  }

  .prompt {
    font-size: var(--text-sm);
  }
</style>
