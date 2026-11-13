<!--
  Popular answers as one-tap chips, plus "Your own" to type anything else.
  Typed answers become chips of their own, picked. With `single`, picking one
  replaces the last pick, and picking it again clears it.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import Icon from './Icon.svelte';

  interface Props {
    label: string;
    options: readonly string[];
    selected: readonly string[];
    onchange: (next: string[]) => void;
    single?: boolean;
    placeholder?: string;
    testidPrefix: string;
    /** Marks the group as unanswered (a required answer left blank). */
    invalid?: boolean;
    /** Offer "Your own" to type an answer. */
    own?: boolean;
  }

  let {
    label,
    options,
    selected,
    onchange,
    single = false,
    placeholder = 'Type it here',
    testidPrefix,
    invalid = false,
    own = true,
  }: Props = $props();

  let adding = $state(false);
  let draft = $state('');
  let input: HTMLInputElement | undefined = $state();

  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

  /** Typed answers, shown after the popular ones. */
  const typed = $derived(
    selected.filter((value) => !options.some((option) => same(option, value))),
  );

  function isOn(value: string): boolean {
    return selected.some((item) => same(item, value));
  }

  function toggle(value: string) {
    if (isOn(value)) onchange(selected.filter((item) => !same(item, value)));
    else onchange(single ? [value] : [...selected, value]);
  }

  async function startAdding() {
    adding = true;
    await tick();
    input?.focus();
  }

  function add() {
    const value = draft.trim().replace(/\s+/g, ' ');
    draft = '';
    adding = false;
    if (value === '') return;
    const known = options.find((option) => same(option, value)) ?? value;
    if (!isOn(known)) onchange(single ? [known] : [...selected, known]);
  }

  function slug(value: string): string {
    return value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  }
</script>

<fieldset class="choice" data-invalid={invalid}>
  <legend class="field-label">{label}</legend>
  <div class="chips">
    {#each options as option (option)}
      <button
        type="button"
        class="chip"
        aria-pressed={isOn(option)}
        data-testid={`${testidPrefix}-${slug(option)}`}
        onclick={() => toggle(option)}>{option}</button
      >
    {/each}
    {#each typed as value (value)}
      <button
        type="button"
        class="chip typed"
        aria-pressed="true"
        aria-label={`${value}, typed. Remove`}
        data-testid={`${testidPrefix}-typed`}
        onclick={() => toggle(value)}
      >
        {value}
        <Icon name="close" size={16} />
      </button>
    {/each}
    {#if adding}
      <form
        class="add"
        onsubmit={(event) => {
          event.preventDefault();
          add();
        }}
      >
        <input
          bind:this={input}
          class="input add-input"
          type="text"
          autocomplete="off"
          enterkeyhint="done"
          maxlength="80"
          aria-label={`${label}: your own`}
          {placeholder}
          data-testid={`${testidPrefix}-input`}
          bind:value={draft}
          onblur={add}
          onkeydown={(event) => {
            if (event.key !== 'Escape') return;
            event.preventDefault();
            draft = '';
            adding = false;
          }}
        />
      </form>
    {:else if own}
      <button
        type="button"
        class="chip own"
        data-testid={`${testidPrefix}-own`}
        onclick={startAdding}
      >
        <Icon name="plus" size={16} /> Your own
      </button>
    {/if}
  </div>
</fieldset>

<style>
  .choice {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: none;
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .choice[data-invalid='true'] .chip:not([aria-pressed='true']) {
    border-color: var(--danger);
  }

  .own {
    border-style: dashed;
    color: var(--accent-text);
  }

  .add {
    flex: 1 1 160px;
  }

  .add-input {
    min-height: 40px;
    border-radius: var(--radius-pill);
  }
</style>
