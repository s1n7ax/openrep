<!--
  A custom exercise (`#/custom/:id`): still 3D figure with the chosen muscles
  glowing, notes, equipment, steps; Edit, Delete and Submit to the community.
-->
<script lang="ts">
  import ConfirmDialog from '../components/ConfirmDialog.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import ExerciseViewer from '../components/ExerciseViewer.svelte';
  import FactGrid from '../components/FactGrid.svelte';
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import StepList from '../components/StepList.svelte';
  import SubmitDialog from '../components/SubmitDialog.svelte';
  import {
    canSubmitCustomExercise,
    customExerciseToExercise,
    exerciseContribution,
    randomSuffix,
    type Contribution,
  } from '../lib/contribute.ts';
  import { equipmentLabel, muscleList } from '../lib/labels.ts';
  import { paths, router } from '../lib/router.ts';
  import { catalog } from '../lib/stores/catalog.svelte.ts';
  import { userData } from '../lib/stores/userData.svelte.ts';
  import { submitContribution, type SubmitResult } from '../lib/submit.ts';
  import { deleteCustomExercise } from '../lib/userData/customExercises.ts';
  import { findCustomExercise } from '../lib/userData/selectors.ts';

  let { customId }: { customId: string } = $props();

  const exercise = $derived(findCustomExercise(userData.data, customId));
  const canSubmit = $derived(!!exercise && canSubmitCustomExercise(exercise));
  const facts = $derived(
    exercise
      ? [
          {
            label: 'Equipment',
            value: exercise.equipment ? equipmentLabel(exercise.equipment) : 'None',
          },
          {
            label: 'Primary',
            value:
              exercise.primaryMuscles.length > 0 ? muscleList(exercise.primaryMuscles) : 'Not set',
          },
          ...(exercise.secondaryMuscles.length > 0
            ? [{ label: 'Secondary', value: muscleList(exercise.secondaryMuscles) }]
            : []),
        ]
      : [],
  );
  let confirmDelete = $state(false);

  function remove() {
    confirmDelete = false;
    userData.update((data) => deleteCustomExercise(data, customId));
    router.navigate(paths.exercises(), { replace: true });
  }

  let submitting = $state(false);
  let submitted = $state<{ contribution: Contribution; result: SubmitResult } | null>(null);
  let submitError = $state<string | null>(null);

  /** Opens GitHub with the exercise as a new catalog file, ready to propose as a pull request. */
  async function submit() {
    if (!exercise || submitting) return;
    submitError = null;
    let contribution: Contribution;
    try {
      contribution = exerciseContribution(
        customExerciseToExercise(exercise, {
          findExercise: (id) => catalog.exercise(id),
          suffix: randomSuffix(),
        }),
      );
    } catch (error) {
      console.error('The exercise cannot be submitted:', error);
      submitError = 'This exercise cannot be submitted. Check its name, muscles and steps.';
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

<PageHeader title={exercise?.name ?? 'Custom exercise'} back={paths.exercises()}>
  {#snippet actions()}
    {#if exercise}
      <button
        type="button"
        class="icon-btn"
        aria-label="Edit exercise"
        data-testid="custom-edit"
        onclick={() => router.navigate(paths.customEdit(customId))}
      >
        <Icon name="edit" />
      </button>
    {/if}
  {/snippet}
</PageHeader>

<div class="page">
  {#if !exercise}
    <EmptyState
      icon="alert"
      title="Exercise not found"
      text="This custom exercise was deleted."
      testid="custom-not-found"
    />
  {:else}
    {#if exercise.primaryMuscles.length > 0}
      <div class="viewer">
        <ExerciseViewer {exercise} animation={null} />
      </div>
    {:else}
      <div class="no-muscles card">
        <Icon name="cube" size={28} />
        <p>Add muscles to see them glow on the 3D figure.</p>
      </div>
    {/if}

    <section class="intro">
      <p class="eyebrow">Custom exercise</p>
      <h2 class="name" data-testid="custom-title">{exercise.name}</h2>
      {#if exercise.notes}
        <p class="notes" data-testid="custom-notes-text">{exercise.notes}</p>
      {/if}
    </section>

    <div class="block"><FactGrid {facts} /></div>

    {#if exercise.instructions.length > 0}
      <section class="section">
        <h2 class="section-title">How to do it</h2>
        <StepList steps={exercise.instructions} testid="custom-steps" />
      </section>
    {/if}

    <section class="share card">
      <h2 class="share-title">Share with the community</h2>
      <p class="share-text">
        Submit opens GitHub with this exercise ready to add to the OpenRep catalog.
      </p>
      <button
        type="button"
        class="btn btn-outline btn-block"
        disabled={!canSubmit || submitting}
        aria-describedby={canSubmit ? undefined : 'submit-hint'}
        data-testid="custom-submit"
        onclick={submit}
      >
        <Icon name="send" size={20} /> Submit to OpenRep
      </button>
      {#if !canSubmit}
        <p id="submit-hint" class="field-hint" data-testid="custom-submit-hint">
          Add at least one primary muscle and one step to submit.
        </p>
      {/if}
      {#if submitError}
        <p class="field-error" role="alert" data-testid="submit-error">{submitError}</p>
      {/if}
    </section>

    <button
      type="button"
      class="btn btn-danger-ghost btn-block"
      data-testid="custom-delete"
      onclick={() => (confirmDelete = true)}
    >
      <Icon name="trash" size={20} /> Delete exercise
    </button>

    <SubmitDialog {submitted} onclose={() => (submitted = null)} />

    <ConfirmDialog
      open={confirmDelete}
      title={`Delete “${exercise.name}”?`}
      message="Plans and workouts that use it keep its name."
      confirmLabel="Delete"
      danger
      onconfirm={remove}
      oncancel={() => (confirmDelete = false)}
    />
  {/if}
</div>

<style>
  .viewer {
    --viewer-height: min(50vh, 28rem);
    margin-bottom: var(--space-5);
  }

  .no-muscles {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    margin-bottom: var(--space-5);
    padding: var(--space-4);
    color: var(--text-2);
  }

  .intro {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-bottom: var(--space-4);
  }

  .eyebrow {
    color: var(--accent-text);
    font-size: var(--text-sm);
    font-weight: 700;
  }

  .name {
    font-size: var(--text-2xl);
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.15;
  }

  .notes {
    color: var(--text-2);
    white-space: pre-line;
  }

  .block {
    margin-bottom: var(--space-6);
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-bottom: var(--space-6);
  }

  .share {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin-bottom: var(--space-4);
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
