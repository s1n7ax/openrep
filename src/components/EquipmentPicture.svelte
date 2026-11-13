<!--
  A picture of a piece of equipment, drawn for OpenRep on a 48 px grid in the
  icons' line style (stroke = currentColor), so it can be recognised without
  knowing its name. Decorative: the control showing it carries the name.
-->
<script lang="ts">
  import type { PopularExtraEquipment } from '../lib/scheduleChoices.ts';
  import type { Equipment } from '../lib/schema/common.ts';

  let { equipment, size = 48 }: { equipment: Equipment | PopularExtraEquipment; size?: number } =
    $props();
</script>

<svg
  class="equipment-picture"
  viewBox="0 0 48 48"
  width={size}
  height={size}
  aria-hidden="true"
  focusable="false"
  fill="none"
  stroke="currentColor"
  stroke-width="2.25"
  stroke-linecap="round"
  stroke-linejoin="round"
>
  {#if equipment === 'dumbbell'}
    <rect x="7" y="15" width="7" height="18" rx="2" />
    <rect x="34" y="15" width="7" height="18" rx="2" />
    <rect x="3" y="19" width="4" height="10" rx="1.5" />
    <rect x="41" y="19" width="4" height="10" rx="1.5" />
    <path d="M14 24h20" />
  {:else if equipment === 'barbell'}
    <path d="M2 24h44" />
    <rect x="8" y="12" width="5" height="24" rx="1.5" />
    <rect x="35" y="12" width="5" height="24" rx="1.5" />
    <rect x="13" y="16" width="3.5" height="16" rx="1.2" />
    <rect x="31.5" y="16" width="3.5" height="16" rx="1.2" />
  {:else if equipment === 'e-z curl bar'}
    <path d="M2 24h8l3-4 4 8 4-8 3 4 3-4 4 8 4-8 3 4h8" />
    <rect x="6" y="14" width="4.5" height="20" rx="1.5" />
    <rect x="37.5" y="14" width="4.5" height="20" rx="1.5" />
  {:else if equipment === 'kettlebells'}
    <path d="M17 19c-2-7 1-12 7-12s9 5 7 12" />
    <path d="M14 23a12 12 0 1 0 20 0c-2-3-6-4-10-4s-8 1-10 4Z" />
    <path d="M18 40h12" />
  {:else if equipment === 'bands'}
    <path d="M10 10c-6 8-6 20 0 28" />
    <path d="M38 10c6 8 6 20 0 28" />
    <path d="M10 10c8 4 20 4 28 0" />
    <path d="M10 38c8-4 20-4 28 0" />
    <path d="M14 15c6 2 14 2 20 0M14 33c6-2 14-2 20 0" stroke-width="1.5" />
  {:else if equipment === 'cable'}
    <path d="M10 4v40M6 44h12" />
    <path d="M10 6h16" />
    <circle cx="28" cy="8" r="3" />
    <path d="M31 8 38 32" />
    <path d="M33 34h10l-1 4h-8Z" />
    <rect x="12" y="26" width="6" height="14" rx="1" />
    <path d="M12 30h6M12 34h6" stroke-width="1.5" />
  {:else if equipment === 'machine'}
    <rect x="28" y="6" width="14" height="36" rx="2" />
    <path d="M28 14h14M28 20h14M28 26h14M28 32h14" stroke-width="1.5" />
    <path d="M35 26h9" stroke-width="2.5" />
    <path d="M6 30h16v4H6zM10 34v8M18 34v8M6 42h16" />
    <path d="M8 30V18h4" />
  {:else if equipment === 'exercise ball'}
    <circle cx="24" cy="25" r="18" />
    <path d="M8 19c10 5 22 5 32 0" stroke-width="1.5" />
    <path d="M7 29c10 5 24 5 34 0" stroke-width="1.5" />
    <path d="M12 43h24" />
  {:else if equipment === 'medicine ball'}
    <circle cx="24" cy="24" r="17" />
    <path d="M24 7v34M7 24h34" stroke-width="1.75" />
    <path d="M12 12c7 7 7 17 0 24M36 12c-7 7-7 17 0 24" stroke-width="1.5" />
  {:else if equipment === 'foam roll'}
    <ellipse cx="10" cy="24" rx="5" ry="11" />
    <path d="M10 13h28M10 35h28" />
    <path d="M38 13c3 0 5 5 5 11s-2 11-5 11" />
    <path d="M18 13.5v21M26 13.5v21M34 13.5v21" stroke-width="1.5" stroke-dasharray="2 3" />
  {:else if equipment === 'body only'}
    <circle cx="24" cy="8" r="4" />
    <path d="M24 13v14M12 18l12 3 12-3M24 27l-7 15M24 27l7 15" />
  {:else if equipment === 'Bench'}
    <rect x="4" y="17" width="40" height="6" rx="2" />
    <path d="M11 23v15M37 23v15M6 38h10M32 38h10" />
    <path d="M24 23v8" stroke-width="1.75" />
  {:else if equipment === 'Pull-up bar'}
    <path d="M5 45V4h38v41" stroke-width="1.5" />
    <path d="M5 11h38" />
    <circle cx="24" cy="19" r="3.5" />
    <path d="M17 11l2.5 13M31 11l-2.5 13M19.5 24h9M24 23v11M24 34l-3 9M24 34l3 9" />
  {:else if equipment === 'Dip station'}
    <circle cx="24" cy="8" r="3.5" />
    <path d="M18 14h12M18 14l-3 9M30 14l3 9M24 12v15M24 27l-2 11M24 27l2 11" />
    <path d="M8 23h14M26 23h14M12 23v21M36 23v21M7 44h10M31 44h10" />
  {:else if equipment === 'Squat rack'}
    <path d="M10 4v40M38 4v40M5 44h10M33 44h10" />
    <path d="M10 15h4M38 15h-4M10 32h6M38 32h-6" />
    <path d="M2 13h44" />
    <rect x="3" y="6" width="4" height="14" rx="1.2" />
    <rect x="41" y="6" width="4" height="14" rx="1.2" />
  {:else if equipment === 'Rowing machine'}
    <circle cx="37" cy="29" r="7" />
    <path d="M4 38h28M6 38v5M36 36v7M33 43h7" />
    <rect x="11" y="33" width="9" height="4" rx="1.5" />
    <path d="M27 38l2-7M26 31h6" stroke-width="1.75" />
    <path d="M31 25 18 22M16 20v4" />
  {:else if equipment === 'Treadmill'}
    <rect x="3" y="33" width="36" height="6" rx="3" />
    <path d="M35 33 39 13M8 39v4M34 39v4" />
    <rect x="34" y="7" width="11" height="6" rx="1.5" />
    <path d="M38 19H28" />
  {:else if equipment === 'Exercise bike'}
    <circle cx="35" cy="31" r="7" />
    <path d="M6 43h34M12 43l6-17M9 13h10M14 13l4 13h11M31 43l-2-33M25 9h8" />
    <circle cx="20" cy="32" r="3" stroke-width="1.75" />
  {:else if equipment === 'Rings or TRX'}
    <path d="M8 3h32" />
    <path d="M16 3v19M32 3v19" />
    <circle cx="16" cy="30" r="7.5" />
    <circle cx="32" cy="30" r="7.5" />
  {:else if equipment === 'Jump rope'}
    <rect x="6" y="5" width="6" height="15" rx="3" />
    <rect x="36" y="5" width="6" height="15" rx="3" />
    <path d="M9 20c0 30 30 30 30 0" />
  {:else if equipment === 'Sled'}
    <path d="M3 41h33c5 0 8-3 8-7" />
    <path d="M9 41 14 8M19 41 23 12M12 20h9" />
    <rect x="28" y="23" width="6" height="18" rx="1.5" />
    <path d="M26 32h10" stroke-width="1.75" />
  {:else}
    <path d="M8 18h32v22H8z" />
    <path d="M18 18v-5a6 6 0 0 1 12 0v5" />
    <path d="M8 26h32" />
    <path d="M22 26v4h4v-4" />
  {/if}
</svg>
