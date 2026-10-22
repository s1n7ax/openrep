<!--
  Exercise picker (`#/plans/:id/days/:dayId/add`): the exercise list in pick
  mode. Picking adds the exercise with a default target and returns to the
  editor; "Create custom exercise '<query>'" opens the custom exercise form,
  which adds the new exercise to the day.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import ExerciseBrowser from '../components/ExerciseBrowser.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import { newId, nowIso } from '../lib/ids.ts';
  import { paths, router } from '../lib/router.ts';
  import type { Exercise } from '../lib/schema/exercise.ts';
  import type { CustomExercise, ExerciseRef, PlanTarget } from '../lib/schema/userData.ts';
  import { pickerBrowse } from '../lib/stores/browse.svelte.ts';
  import { userData } from '../lib/stores/userData.svelte.ts';
  import { addPlanExercise } from '../lib/userData/plans.ts';
  import { findDay, findPlan } from '../lib/userData/selectors.ts';
  import { defaultTarget } from '../lib/userData/targets.ts';

  let { planId, dayId }: { planId: string; dayId: string } = $props();

  const plan = $derived(findPlan(userData.data, planId));
  const day = $derived(findDay(plan, dayId));

  onMount(() => {
    // A fresh search each time the picker is opened; kept when coming back to it.
    if (router.state.direction !== 'pop') pickerBrowse.reset();
  });

  function add(exercise: ExerciseRef, target: PlanTarget) {
    userData.update((data) =>
      addPlanExercise(data, planId, dayId, { id: newId(), exercise, target }, nowIso()),
    );
    router.back(paths.planEdit(planId));
  }

  function pickExercise(exercise: Exercise) {
    add(
      { kind: 'catalog', exerciseId: exercise.id, name: exercise.name },
      defaultTarget(exercise.force),
    );
  }

  function pickCustom(exercise: CustomExercise) {
    add({ kind: 'custom', customExerciseId: exercise.id, name: exercise.name }, defaultTarget());
  }
</script>

<PageHeader
  title="Add exercise"
  subtitle={day ? `to ${day.name.trim() || 'this day'}` : undefined}
  back={paths.planEdit(planId)}
/>

<div class="page">
  {#if !day}
    <EmptyState icon="alert" title="Day not found" text="The plan or day may have been deleted." />
  {:else}
    <ExerciseBrowser
      state={pickerBrowse}
      mode="pick"
      autofocus
      onpickexercise={pickExercise}
      onpickcustom={pickCustom}
      oncreate={(name) => router.navigate(paths.customNew({ name, planId, dayId }))}
    />
  {/if}
</div>
