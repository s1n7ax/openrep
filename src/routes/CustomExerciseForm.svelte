<!--
  Create (`#/custom/new?name=`) or edit (`#/custom/:id/edit`) a custom
  exercise: name and notes, optionally muscles, equipment and steps. Created
  from the exercise picker (`plan`/`day` query), it is added to that plan day.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import Icon from '../components/Icon.svelte';
  import MusclePicker from '../components/MusclePicker.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import { newId, nowIso } from '../lib/ids.ts';
  import { equipmentLabel } from '../lib/labels.ts';
  import { paths, router } from '../lib/router.ts';
  import { EQUIPMENT, type Equipment, type Muscle } from '../lib/schema/common.ts';
  import { userData } from '../lib/stores/userData.svelte.ts';
  import {
    createCustomExercise,
    updateCustomExercise,
    type CustomExerciseInput,
  } from '../lib/userData/customExercises.ts';
  import { addPlanExercise } from '../lib/userData/plans.ts';
  import { findCustomExercise } from '../lib/userData/selectors.ts';
  import { defaultTarget } from '../lib/userData/targets.ts';

  type Props =
    | { mode: 'new'; initialName: string; planId: string | null; dayId: string | null }
    | { mode: 'edit'; customId: string };

  let props: Props = $props();

  // The form edits a copy; the initial values are read once when the screen
  // opens (the app remounts the screen when the route changes).
  const initial = untrack(() => ({ ...props }));
  const existing =
    initial.mode === 'edit' ? findCustomExercise(userData.data, initial.customId) : undefined;
  let name = $state(existing?.name ?? (initial.mode === 'new' ? initial.initialName : ''));
  let notes = $state(existing?.notes ?? '');
  let equipment = $state<Equipment | null>(existing?.equipment ?? null);
  let primaryMuscles = $state<Muscle[]>([...(existing?.primaryMuscles ?? [])]);
  let secondaryMuscles = $state<Muscle[]>([...(existing?.secondaryMuscles ?? [])]);
  let steps = $state<string[]>(
    existing && existing.instructions.length > 0 ? [...existing.instructions] : [''],
  );
  let triedSave = $state(false);

  const nameMissing = $derived(name.trim() === '');
  const missing = $derived(props.mode === 'edit' && !existing);

  function togglePrimary(muscle: Muscle) {
    primaryMuscles = primaryMuscles.includes(muscle)
      ? primaryMuscles.filter((m) => m !== muscle)
      : [...primaryMuscles, muscle];
    secondaryMuscles = secondaryMuscles.filter((m) => !primaryMuscles.includes(m));
  }

  function toggleSecondary(muscle: Muscle) {
    secondaryMuscles = secondaryMuscles.includes(muscle)
      ? secondaryMuscles.filter((m) => m !== muscle)
      : [...secondaryMuscles, muscle];
  }

  function save(event?: SubmitEvent) {
    event?.preventDefault();
    triedSave = true;
    if (nameMissing) return;
    const input: CustomExerciseInput = {
      name,
      notes,
      equipment,
      primaryMuscles,
      secondaryMuscles,
      instructions: steps,
    };
    const now = nowIso();
    if (props.mode === 'edit') {
      const id = props.customId;
      userData.update((data) => updateCustomExercise(data, id, input, now));
      router.back(paths.custom(id));
      return;
    }
    const id = newId();
    const { planId, dayId } = props;
    userData.update((data) => {
      const created = createCustomExercise(data, id, input, now);
      if (!planId || !dayId) return created;
      const exercise = created.customExercises.at(-1);
      return exercise
        ? addPlanExercise(
            created,
            planId,
            dayId,
            {
              id: newId(),
              exercise: { kind: 'custom', customExerciseId: id, name: exercise.name },
              target: defaultTarget(),
            },
            now,
          )
        : created;
    });
    if (planId && dayId) {
      // Back past the picker to the plan editor.
      router.back(paths.planEdit(planId), 2);
    } else {
      router.navigate(paths.custom(id), { replace: true });
    }
  }
</script>

<PageHeader title={props.mode === 'edit' ? 'Edit exercise' : 'New exercise'} back>
  {#snippet actions()}
    {#if !missing}
      <button
        type="submit"
        form="custom-form"
        class="btn btn-primary save"
        data-testid="custom-save"
      >
        Save
      </button>
    {/if}
  {/snippet}
</PageHeader>

<div class="page">
  {#if missing}
    <EmptyState icon="alert" title="Exercise not found" text="It may have been deleted." />
  {:else}
    <form id="custom-form" class="form" onsubmit={save} novalidate>
      {#if props.mode === 'new' && props.planId}
        <p class="context">It will be added to your plan day.</p>
      {/if}

      <div class="field">
        <label class="field-label" for="custom-name">Name</label>
        <input
          id="custom-name"
          class="input"
          type="text"
          autocomplete="off"
          enterkeyhint="done"
          maxlength="120"
          required
          aria-invalid={triedSave && nameMissing}
          aria-describedby={triedSave && nameMissing ? 'custom-name-error' : undefined}
          data-testid="custom-name"
          bind:value={name}
        />
        {#if triedSave && nameMissing}
          <p id="custom-name-error" class="field-error">Give the exercise a name.</p>
        {/if}
      </div>

      <div class="field">
        <label class="field-label" for="custom-notes">Notes</label>
        <textarea
          id="custom-notes"
          class="input"
          rows="3"
          placeholder="Machine settings, cues, variations…"
          data-testid="custom-notes"
          bind:value={notes}></textarea>
      </div>

      <h2 class="section-title optional">Optional details</h2>
      <p class="field-hint">
        Muscles light up the 3D figure. Muscles and steps are also needed to share the exercise.
      </p>

      <div class="field">
        <label class="field-label" for="custom-equipment">Equipment</label>
        <select
          id="custom-equipment"
          class="input"
          data-testid="custom-equipment"
          value={equipment ?? ''}
          onchange={(event) =>
            (equipment = (event.currentTarget.value || null) as Equipment | null)}
        >
          <option value="">None</option>
          {#each EQUIPMENT as option (option)}
            <option value={option}>{equipmentLabel(option)}</option>
          {/each}
        </select>
      </div>

      <MusclePicker
        label="Primary muscles"
        selected={primaryMuscles}
        ontoggle={togglePrimary}
        testidPrefix="custom-primary"
      />
      <MusclePicker
        label="Secondary muscles"
        selected={secondaryMuscles}
        disabled={primaryMuscles}
        ontoggle={toggleSecondary}
        testidPrefix="custom-secondary"
      />

      <fieldset class="steps">
        <legend class="field-label">Steps</legend>
        {#each steps as _step, index (index)}
          <div class="step">
            <span class="step-number" aria-hidden="true">{index + 1}</span>
            <label class="visually-hidden" for={`custom-step-${index}`}>Step {index + 1}</label>
            <textarea
              id={`custom-step-${index}`}
              class="input step-input"
              rows="2"
              data-testid="custom-step-input"
              bind:value={steps[index]}></textarea>
            <button
              type="button"
              class="icon-btn"
              aria-label={`Remove step ${index + 1}`}
              data-testid="custom-remove-step"
              disabled={steps.length === 1 && steps[0] === ''}
              onclick={() =>
                (steps = steps.length === 1 ? [''] : steps.filter((_, i) => i !== index))}
            >
              <Icon name="close" size={20} />
            </button>
          </div>
        {/each}
        <button
          type="button"
          class="btn btn-outline add-step"
          data-testid="custom-add-step"
          onclick={() => (steps = [...steps, ''])}
        >
          <Icon name="plus" size={20} /> Add step
        </button>
      </fieldset>

      <button
        type="submit"
        class="btn btn-primary btn-lg btn-block"
        data-testid="custom-save-bottom"
      >
        {props.mode === 'edit' ? 'Save changes' : 'Create exercise'}
      </button>
    </form>
  {/if}
</div>

<style>
  .save {
    min-height: 40px;
    margin-right: var(--space-1);
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
  }

  .context {
    padding: var(--space-3) var(--space-4);
    border-radius: var(--radius-md);
    background: var(--accent-soft);
    color: var(--accent-text);
    font-weight: 600;
  }

  .optional {
    margin-top: var(--space-2);
    margin-bottom: calc(-1 * var(--space-3));
  }

  .steps {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    min-width: 0;
    margin: 0;
    padding: 0;
    border: none;
  }

  .steps legend {
    margin-bottom: var(--space-2);
  }

  .step {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
  }

  .step-number {
    display: grid;
    flex: none;
    place-items: center;
    width: 28px;
    height: 28px;
    margin-top: 10px;
    border-radius: var(--radius-pill);
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: var(--text-sm);
    font-weight: 800;
  }

  .step-input {
    flex: 1;
    min-height: 64px;
  }

  .add-step {
    align-self: flex-start;
  }
</style>
