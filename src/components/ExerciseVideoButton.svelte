<!--
  The YouTube shortcut over an exercise's preview: opens YouTube search
  results for the exercise's name in the system browser (the YouTube app on
  iOS and Android). An overlay, never a row of its own.
-->
<script lang="ts">
  import { openExternal, youTubeSearchUrl } from '../lib/external.ts';
  import Icon from './Icon.svelte';

  let { name }: { name: string } = $props();

  let failed = $state(false);

  async function open() {
    failed = false;
    try {
      await openExternal(youTubeSearchUrl(name));
    } catch (error) {
      console.error('Opening YouTube failed:', error);
      failed = true;
    }
  }
</script>

<button
  type="button"
  class="video"
  aria-label={`Watch videos of ${name} on YouTube`}
  data-testid="exercise-video"
  onclick={open}
>
  <Icon name="youtube" />
</button>
{#if failed}
  <p class="error" role="alert" data-testid="exercise-video-error">YouTube could not be opened.</p>
{/if}

<style>
  .video {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    padding: 0;
    border: 1px solid var(--button-border, var(--border));
    border-radius: 999px;
    background: var(--button-bg, var(--surface));
    color: var(--viewer-text, var(--text));
    backdrop-filter: blur(6px);
  }

  .error {
    position: absolute;
    right: 0;
    bottom: calc(100% + 0.5rem);
    margin: 0;
    padding: 0.35rem 0.6rem;
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--text);
    font-size: var(--text-xs);
    white-space: nowrap;
    box-shadow: var(--shadow-sm);
  }
</style>
