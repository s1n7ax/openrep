<!--
  Line icons drawn for OpenRep on a 24 px grid (stroke = currentColor).
  Decorative: pair them with visible text or an aria-label on the control.
-->
<script lang="ts" module>
  export type IconName =
    | 'back'
    | 'chevron-right'
    | 'chevron-up'
    | 'chevron-down'
    | 'plus'
    | 'close'
    | 'search'
    | 'trash'
    | 'edit'
    | 'play'
    | 'check'
    | 'plans'
    | 'dumbbell'
    | 'calendar'
    | 'history'
    | 'settings'
    | 'alert'
    | 'cube'
    | 'send'
    | 'reorder';
</script>

<script lang="ts">
  let { name, size = 24 }: { name: IconName; size?: number } = $props();
</script>

<svg
  class="icon"
  viewBox="0 0 24 24"
  width={size}
  height={size}
  aria-hidden="true"
  focusable="false"
  fill="none"
  stroke="currentColor"
  stroke-width="2"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  {#if name === 'back'}
    <path d="M15 4.5 7.5 12l7.5 7.5" />
  {:else if name === 'chevron-right'}
    <path d="m9 5 7 7-7 7" />
  {:else if name === 'chevron-up'}
    <path d="m6 14.5 6-6 6 6" />
  {:else if name === 'chevron-down'}
    <path d="m6 9.5 6 6 6-6" />
  {:else if name === 'plus'}
    <path d="M12 5v14M5 12h14" />
  {:else if name === 'close'}
    <path d="m6.5 6.5 11 11m0-11-11 11" />
  {:else if name === 'search'}
    <circle cx="10.5" cy="10.5" r="6.25" />
    <path d="m15.25 15.25 5 5" />
  {:else if name === 'trash'}
    <path
      d="M4 7h16M9.5 7V4.5h5V7M6.25 7l.9 12.25c.07.98.89 1.75 1.87 1.75h5.96c.98 0 1.8-.77 1.87-1.75L17.75 7M10 11v6M14 11v6"
    />
  {:else if name === 'edit'}
    <path
      d="M4.5 19.5h3.75L19 8.75a2.65 2.65 0 0 0-3.75-3.75L4.5 15.75v3.75ZM13.75 6.5l3.75 3.75"
    />
  {:else if name === 'play'}
    <path
      d="M8 5.75v12.5a.75.75 0 0 0 1.13.65l10.4-6.25a.75.75 0 0 0 0-1.3L9.13 5.1A.75.75 0 0 0 8 5.75Z"
      fill="currentColor"
      stroke="none"
    />
  {:else if name === 'check'}
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  {:else if name === 'plans'}
    <rect x="5" y="4.5" width="14" height="16.5" rx="2.5" />
    <path d="M9 3h6v3H9zM8.75 11h6.5M8.75 15h4.5" />
  {:else if name === 'dumbbell'}
    <path d="M7.5 12h9M2 10.5v3M22 10.5v3" />
    <rect x="4" y="7.5" width="3.5" height="9" rx="1.25" />
    <rect x="16.5" y="7.5" width="3.5" height="9" rx="1.25" />
  {:else if name === 'calendar'}
    <rect x="3.5" y="5" width="17" height="15.5" rx="2.75" />
    <path d="M3.5 10h17M8 3v4M16 3v4" />
  {:else if name === 'history'}
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  {:else if name === 'settings'}
    <path d="M4 7h8.5M17.5 7H20M4 17h2.5M11.5 17H20" />
    <circle cx="15" cy="7" r="2.5" />
    <circle cx="9" cy="17" r="2.5" />
  {:else if name === 'alert'}
    <path
      d="M10.3 4.45 2.9 17.5A1.95 1.95 0 0 0 4.6 20.4h14.8a1.95 1.95 0 0 0 1.7-2.9L13.7 4.45a1.95 1.95 0 0 0-3.4 0ZM12 9.5v4.25M12 17h.01"
    />
  {:else if name === 'cube'}
    <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3ZM4 7.5l8 4.5 8-4.5M12 12v9" />
  {:else if name === 'send'}
    <path d="M20.5 3.5 3.5 10.25l6.75 3 3 6.75L20.5 3.5ZM20.5 3.5l-10.25 9.75" />
  {:else if name === 'reorder'}
    <path d="m8 9.5 4-4 4 4M8 14.5l4 4 4-4" />
  {/if}
</svg>

<style>
  .icon {
    flex: none;
    display: block;
  }
</style>
