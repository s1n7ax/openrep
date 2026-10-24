<!--
  Modal dialog on the native <dialog> element: focus trapping, Escape and
  Android's back button close it, as does tapping the backdrop. On phones it
  sits at the bottom, within thumb reach.
-->
<script lang="ts">
  import type { Snippet } from 'svelte';
  import { router } from '../lib/router.ts';

  interface Props {
    open: boolean;
    title: string;
    /** A line under the title. */
    subtitle?: string;
    /** Called when the user dismisses the dialog (backdrop, Escape, back button). */
    onclose: () => void;
    children?: Snippet;
    /** Buttons at the bottom; a dialog without them is closed by dismissing it or by its content. */
    actions?: Snippet;
    testid?: string;
  }

  let { open, title, subtitle, onclose, children, actions, testid = 'dialog' }: Props = $props();

  let dialog: HTMLDialogElement | undefined = $state();
  const titleId = $props.id();

  $effect(() => {
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  });

  $effect(() => {
    if (!open) return;
    return router.pushBackHandler(onclose);
  });

  function onCancel(event: Event) {
    event.preventDefault();
    onclose();
  }

  function onBackdropClick(event: MouseEvent) {
    if (event.target === dialog) onclose();
  }
</script>

<dialog
  bind:this={dialog}
  class="dialog"
  aria-labelledby={titleId}
  data-testid={testid}
  oncancel={onCancel}
  onclick={onBackdropClick}
>
  <div class="content">
    <header>
      <h2 id={titleId} class="title">{title}</h2>
      {#if subtitle}
        <p class="subtitle" data-testid={`${testid}-subtitle`}>{subtitle}</p>
      {/if}
    </header>
    {#if children}
      <div class="body">{@render children()}</div>
    {/if}
    {#if actions}
      <div class="actions">{@render actions()}</div>
    {/if}
  </div>
</dialog>

<style>
  .dialog {
    width: min(100% - 2 * var(--space-4), 440px);
    max-height: calc(100dvh - var(--safe-top) - var(--safe-bottom) - 2 * var(--space-4));
    margin: auto auto calc(var(--safe-bottom) + var(--space-4));
    padding: 0;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    color: var(--text);
    box-shadow: var(--shadow-md);
  }

  @media (min-width: 600px) {
    .dialog {
      margin: auto;
    }
  }

  .dialog::backdrop {
    background: var(--scrim);
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    padding: var(--space-6) var(--space-5) var(--space-5);
  }

  .title {
    font-size: var(--text-xl);
    font-weight: 750;
    line-height: 1.25;
  }

  .subtitle {
    margin-top: 2px;
    color: var(--text-2);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  .body {
    color: var(--text-2);
  }

  .actions {
    display: flex;
    flex-direction: column-reverse;
    gap: var(--space-2);
  }

  @media (min-width: 400px) {
    .actions {
      flex-direction: row;
      justify-content: flex-end;
    }
  }
</style>
