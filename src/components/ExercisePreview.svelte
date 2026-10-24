<!--
  Preview of an exercise held in the exercise list: its name and its 3D
  animation, else its photos taking turns (start and end of the movement),
  else the still figure with its muscles glowing. Close and the list's own
  action (Add or Open) below; the list keeps its search and scroll position
  underneath.
-->
<script lang="ts" module>
  import type { Exercise } from '../lib/schema/exercise.ts';
  import type { CustomExercise } from '../lib/schema/userData.ts';

  export type PreviewedExercise =
    { kind: 'catalog'; exercise: Exercise } | { kind: 'custom'; exercise: CustomExercise };
</script>

<script lang="ts">
  import type { Snippet } from 'svelte';
  import { catalog } from '../lib/stores/catalog.svelte.ts';
  import Dialog from './Dialog.svelte';
  import ExerciseViewer from './ExerciseViewer.svelte';
  import Icon from './Icon.svelte';

  /** How long each photo is shown. */
  const PHOTO_MS = 1000;

  interface Props {
    /** The exercise shown; the preview is closed while null. */
    previewed: PreviewedExercise | null;
    /** Called when the user dismisses the preview (Close, backdrop, Escape, back button). */
    onclose: () => void;
    /** The list's action for the exercise (Add or Open), next to Close. */
    action: Snippet<[PreviewedExercise]>;
  }

  let { previewed, onclose, action }: Props = $props();

  const exercise = $derived(previewed?.exercise ?? null);
  const animation = $derived(
    previewed?.kind === 'catalog' ? catalog.animation(previewed.exercise.id) : null,
  );
  /** Photos are shown only when there is no animation. */
  const photos = $derived(
    previewed?.kind === 'catalog' && !animation ? previewed.exercise.images : [],
  );

  let shown = $state(0);
  let failedImages = $state<string[]>([]);

  // Each preview starts on the first photo and takes the next every PHOTO_MS.
  // It loads its photos afresh: one that failed offline may load by now.
  $effect(() => {
    const count = photos.length;
    shown = 0;
    failedImages = [];
    if (count < 2) return;
    const timer = setInterval(() => (shown = (shown + 1) % count), PHOTO_MS);
    return () => clearInterval(timer);
  });

  // The list stays where it is underneath: a drag on the backdrop would scroll it.
  $effect(() => {
    if (!previewed) return;
    const root = document.documentElement;
    root.style.overflow = 'hidden';
    return () => root.style.removeProperty('overflow');
  });
</script>

<Dialog open={previewed !== null} title={exercise?.name ?? ''} {onclose} testid="exercise-preview">
  {#if exercise}
    {#if photos.length > 0}
      <div class="stage photos" data-testid="preview-photos" data-shown={shown}>
        {#each photos as image, index (image)}
          <figure class="photo" class:shown={index === shown}>
            {#if failedImages.includes(image)}
              <p class="empty">Photo unavailable offline</p>
            {:else}
              <img
                src={catalog.imageUrl(image)}
                alt={`${exercise.name}, photo ${index + 1} of ${photos.length}`}
                draggable="false"
                decoding="async"
                onerror={() => (failedImages = [...failedImages, image])}
              />
            {/if}
          </figure>
        {/each}
      </div>
    {:else}
      <div class="stage">
        {#if animation || exercise.primaryMuscles.length > 0}
          <ExerciseViewer {exercise} {animation} compact />
        {:else}
          <p class="empty">
            <Icon name="cube" size={28} />
            Add muscles to see them glow on the 3D figure.
          </p>
        {/if}
      </div>
    {/if}
  {/if}
  {#snippet actions()}
    <button type="button" class="btn btn-outline" data-testid="preview-close" onclick={onclose}>
      Close
    </button>
    {#if previewed}
      {@render action(previewed)}
    {/if}
  {/snippet}
</Dialog>

<style>
  .stage {
    --viewer-height: min(46dvh, 22rem);
    height: var(--viewer-height);
    overflow: hidden;
    border-radius: 12px;
    background: var(--surface-2);
  }

  /* As tall as the photos (most are landscape), up to the height of the 3D view. */
  .photos {
    display: grid;
    height: auto;
    min-height: 12rem;
  }

  /* Stacked: the next photo is loaded before its turn. */
  .photo {
    grid-area: 1 / 1;
    margin: 0;
    visibility: hidden;
  }

  .photo.shown {
    visibility: visible;
  }

  img {
    display: block;
    width: 100%;
    height: auto;
    max-height: var(--viewer-height);
    object-fit: contain;
  }

  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-2);
    height: 100%;
    padding: var(--space-4);
    color: var(--text-3);
    font-size: var(--text-sm);
    text-align: center;
  }
</style>
