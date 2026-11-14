<!--
  The schedule creator's exercise picker (`#/schedule-creator/exercises/<list>`):
  the exercise list in pick mode, with photos, adding to the exercises to
  include or to avoid. A name that is not found can be added as typed.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import ExerciseBrowser from '../components/ExerciseBrowser.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import { paths, router } from '../lib/router.ts';
  import type { PickedExercise } from '../lib/schema/userData.ts';
  import { creatorBrowse } from '../lib/stores/browse.svelte.ts';
  import { userData } from '../lib/stores/userData.svelte.ts';
  import { readScheduleAnswers, setScheduleAnswers } from '../lib/userData/scheduleAnswers.ts';

  let { list }: { list: 'include' | 'avoid' } = $props();

  onMount(() => {
    if (router.state.direction !== 'pop') creatorBrowse.reset();
  });

  function add(picked: PickedExercise) {
    userData.update((data) => {
      const answers = readScheduleAnswers(data);
      const key = list === 'include' ? 'includeList' : 'avoidList';
      const known = answers[key].some((item) =>
        picked.exerciseId === undefined
          ? item.exerciseId === undefined && item.name === picked.name
          : item.exerciseId === picked.exerciseId,
      );
      return known
        ? data
        : setScheduleAnswers(data, { ...answers, [key]: [...answers[key], picked] });
    });
    router.back(paths.scheduleCreator());
  }
</script>

<PageHeader
  title={list === 'include' ? 'Exercises you want' : 'Exercises to avoid'}
  subtitle="Hold one to see it move"
  back={paths.scheduleCreator()}
/>

<div class="page">
  <ExerciseBrowser
    state={creatorBrowse}
    mode="pick"
    autofocus
    onpickexercise={(exercise) => add({ exerciseId: exercise.id, name: exercise.name })}
    onpickcustom={(exercise) => add({ name: exercise.name })}
    oncreate={(name) => add({ name })}
    createWords={{
      title: (name) => `Add “${name}” as typed`,
      text: 'Not in the list? Your assistant reads the name.',
    }}
  />
</div>
