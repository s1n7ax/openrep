<!--
  Equipment by picture: one-tap setups ("Full gym"), a tile with a drawing for
  each catalog equipment type and for the popular extras the catalog has no
  type for (bench, pull-up bar, …), and typed extras. Bodyweight is always
  included.
-->
<script lang="ts">
  import { equipmentLabel } from '../lib/labels.ts';
  import {
    EQUIPMENT_PRESETS,
    POPULAR_EXTRA_EQUIPMENT,
    type EquipmentPreset,
    type PopularExtraEquipment,
  } from '../lib/scheduleChoices.ts';
  import { EQUIPMENT_CHOICES } from '../lib/schedulePrompt.ts';
  import type { Equipment } from '../lib/schema/common.ts';
  import ChoiceChips from './ChoiceChips.svelte';
  import EquipmentPicture from './EquipmentPicture.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    equipment: readonly Equipment[];
    extra: readonly string[];
    onchange: (equipment: Equipment[], extra: string[]) => void;
  }

  let { equipment, extra, onchange }: Props = $props();

  const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
  const popular = (value: string) => POPULAR_EXTRA_EQUIPMENT.find((item) => same(item, value));

  /** Extras typed in, not among the pictures. */
  const typed = $derived(extra.filter((value) => popular(value) === undefined));

  function toggle(item: Equipment) {
    onchange(
      equipment.includes(item) ? equipment.filter((e) => e !== item) : [...equipment, item],
      [...extra],
    );
  }

  function hasExtra(item: PopularExtraEquipment): boolean {
    return extra.some((value) => same(value, item));
  }

  function toggleExtra(item: PopularExtraEquipment) {
    onchange(
      [...equipment],
      hasExtra(item) ? extra.filter((value) => !same(value, item)) : [...extra, item],
    );
  }

  /** Typed extras changed; one typed as a pictured extra picks that. */
  function setTyped(next: string[]) {
    const picked = extra.filter((value) => popular(value) !== undefined);
    for (const value of next.map((item) => popular(item) ?? item)) {
      if (!picked.some((item) => same(item, value))) picked.push(value);
    }
    onchange([...equipment], picked);
  }

  function presetOn(preset: EquipmentPreset): boolean {
    return (
      preset.equipment.length === equipment.length &&
      preset.equipment.every((item) => equipment.includes(item)) &&
      preset.extra.every((item) => extra.includes(item))
    );
  }

  const slug = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '-');
</script>

{#snippet tile(
  picture: Equipment | PopularExtraEquipment,
  name: string,
  picked: boolean,
  testid: string,
  onclick: () => void,
)}
  <button type="button" class="tile" aria-pressed={picked} data-testid={testid} {onclick}>
    <EquipmentPicture equipment={picture} size={40} />
    <span class="tile-name">{name}</span>
    {#if picked}
      <span class="tick"><Icon name="check" size={12} /></span>
    {/if}
  </button>
{/snippet}

<div class="picker">
  <div class="presets" role="group" aria-label="Usual setups">
    {#each EQUIPMENT_PRESETS as preset, index (preset.name)}
      <button
        type="button"
        class="chip"
        aria-pressed={presetOn(preset)}
        data-testid={`equipment-preset-${index}`}
        onclick={() => onchange([...preset.equipment], [...preset.extra])}>{preset.name}</button
      >
    {/each}
  </div>

  <div class="tiles" role="group" aria-label="Equipment you have">
    <div class="tile always" aria-disabled="true">
      <EquipmentPicture equipment="body only" size={40} />
      <span class="tile-name">Bodyweight</span>
      <span class="tile-note">Always</span>
    </div>
    {#each EQUIPMENT_CHOICES as item (item)}
      {@render tile(
        item,
        equipmentLabel(item),
        equipment.includes(item),
        `creator-equipment-${item.replace(/\s+/g, '-')}`,
        () => toggle(item),
      )}
    {/each}
  </div>

  <fieldset class="extras">
    <legend class="field-label">Also have</legend>
    <div class="tiles">
      {#each POPULAR_EXTRA_EQUIPMENT as item (item)}
        {@render tile(item, item, hasExtra(item), `creator-extra-${slug(item)}`, () =>
          toggleExtra(item),
        )}
      {/each}
    </div>
  </fieldset>

  <ChoiceChips
    label="Something else"
    options={[]}
    selected={typed}
    onchange={setTyped}
    placeholder="Landmine, sandbag…"
    testidPrefix="creator-extra"
  />
</div>

<style>
  .picker {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
  }

  .presets {
    display: flex;
    gap: var(--space-2);
    margin: 0 calc(-1 * var(--page-gutter));
    padding: 0 var(--page-gutter) 2px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .extras {
    min-width: 0;
    margin: 0;
    padding: 0;
    border: none;
  }

  .extras .tiles {
    margin-top: var(--space-2);
  }

  .tiles {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(92px, 1fr));
    gap: var(--space-2);
  }

  .tile {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: var(--space-1);
    min-height: 96px;
    padding: var(--space-3) var(--space-2) var(--space-2);
    border: 1px solid var(--border);
    border-radius: var(--radius-md);
    background: var(--surface);
    color: var(--text-2);
    cursor: pointer;
    transition:
      background-color 120ms ease,
      transform 80ms ease;
  }

  .tile:active:not(.always) {
    transform: scale(0.97);
  }

  .tile[aria-pressed='true'] {
    border-color: var(--accent);
    background: var(--accent-soft);
    color: var(--accent-text);
    box-shadow: inset 0 0 0 1px var(--accent);
  }

  .tick {
    position: absolute;
    top: 6px;
    right: 6px;
    display: grid;
    place-items: center;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--on-accent);
  }

  .tick :global(.icon) {
    stroke-width: 3.5;
  }

  .tile.always {
    border-style: dashed;
    background: transparent;
    color: var(--text-3);
    cursor: default;
  }

  .tile-name {
    font-size: var(--text-xs);
    font-weight: 650;
    line-height: 1.2;
    text-align: center;
  }

  .tile-note {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
</style>
