<!--
  The exercises picked to include or avoid, each with its photo, and the way
  to the picker. Typed names show without a photo.
-->
<script lang="ts">
  import { href, paths } from '../lib/router.ts';
  import type { PickedExercise } from '../lib/schema/userData.ts';
  import { catalog } from '../lib/stores/catalog.svelte.ts';
  import Icon from './Icon.svelte';

  interface Props {
    label: string;
    list: 'include' | 'avoid';
    items: readonly PickedExercise[];
    onremove: (index: number) => void;
  }

  let { label, list, items, onremove }: Props = $props();

  function photo(item: PickedExercise): string | null {
    const exercise = item.exerciseId === undefined ? undefined : catalog.exercise(item.exerciseId);
    const image = exercise?.images[0];
    return image === undefined ? null : catalog.imageUrl(image);
  }
</script>

<div class="picked">
  <p class="field-label">{label}</p>
  <ul class="items" data-testid={`creator-${list}-list`}>
    {#each items as item, index (`${item.exerciseId ?? ''}:${item.name}`)}
      {@const src = photo(item)}
      <li class="item" data-testid={`creator-${list}-item`}>
        <span class="thumb" class:avoid={list === 'avoid'}>
          {#if src}
            <img {src} alt="" width="48" height="48" loading="lazy" decoding="async" />
          {:else}
            <Icon name="dumbbell" size={20} />
          {/if}
        </span>
        <span class="name">{item.name}</span>
        <button
          type="button"
          class="icon-btn remove"
          aria-label={`Remove ${item.name}`}
          data-testid={`creator-${list}-remove`}
          onclick={() => onremove(index)}
        >
          <Icon name="close" size={18} />
        </button>
      </li>
    {/each}
    <li>
      <a
        class="add"
        href={href(paths.scheduleCreatorExercises(list))}
        data-testid={`creator-${list}-add`}
      >
        <span class="thumb add-thumb"><Icon name="plus" size={20} /></span>
        <span class="name">{items.length === 0 ? 'Find an exercise' : 'Add another'}</span>
      </a>
    </li>
  </ul>
</div>

<style>
  .items {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: var(--space-2) 0 0;
    padding: 0;
    list-style: none;
  }

  .item,
  .add {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 56px;
    padding: var(--space-1);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
  }

  .add {
    border-style: dashed;
    background: transparent;
    color: var(--accent-text);
    font-weight: 650;
    text-decoration: none;
  }

  .thumb {
    display: grid;
    flex: none;
    place-items: center;
    width: 48px;
    height: 48px;
    overflow: hidden;
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text-3);
  }

  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .thumb.avoid img {
    filter: grayscale(1);
    opacity: 0.75;
  }

  .add-thumb {
    background: var(--accent-soft);
    color: var(--accent-text);
  }

  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-size: var(--text-sm);
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
