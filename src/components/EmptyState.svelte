<!--
  Friendly placeholder for an empty list or screen, with optional actions.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import Icon, { type IconName } from './Icon.svelte';

  interface Props {
    icon: IconName;
    title: string;
    text?: string;
    actions?: Snippet;
    testid?: string;
  }

  let { icon, title, text, actions, testid = 'empty-state' }: Props = $props();
</script>

<section class="empty" data-testid={testid}>
  <div class="art" aria-hidden="true"><Icon name={icon} size={34} /></div>
  <h2 class="title">{title}</h2>
  {#if text}
    <p class="text">{text}</p>
  {/if}
  {#if actions}
    <div class="actions">{@render actions()}</div>
  {/if}
</section>

<style>
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-10) var(--space-4);
    text-align: center;
  }

  .art {
    display: grid;
    place-items: center;
    width: 76px;
    height: 76px;
    margin-bottom: var(--space-2);
    border-radius: 24px;
    background: var(--accent-soft);
    color: var(--accent-text);
  }

  .title {
    font-size: var(--text-xl);
    font-weight: 750;
  }

  .text {
    max-width: 30ch;
    color: var(--text-2);
  }

  .actions {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    width: min(100%, 300px);
    margin-top: var(--space-4);
  }
</style>
