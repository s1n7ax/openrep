<!--
  "Are you sure?" dialog with a cancel and a confirm button.
-->
<script lang="ts">
  import Dialog from './Dialog.svelte';

  interface Props {
    open: boolean;
    title: string;
    message: string;
    confirmLabel: string;
    /** Style the confirm button as destructive. */
    danger?: boolean;
    onconfirm: () => void;
    oncancel: () => void;
  }

  let { open, title, message, confirmLabel, danger = false, onconfirm, oncancel }: Props = $props();
</script>

<Dialog {open} {title} onclose={oncancel} testid="confirm-dialog">
  <p>{message}</p>
  {#snippet actions()}
    <button type="button" class="btn btn-outline" data-testid="confirm-cancel" onclick={oncancel}>
      Cancel
    </button>
    <button
      type="button"
      class="btn"
      class:btn-danger={danger}
      class:btn-primary={!danger}
      data-testid="confirm-ok"
      onclick={onconfirm}
    >
      {confirmLabel}
    </button>
  {/snippet}
</Dialog>
