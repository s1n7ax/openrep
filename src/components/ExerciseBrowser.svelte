<!--
  Searchable, filterable exercise list: the Exercises tab ("browse": rows link
  to the exercise page) and the plan editor's picker ("pick": rows choose the
  exercise). The user's custom exercises are listed first. When a search finds
  little, it offers to create a custom exercise with the typed name.
-->
<script lang="ts">
  import { catalog } from '../lib/stores/catalog.svelte.ts';
  import { userData } from '../lib/stores/userData.svelte.ts';
  import type { BrowseState } from '../lib/stores/browse.svelte.ts';
  import { BROWSE_PAGE_SIZE } from '../lib/stores/browse.svelte.ts';
  import { equipmentLabel, muscleLabel, muscleList } from '../lib/labels.ts';
  import { href, paths } from '../lib/router.ts';
  import { createSearchIndex } from '../lib/search.ts';
  import { EQUIPMENT, MUSCLES, type Equipment, type Muscle } from '../lib/schema/common.ts';
  import type { Exercise } from '../lib/schema/exercise.ts';
  import type { CustomExercise } from '../lib/schema/userData.ts';
  import Icon from './Icon.svelte';

  /** Fewer results than this make the picker offer a custom exercise. */
  const FEW_RESULTS = 5;

  interface Props {
    state: BrowseState;
    mode: 'browse' | 'pick';
    /** Pick mode: a catalog exercise was chosen. */
    onpickexercise?: (exercise: Exercise) => void;
    /** Pick mode: a custom exercise was chosen. */
    onpickcustom?: (exercise: CustomExercise) => void;
    /** "Create custom exercise '<query>'" was chosen. */
    oncreate: (name: string) => void;
    autofocus?: boolean;
  }

  let {
    state: browse,
    mode,
    onpickexercise,
    onpickcustom,
    oncreate,
    autofocus = false,
  }: Props = $props();

  function passes(item: { primaryMuscles: readonly Muscle[]; equipment: Equipment | null }) {
    const { muscles, equipment } = browse;
    return (
      (muscles.length === 0 || item.primaryMuscles.some((muscle) => muscles.includes(muscle))) &&
      (equipment.length === 0 || (item.equipment !== null && equipment.includes(item.equipment)))
    );
  }

  const results = $derived(catalog.search(browse.query, passes));
  const customIndex = $derived(
    createSearchIndex(userData.data.customExercises, (exercise) => ({
      name: exercise.name,
      aliases: [],
      animated: false,
    })),
  );
  const customResults = $derived(customIndex.search(browse.query, passes));
  const visible = $derived(results.slice(0, browse.limit));
  const total = $derived(results.length + customResults.length);
  const trimmedQuery = $derived(browse.query.trim());
  const offerCreate = $derived(trimmedQuery !== '' && total < FEW_RESULTS);

  let sentinel: HTMLElement | undefined = $state();
  let searchInput: HTMLInputElement | undefined = $state();

  // Render more rows as the end of the list approaches. The observer is
  // recreated when the count changes so a still-visible sentinel fires again.
  $effect(() => {
    const limit = browse.limit;
    const available = results.length;
    if (!sentinel || limit >= available) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          browse.limit = limit + BROWSE_PAGE_SIZE;
        }
      },
      { rootMargin: '0px 0px 800px 0px' },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  });

  $effect(() => {
    if (autofocus) searchInput?.focus();
  });

  function slug(value: string): string {
    return value.replace(/\s+/g, '-');
  }
</script>

<div class="controls">
  <div class="search">
    <span class="search-icon"><Icon name="search" size={20} /></span>
    <label class="visually-hidden" for="exercise-search">Search exercises</label>
    <input
      bind:this={searchInput}
      id="exercise-search"
      class="search-input"
      type="search"
      placeholder="Search exercises"
      autocomplete="off"
      autocapitalize="off"
      spellcheck="false"
      enterkeyhint="search"
      data-testid="exercise-search"
      value={browse.query}
      oninput={(event) => browse.setQuery(event.currentTarget.value)}
    />
    {#if browse.query}
      <button
        type="button"
        class="icon-btn clear"
        aria-label="Clear search"
        data-testid="search-clear"
        onclick={() => {
          browse.setQuery('');
          searchInput?.focus();
        }}
      >
        <Icon name="close" size={20} />
      </button>
    {/if}
  </div>
  <div class="chips" role="group" aria-label="Filter by muscle">
    {#each MUSCLES as muscle (muscle)}
      <button
        type="button"
        class="chip"
        aria-pressed={browse.muscles.includes(muscle)}
        data-testid={`muscle-chip-${slug(muscle)}`}
        onclick={() => browse.toggleMuscle(muscle)}>{muscleLabel(muscle)}</button
      >
    {/each}
  </div>
  <div class="chips" role="group" aria-label="Filter by equipment">
    {#each EQUIPMENT as equipment (equipment)}
      <button
        type="button"
        class="chip"
        aria-pressed={browse.equipment.includes(equipment)}
        data-testid={`equipment-chip-${slug(equipment)}`}
        onclick={() => browse.toggleEquipment(equipment)}>{equipmentLabel(equipment)}</button
      >
    {/each}
  </div>
</div>

<div class="results">
  <div class="summary">
    <p class="count" aria-live="polite" data-testid="result-count">
      {total}
      {total === 1 ? 'exercise' : 'exercises'}
    </p>
    {#if browse.filtered}
      <button
        type="button"
        class="btn btn-ghost clear-filters"
        data-testid="filters-clear"
        onclick={() => browse.clearFilters()}>Clear filters</button
      >
    {/if}
  </div>

  {#if customResults.length > 0}
    <h2 class="section-title group-title">My exercises</h2>
    <ul class="list">
      {#each customResults as custom (custom.id)}
        <li>
          {#if mode === 'pick'}
            <button
              type="button"
              class="row"
              data-testid="custom-row"
              data-custom-id={custom.id}
              onclick={() => onpickcustom?.(custom)}
            >
              {@render customContent(custom)}
            </button>
          {:else}
            <a
              class="row"
              href={href(paths.custom(custom.id))}
              data-testid="custom-row"
              data-custom-id={custom.id}
            >
              {@render customContent(custom)}
            </a>
          {/if}
        </li>
      {/each}
    </ul>
  {/if}

  {#if results.length > 0}
    {#if customResults.length > 0}
      <h2 class="section-title group-title">Catalog</h2>
    {/if}
    <ul class="list">
      {#each visible as exercise (exercise.id)}
        <li>
          {#if mode === 'pick'}
            <button
              type="button"
              class="row"
              data-testid="exercise-row"
              data-exercise-id={exercise.id}
              onclick={() => onpickexercise?.(exercise)}
            >
              {@render exerciseContent(exercise)}
            </button>
          {:else}
            <a
              class="row"
              href={href(paths.exercise(exercise.id))}
              data-testid="exercise-row"
              data-exercise-id={exercise.id}
            >
              {@render exerciseContent(exercise)}
            </a>
          {/if}
        </li>
      {/each}
    </ul>
    <div bind:this={sentinel} class="sentinel" aria-hidden="true"></div>
  {/if}

  {#if offerCreate}
    {@render createRow()}
  {/if}

  {#if total === 0 && !offerCreate}
    <div class="none" data-testid="no-results">
      <p class="none-title">No exercises found</p>
      <p class="none-text">Try another name or fewer filters.</p>
    </div>
  {/if}
</div>

{#snippet createRow()}
  <button
    type="button"
    class="row create"
    data-testid="create-custom-from-query"
    onclick={() => oncreate(trimmedQuery)}
  >
    <span class="thumb create-thumb"><Icon name="plus" /></span>
    <span class="text">
      <span class="name">Create custom exercise “{trimmedQuery}”</span>
      <span class="meta">Not in the list? Add it as your own exercise.</span>
    </span>
  </button>
{/snippet}

{#snippet exerciseContent(exercise: Exercise)}
  <span class="thumb">
    {#if exercise.images[0]}
      <img
        src={catalog.imageUrl(exercise.images[0])}
        alt=""
        width="56"
        height="56"
        loading="lazy"
        decoding="async"
      />
    {:else}
      <Icon name="dumbbell" />
    {/if}
  </span>
  <span class="text">
    <span class="name">{exercise.name}</span>
    <span class="meta">
      {muscleList(exercise.primaryMuscles)}{exercise.equipment
        ? ` · ${equipmentLabel(exercise.equipment)}`
        : ''}
    </span>
  </span>
  {#if catalog.isAnimated(exercise.id)}
    <span class="badge" data-testid="badge-3d" title="Animated 3D view">3D</span>
  {/if}
  {#if mode === 'pick'}
    <span class="trail add"><Icon name="plus" size={20} /></span>
  {:else}
    <span class="trail"><Icon name="chevron-right" size={18} /></span>
  {/if}
{/snippet}

{#snippet customContent(custom: CustomExercise)}
  <span class="thumb custom-thumb"><Icon name="edit" size={22} /></span>
  <span class="text">
    <span class="name">{custom.name}</span>
    <span class="meta">
      Custom{custom.primaryMuscles.length > 0 ? ` · ${muscleList(custom.primaryMuscles)}` : ''}
    </span>
  </span>
  {#if mode === 'pick'}
    <span class="trail add"><Icon name="plus" size={20} /></span>
  {:else}
    <span class="trail"><Icon name="chevron-right" size={18} /></span>
  {/if}
{/snippet}

<style>
  .controls {
    position: sticky;
    top: var(--header-offset, 0px);
    z-index: 10;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: calc(-1 * var(--space-4)) calc(-1 * var(--page-gutter)) 0;
    padding: var(--space-3) var(--page-gutter) var(--space-3);
    background: var(--bg);
    border-bottom: 1px solid var(--border);
  }

  .search {
    position: relative;
    display: flex;
    align-items: center;
  }

  .search-icon {
    position: absolute;
    left: var(--space-3);
    color: var(--text-3);
    pointer-events: none;
  }

  .search-input {
    width: 100%;
    height: 48px;
    padding: 0 48px 0 44px;
    border: 1px solid var(--border-strong);
    border-radius: var(--radius-pill);
    background: var(--surface);
    font-size: var(--text-md);
    appearance: none;
  }

  .search-input::-webkit-search-cancel-button {
    display: none;
  }

  .search-input:focus-visible {
    outline: 2px solid var(--focus);
    outline-offset: 0;
    border-color: var(--focus);
  }

  .clear {
    position: absolute;
    right: 2px;
  }

  .chips {
    display: flex;
    gap: var(--space-2);
    margin: 0 calc(-1 * var(--page-gutter));
    padding: 2px var(--page-gutter);
    overflow-x: auto;
    scrollbar-width: none;
  }

  .chips::-webkit-scrollbar {
    display: none;
  }

  .results {
    padding-top: var(--space-2);
  }

  .summary {
    display: flex;
    align-items: center;
    justify-content: space-between;
    min-height: var(--tap);
  }

  .count {
    color: var(--text-3);
    font-size: var(--text-sm);
    font-weight: 600;
  }

  .clear-filters {
    min-height: 36px;
    padding: 0 var(--space-2);
    font-size: var(--text-sm);
  }

  .group-title {
    margin: var(--space-3) 0 var(--space-2);
  }

  .list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    list-style: none;
  }

  .list li + li {
    border-top: 1px solid var(--border);
  }

  .row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    min-height: 72px;
    padding: var(--space-2) var(--space-3);
    border: none;
    background: transparent;
    color: inherit;
    text-align: left;
    text-decoration: none;
    cursor: pointer;
  }

  .row:active {
    background: var(--surface-2);
  }

  .create {
    margin: var(--space-3) 0;
    border: 1.5px dashed var(--accent);
    border-radius: var(--radius-lg);
    background: var(--accent-soft);
  }

  .thumb {
    display: grid;
    flex: none;
    place-items: center;
    width: 56px;
    height: 56px;
    overflow: hidden;
    border-radius: var(--radius-md);
    background: var(--surface-2);
    color: var(--text-3);
  }

  .thumb img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .custom-thumb,
  .create-thumb {
    background: var(--accent-soft);
    color: var(--accent-text);
  }

  .create-thumb {
    background: var(--accent);
    color: var(--on-accent);
  }

  .text {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .name {
    font-weight: 650;
    line-height: 1.25;
  }

  .meta {
    overflow: hidden;
    color: var(--text-3);
    font-size: var(--text-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .create .meta {
    white-space: normal;
  }

  .trail {
    flex: none;
    color: var(--text-3);
  }

  .trail.add {
    display: grid;
    place-items: center;
    width: 36px;
    height: 36px;
    border-radius: var(--radius-pill);
    background: var(--accent-soft);
    color: var(--accent-text);
  }

  .sentinel {
    height: 1px;
  }

  .none {
    padding: var(--space-10) var(--space-4);
    text-align: center;
  }

  .none-title {
    font-weight: 700;
    font-size: var(--text-lg);
  }

  .none-text {
    color: var(--text-3);
  }
</style>
