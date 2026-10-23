<!--
  The picture on top of a workout page: its slides side by side (see
  lib/workoutPicture.ts), swiped sideways, with dots showing which one is
  shown. 3D views run only while the page is on or next to the screen, and
  on a page off the screen only for the slide it shows, as each one holds a
  WebGL context.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { Attachment } from 'svelte/attachments';
  import { catalog } from '../lib/stores/catalog.svelte.ts';
  import type { PictureSlide } from '../lib/workoutPicture.ts';
  import ExerciseViewer from './ExerciseViewer.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    slides: PictureSlide[];
    /** The slide shown first. */
    initial: number;
    /** The page is on the screen. */
    current: boolean;
    /** The page is on or next to the screen: its 3D views may run. */
    live: boolean;
  }

  let { slides, initial, current, live }: Props = $props();

  let shown = $state(untrack(() => initial));
  let failedImages = $state<string[]>([]);

  const startAtInitial: Attachment<HTMLElement> = (track) => {
    track.scrollLeft = untrack(() => shown) * track.clientWidth;
  };

  function onScroll(event: Event & { currentTarget: HTMLElement }) {
    const track = event.currentTarget;
    if (track.clientWidth > 0) shown = Math.round(track.scrollLeft / track.clientWidth);
  }

  function slideLabel(slide: PictureSlide): string {
    const name = slide.marker ? `${slide.marker} ${slide.name}` : slide.name;
    if (slide.kind === 'photo') return `${name}, photo ${slide.number} of ${slide.count}`;
    if (slide.kind === 'missing') return `${name}, no 3D view`;
    return `${name}, 3D view`;
  }
</script>

<div class="picture" data-testid="workout-picture" data-shown={shown}>
  <div class="track" onscroll={onScroll} {@attach startAtInitial}>
    {#each slides as slide, index (slide.key)}
      <div
        class="slide"
        role="group"
        aria-label={slideLabel(slide)}
        data-testid="picture-slide"
        data-kind={slide.kind}
        data-marker={slide.marker}
      >
        {#if slide.kind === 'figure'}
          {#if live && (current || index === shown)}
            <ExerciseViewer exercise={slide.exercise} animation={slide.animation} fill compact />
          {:else}
            <div class="stage-placeholder"></div>
          {/if}
        {:else if slide.kind === 'photo'}
          {#if failedImages.includes(slide.image)}
            <p class="empty">Photo unavailable offline</p>
          {:else}
            <img
              src={catalog.imageUrl(slide.image)}
              alt={slideLabel(slide)}
              loading="lazy"
              decoding="async"
              onerror={() => (failedImages = [...failedImages, slide.image])}
            />
          {/if}
        {:else}
          <p class="empty">
            <Icon name="cube" size={28} />
            No 3D view for {slide.name}
          </p>
        {/if}
        {#if slide.marker}
          <span class="badge marker">{slide.marker}</span>
        {/if}
      </div>
    {/each}
  </div>
  {#if slides.length > 1}
    <div class="dots" aria-hidden="true">
      {#each slides as slide, index (slide.key)}
        <span class="dot" class:on={index === shown}></span>
      {/each}
    </div>
  {/if}
</div>

<style>
  .picture {
    position: relative;
    height: var(--picture-height);
    background: var(--surface-2);
  }

  .track {
    display: flex;
    height: 100%;
    overflow-x: auto;
    overflow-y: hidden;
    overscroll-behavior-x: contain;
    scroll-snap-type: x mandatory;
    scrollbar-width: none;
  }

  .track::-webkit-scrollbar {
    display: none;
  }

  .slide {
    position: relative;
    flex: 0 0 100%;
    height: 100%;
    scroll-snap-align: start;
    scroll-snap-stop: always;
  }

  .stage-placeholder {
    height: 100%;
  }

  img {
    display: block;
    width: 100%;
    height: 100%;
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

  .marker {
    position: absolute;
    top: var(--space-3);
    left: calc(var(--space-3) + var(--safe-left));
  }

  .dots {
    position: absolute;
    bottom: var(--space-2);
    left: 50%;
    display: flex;
    gap: 6px;
    padding: 5px 8px;
    border-radius: var(--radius-pill);
    background: var(--scrim);
    transform: translateX(-50%);
    pointer-events: none;
  }

  .dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: rgb(255 255 255 / 0.5);
    transition: background-color 150ms ease;
  }

  .dot.on {
    background: #ffffff;
  }
</style>
