<!--
  Equipment by picture: one-tap setups ("Full gym"), a tile with a drawing for
  each catalog equipment type, and the extras the catalog has no type for
  (bench, pull-up bar, …), popular or typed. Bodyweight is always included.
-->
<script lang="ts">
  import { equipmentLabel } from '../lib/labels.ts';
  import {
    EQUIPMENT_PRESETS,
    POPULAR_EXTRA_EQUIPMENT,
    type EquipmentPreset,
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

  function toggle(item: Equipment) {
    onchange(
      equipment.includes(item) ? equipment.filter((e) => e !== item) : [...equipment, item],
      [...extra],
    );
  }

  function presetOn(preset: EquipmentPreset): boolean {
    return (
      preset.equipment.length === equipment.length &&
      preset.equipment.every((item) => equipment.includes(item)) &&
      preset.extra.every((item) => extra.includes(item))
    );
  }
</script>

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
      <button
        type="button"
        class="tile"
        aria-pressed={equipment.includes(item)}
        data-testid={`creator-equipment-${item.replace(/\s+/g, '-')}`}
        onclick={() => toggle(item)}
      >
        <EquipmentPicture equipment={item} size={40} />
        <span class="tile-name">{equipmentLabel(item)}</span>
        {#if equipment.includes(item)}
          <span class="tick"><Icon name="check" size={12} /></span>
        {/if}
      </button>
    {/each}
  </div>

  <ChoiceChips
    label="Also have"
    options={POPULAR_EXTRA_EQUIPMENT}
    selected={extra}
    onchange={(next) => onchange([...equipment], next)}
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
