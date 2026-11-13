<!--
  Importing a plan from an AI assistant's reply (`#/schedule-creator/paste`):
  pasted here, or shared to the app (see `stores/sharedPlan.svelte.ts`). The
  plan in it is previewed as soon as the text holds one, and added and opened
  on "Add plan". Text that holds no plan says why, stays in the box and
  changes nothing.
-->
<script lang="ts">
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import { copyText } from '../lib/external.ts';
  import { newId, nowIso } from '../lib/ids.ts';
  import {
    describePlanFileProblem,
    importPlanFile,
    InvalidPlanFileError,
    parsePastedPlan,
    type ImportedPlan,
  } from '../lib/planFile.ts';
  import { paths, router } from '../lib/router.ts';
  import { QUICK_PLAN_PROMPT } from '../lib/schedulePrompt.ts';
  import { catalog } from '../lib/stores/catalog.svelte.ts';
  import { sharedPlan } from '../lib/stores/sharedPlan.svelte.ts';
  import { userData } from '../lib/stores/userData.svelte.ts';
  import { formatTarget } from '../lib/userData/targets.ts';

  let text = $state('');
  /** Whether the text was shared to the app rather than pasted. */
  let shared = $state(false);
  /** Whether the last Copy prompt worked; `null` before the first. */
  let copied = $state<boolean | null>(null);

  // Shared text replaces what is in the box, also when it arrives while the screen is open.
  $effect(() => {
    const incoming = sharedPlan.take();
    if (incoming === null) return;
    text = incoming;
    shared = true;
  });

  /** The plan as it would be added to the user's data now, or why the text holds none. */
  function importText(): ImportedPlan {
    return importPlanFile(userData.data, parsePastedPlan(text), {
      newId,
      now: nowIso(),
      catalog: catalog.exercises,
    });
  }

  type Preview =
    | { kind: 'empty' }
    | { kind: 'invalid'; message: string }
    | { kind: 'plan'; imported: ImportedPlan };

  const preview: Preview = $derived.by(() => {
    if (text.trim() === '') return { kind: 'empty' };
    try {
      return { kind: 'plan', imported: importText() };
    } catch (failure) {
      if (!(failure instanceof InvalidPlanFileError)) throw failure;
      return { kind: 'invalid', message: describePlanFileProblem(failure.problem, 'text') };
    }
  });

  const plan = $derived(
    preview.kind === 'plan'
      ? preview.imported.data.plans.find((entry) => entry.id === preview.imported.planId)
      : undefined,
  );
  /** Ids of the custom exercises the import would add. */
  const added = $derived.by(() => {
    if (preview.kind !== 'plan') return new Set<string>();
    const existing = new Set(userData.data.customExercises.map((custom) => custom.id));
    return new Set(
      preview.imported.data.customExercises
        .map((custom) => custom.id)
        .filter((id) => !existing.has(id)),
    );
  });
  const unit = $derived(userData.data.settings.unit);

  function exerciseName(ref: { kind: string; name: string; exerciseId?: string }): string {
    if (ref.kind === 'catalog' && ref.exerciseId !== undefined) {
      return catalog.exercise(ref.exerciseId)?.name ?? ref.name;
    }
    return ref.name;
  }

  function addPlan(event: SubmitEvent) {
    event.preventDefault();
    if (preview.kind !== 'plan') return;
    const imported = importText();
    userData.update(() => imported.data);
    router.navigate(paths.plan(imported.planId));
  }

  async function copyPrompt() {
    copied = await copyText(QUICK_PLAN_PROMPT);
  }
</script>

<PageHeader title={shared ? 'Shared plan' : 'Paste a plan'} back={paths.schedules()} />

<div class="page">
  <form class="form" onsubmit={addPlan} novalidate>
    <div class="field">
      <label class="field-label" for="creator-paste">Your AI assistant's reply</label>
      <textarea
        id="creator-paste"
        class="input"
        rows={shared ? 4 : 12}
        autocomplete="off"
        spellcheck="false"
        placeholder="Paste the whole reply here."
        data-testid="creator-paste"
        bind:value={text}></textarea>
      <p class="field-hint">The plan is added to your plans. Nothing you have is replaced.</p>
    </div>

    {#if preview.kind === 'invalid'}
      <p class="message error" role="alert" data-testid="creator-paste-error">
        <Icon name="alert" size={18} />
        {preview.message}
      </p>
    {:else if plan}
      <section class="card preview" aria-labelledby="preview-title" data-testid="plan-preview">
        <h2 class="preview-title" id="preview-title" data-testid="plan-preview-name">
          {plan.name}
        </h2>
        {#each plan.days as day (day.id)}
          <div class="day" data-testid="plan-preview-day">
            <h3 class="section-title">{day.name}</h3>
            {#if day.exercises.length === 0}
              <p class="none">No exercises</p>
            {:else}
              <ul class="exercises">
                {#each day.exercises as entry (entry.id)}
                  <li class="exercise">
                    <span class="name" data-testid="plan-preview-exercise">
                      {exerciseName(entry.exercise)}
                    </span>
                    <span class="target">{formatTarget(entry, unit)}</span>
                    {#if entry.exercise.kind === 'custom' && added.has(entry.exercise.customExerciseId)}
                      <span class="new" data-testid="plan-preview-new">
                        Not in the catalog: added as your own exercise
                      </span>
                    {/if}
                  </li>
                {/each}
              </ul>
            {/if}
          </div>
        {/each}
      </section>
    {/if}

    <button
      type="submit"
      class="btn btn-primary btn-lg btn-block"
      disabled={preview.kind === 'empty'}
      data-testid="creator-import"
    >
      Add plan
    </button>
  </form>

  <section class="ask" aria-labelledby="ask-title">
    <h2 class="section-title" id="ask-title">No reply yet?</h2>
    <p class="field-hint">
      Copy this prompt into Gemini or another AI assistant and write the plan you want after it.
      Then share its reply to OpenRep, or paste it here.
    </p>
    {#if copied === true}
      <p class="message ok" role="status" data-testid="paste-prompt-copied">
        <Icon name="check" size={18} />
        Copied. Paste it into your AI assistant.
      </p>
    {:else if copied === false}
      <p class="message error" role="alert" data-testid="paste-prompt-copy-error">
        <Icon name="alert" size={18} />
        The prompt could not be copied.
      </p>
    {/if}
    <button
      type="button"
      class="btn btn-outline btn-block"
      data-testid="paste-prompt-copy"
      onclick={copyPrompt}
    >
      Copy prompt
    </button>
  </section>
</div>

<style>
  .form,
  .ask {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
  }

  .ask {
    margin-top: var(--space-6);
  }

  .preview {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: var(--space-4);
  }

  .preview-title {
    margin: 0;
    font-size: var(--text-lg);
    overflow-wrap: anywhere;
  }

  .day {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .exercises {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .exercise {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .name {
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .target,
  .none {
    margin: 0;
    font-size: var(--text-sm);
    color: var(--text-2);
  }

  .new {
    font-size: var(--text-xs);
    color: var(--text-3);
  }
</style>
