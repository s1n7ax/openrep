<!--
  Exercise page (`#/exercises/:id`): 3D view (animated for the core set,
  still with muscle glow otherwise), names, equipment and details, numbered
  steps and photos.
-->
<script lang="ts">
  import EmptyState from '../components/EmptyState.svelte';
  import ExerciseViewer from '../components/ExerciseViewer.svelte';
  import FactGrid, { type Fact } from '../components/FactGrid.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import StepList from '../components/StepList.svelte';
  import { equipmentLabel, valueLabel } from '../lib/labels.ts';
  import { paths } from '../lib/router.ts';
  import { catalog } from '../lib/stores/catalog.svelte.ts';

  let { exerciseId }: { exerciseId: string } = $props();

  const exercise = $derived(catalog.exercise(exerciseId));
  const animation = $derived(catalog.animation(exerciseId));
  let failedImages = $state<string[]>([]);

  const facts: Fact[] = $derived(
    exercise
      ? [
          {
            label: 'Equipment',
            value: exercise.equipment ? equipmentLabel(exercise.equipment) : 'None',
            testid: 'exercise-equipment',
          },
          { label: 'Level', value: valueLabel(exercise.level), testid: 'exercise-level' },
          { label: 'Category', value: valueLabel(exercise.category), testid: 'exercise-category' },
          ...(exercise.mechanic
            ? [
                {
                  label: 'Mechanic',
                  value: valueLabel(exercise.mechanic),
                  testid: 'exercise-mechanic',
                },
              ]
            : []),
          ...(exercise.force
            ? [{ label: 'Force', value: valueLabel(exercise.force), testid: 'exercise-force' }]
            : []),
        ]
      : [],
  );
</script>

<PageHeader title={exercise?.name ?? 'Exercise'} back={paths.exercises()} />

<div class="page">
  {#if !exercise}
    <EmptyState
      icon="alert"
      title="Exercise not found"
      text="It is not in the current catalog. It may have been renamed or removed."
      testid="exercise-not-found"
    />
  {:else}
    <div class="viewer">
      <ExerciseViewer {exercise} {animation} />
    </div>

    <section class="intro">
      <p class="eyebrow">
        {#if animation}
          <span class="badge">3D</span> Animated movement
        {:else}
          Muscles shown on a still figure
        {/if}
      </p>
      <h2 class="name" data-testid="exercise-name">{exercise.name}</h2>
      {#if exercise.aliases.length > 0}
        <p class="aliases" data-testid="exercise-aliases">
          Also known as {exercise.aliases.join(' · ')}
        </p>
      {/if}
    </section>

    <div class="block"><FactGrid {facts} /></div>

    {#if exercise.instructions.length > 0}
      <section class="section">
        <h2 class="section-title">How to do it</h2>
        <StepList steps={exercise.instructions} />
      </section>
    {/if}

    {#if exercise.images.length > 0}
      <section class="section">
        <h2 class="section-title">Photos</h2>
        <div class="photos" data-testid="exercise-photos">
          {#each exercise.images as image, index (image)}
            <figure class="photo">
              {#if failedImages.includes(image)}
                <p class="photo-missing">Photo unavailable offline</p>
              {:else}
                <img
                  src={catalog.imageUrl(image)}
                  alt={`${exercise.name}, photo ${index + 1} of ${exercise.images.length}`}
                  loading="lazy"
                  decoding="async"
                  onerror={() => (failedImages = [...failedImages, image])}
                />
              {/if}
            </figure>
          {/each}
        </div>
        {#if exercise.source.name === 'free-exercise-db'}
          <p class="credit">Photos: free-exercise-db (public domain)</p>
        {/if}
      </section>
    {/if}
  {/if}
</div>

<style>
  .viewer {
    --viewer-height: min(54vh, 30rem);
    margin-bottom: var(--space-5);
  }

  .intro {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-bottom: var(--space-4);
  }

  .eyebrow {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--text-3);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .name {
    font-size: var(--text-2xl);
    font-weight: 800;
    letter-spacing: -0.02em;
    line-height: 1.15;
  }

  .aliases {
    color: var(--text-2);
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

  .photos {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: var(--space-3);
  }

  .photo {
    display: grid;
    place-items: center;
    margin: 0;
    aspect-ratio: 3 / 2;
    overflow: hidden;
    border-radius: var(--radius-md);
    background: var(--surface-2);
  }

  .photo img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .photo-missing {
    padding: var(--space-2);
    color: var(--text-3);
    font-size: var(--text-sm);
    text-align: center;
  }

  .credit {
    color: var(--text-3);
    font-size: var(--text-xs);
  }
</style>
