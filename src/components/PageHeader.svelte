<!--
  Sticky screen header: optional back button, title (large on tab roots),
  optional subtitle and trailing actions. Clears the status bar safe area.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { router } from '../lib/router.ts';
  import Icon from './Icon.svelte';

  interface Props {
    title: string;
    subtitle?: string;
    /** Show a back button. A string is the fallback path when there is no in-app history. */
    back?: boolean | string;
    /** Large title for tab root screens. */
    large?: boolean;
    actions?: Snippet;
  }

  let { title, subtitle, back = false, large = false, actions }: Props = $props();

  let header: HTMLElement | undefined = $state();

  // Publish the header's height so sticky content below it can stick under it.
  $effect(() => {
    if (!header) return;
    const element = header;
    const root = document.documentElement;
    const observer = new ResizeObserver(() =>
      root.style.setProperty('--header-offset', `${element.offsetHeight}px`),
    );
    observer.observe(element);
    return () => observer.disconnect();
  });

  function goBack() {
    if (typeof back === 'string') router.back(back);
    else router.back();
  }
</script>

<header bind:this={header} class="header" class:large>
  <div class="bar">
    {#if back}
      <button
        type="button"
        class="icon-btn back"
        aria-label="Back"
        data-testid="back-button"
        onclick={goBack}
      >
        <Icon name="back" />
      </button>
    {/if}
    <div class="titles">
      <h1 class="title" data-testid="page-title">{title}</h1>
      {#if subtitle}
        <p class="subtitle">{subtitle}</p>
      {/if}
    </div>
    {#if actions}
      <div class="actions">{@render actions()}</div>
    {/if}
  </div>
</header>

<style>
  .header {
    position: sticky;
    top: 0;
    z-index: 20;
    padding-top: var(--safe-top);
    background: var(--header-bg);
    backdrop-filter: saturate(1.6) blur(14px);
    -webkit-backdrop-filter: saturate(1.6) blur(14px);
    border-bottom: 1px solid var(--border);
  }

  .bar {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    max-width: var(--page-max);
    min-height: var(--header-height);
    margin: 0 auto;
    padding: var(--space-1) calc(var(--space-2) + var(--safe-right)) var(--space-1)
      calc(var(--space-2) + var(--safe-left));
  }

  .large .bar {
    min-height: 64px;
    padding-left: calc(var(--page-gutter) + var(--safe-left));
  }

  .back {
    color: var(--text);
  }

  .titles {
    flex: 1;
    min-width: 0;
    padding: 0 var(--space-2);
  }

  .large .titles {
    padding-left: 0;
  }

  .title {
    overflow: hidden;
    font-size: var(--text-lg);
    font-weight: 700;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .large .title {
    font-size: var(--text-2xl);
    font-weight: 800;
    letter-spacing: -0.02em;
  }

  .subtitle {
    overflow: hidden;
    color: var(--text-3);
    font-size: var(--text-sm);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .actions {
    display: flex;
    align-items: center;
    gap: var(--space-1);
  }
</style>
