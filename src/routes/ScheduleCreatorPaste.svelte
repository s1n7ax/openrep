<!--
  Pasting an AI assistant's reply (`#/schedule-creator/paste`): the plan in it
  is imported like a plan file and opened. Rejected text stays in the box.
-->
<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import { newId, nowIso } from '../lib/ids.ts';
  import {
    describePlanFileProblem,
    importPlanFile,
    InvalidPlanFileError,
    parsePastedPlan,
  } from '../lib/planFile.ts';
  import { paths, router } from '../lib/router.ts';
  import { userData } from '../lib/stores/userData.svelte.ts';

  let text = $state('');
  let error = $state<string | null>(null);

  function importPlan(event: SubmitEvent) {
    event.preventDefault();
    error = null;
    try {
      const imported = importPlanFile(userData.data, parsePastedPlan(text), {
        newId,
        now: nowIso(),
      });
      userData.update(() => imported.data);
      router.navigate(paths.plan(imported.planId));
    } catch (failure) {
      if (!(failure instanceof InvalidPlanFileError)) throw failure;
      console.info('Pasted plan rejected:', failure);
      error = describePlanFileProblem(failure.problem, 'text');
    }
  }
</script>

<PageHeader title="Paste a plan" back={paths.schedules()} />

<div class="page">
  <form class="form" onsubmit={importPlan} novalidate>
    <div class="field">
      <label class="field-label" for="creator-paste">Your AI assistant's reply</label>
      <textarea
        id="creator-paste"
        class="input"
        rows="12"
        autocomplete="off"
        spellcheck="false"
        placeholder="Paste the whole reply here."
        data-testid="creator-paste"
        bind:value={text}></textarea>
      <p class="field-hint">The plan is added to your plans. Nothing you have is replaced.</p>
    </div>

    {#if error}
      <p class="message error" role="alert" data-testid="creator-paste-error">
        <Icon name="alert" size={18} />
        {error}
      </p>
    {/if}

    <button
      type="submit"
      class="btn btn-primary btn-lg btn-block"
      disabled={text.trim() === ''}
      data-testid="creator-import"
    >
      Add plan
    </button>
  </form>
</div>

<style>
  .form {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }
</style>
