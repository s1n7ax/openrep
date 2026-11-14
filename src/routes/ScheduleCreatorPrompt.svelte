<!--
  The schedule creator's result (`#/schedule-creator/prompt`): the prompt built
  from the saved answers, to read and copy, and the way on to pasting the
  assistant's reply.
-->
<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import { copyText } from '../lib/external.ts';
  import { href, paths } from '../lib/router.ts';
  import { buildSchedulePrompt } from '../lib/schedulePrompt.ts';
  import { catalog } from '../lib/stores/catalog.svelte.ts';
  import { userData } from '../lib/stores/userData.svelte.ts';
  import { readScheduleAnswers } from '../lib/userData/scheduleAnswers.ts';

  const prompt = $derived(
    buildSchedulePrompt({
      answers: readScheduleAnswers(userData.data),
      unit: userData.data.settings.unit,
      plans: userData.data.plans,
      customExercises: userData.data.customExercises,
      exercises: catalog.exercises,
      sessions: userData.data.sessions,
      now: new Date(),
    }),
  );

  /** Whether the last Copy worked; `null` before the first. */
  let copied = $state<boolean | null>(null);

  async function copy() {
    copied = await copyText(prompt);
  }
</script>

<PageHeader title="Your prompt" back={paths.scheduleCreator()} />

<div class="page">
  <div class="content">
    <ol class="steps">
      <li>Copy the prompt and paste it into your AI assistant.</li>
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

    {#if copied === true}
      <p class="message ok" role="status" data-testid="creator-copied">
        <Icon name="check" size={18} />
        Copied. Paste it into your AI assistant.
      </p>
    {:else if copied === false}
      <p class="message error" role="alert" data-testid="creator-copy-error">
        <Icon name="alert" size={18} />
        The prompt could not be copied. Select the text above and copy it yourself.
      </p>
    {/if}

    <button
      type="button"
      class="btn btn-primary btn-lg btn-block"
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
