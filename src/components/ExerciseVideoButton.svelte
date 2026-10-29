<!--
  The YouTube shortcut over an exercise's preview: opens YouTube search
  results for the exercise's name in the system browser (the YouTube app on
  iOS and Android). An overlay, never a row of its own.
-->
<script lang="ts">
  import { openExternal, youTubeSearchUrl } from '../lib/external.ts';
  import Icon from './Icon.svelte';

  let { name }: { name: string } = $props();

  async function open() {
    try {
      await openExternal(youTubeSearchUrl(name));
    } catch (error) {
      console.error('Opening YouTube failed:', error);
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
</style>
