<!--
  The sets of an exercise, or of a superset, as circles on the workout
  screen: one per set, its reps or seconds inside and its weight under it.
  Tapping a circle ticks the set off, or back on. A row above changes the
  weight of the selected set with − / + or by typing; the selection starts
  on, and after each tick moves to, the next set, and tapping a weight
  selects that set. A superset has a line of circles per exercise (A1,
  A2, …) and a column per round. Many sets wrap into even lines.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import {
    MAX_WEIGHT_KG,
    type LoggedSet,
    type SessionExercise,
    type Unit,
  } from '../lib/schema/userData.ts';
  import { userData } from '../lib/stores/userData.svelte.ts';
  import {
    WEIGHT_STEP,
    formatWeight,
    formatWeightWithUnit,
    parseWeight,
    stepWeight,
  } from '../lib/units.ts';
  import { setLoggedSetDone, setLoggedWeight } from '../lib/userData/sessions.ts';
  import {
    amountKind,
    circleLines,
    circlesPerLine,
    nextSet,
    shownAmount,
  } from '../lib/userData/setCircles.ts';
  import {
    supersetExerciseLabel,
    supersetRounds,
    type RoundSet,
  } from '../lib/userData/supersets.ts';
  import Icon from './Icon.svelte';

  interface Props {
    sessionId: string;
    /** The exercise, or the exercises of the superset. */
    entries: SessionExercise[];
    /** The superset's letter; null for an exercise on its own. */
    letter: string | null;
    unit: Unit;
    /** Called after a set was ticked off (`done` true) or un-ticked. */
    ondone: (sessionExerciseId: string, setId: string, done: boolean) => void;
  }

  let { sessionId, entries, letter, unit, ondone }: Props = $props();

  type Place = RoundSet<SessionExercise, LoggedSet>;

  const id = $props.id();
  const rounds = $derived(supersetRounds(entries));
  /** Every set, round by round (for an exercise on its own, in order). */
  const places = $derived(rounds.flat());
  const next = $derived(nextSet(entries));

  /** The set whose weight the user tapped; null to follow the next set. */
  let chosen = $state<string | null>(null);
  const selected = $derived(
    places.find((place) => place.set.id === chosen) ?? next ?? places.at(-1) ?? null,
  );
  const selectedKg = $derived(selected?.set.weightKg ?? null);

  /** "Set 2", "Round 2 A1": a set's name for screen readers. */
  function setName(place: Place): string {
    return letter === null
      ? `Set ${place.setIndex + 1}`
      : `Round ${place.setIndex + 1} ${supersetExerciseLabel(letter, place.position)}`;
  }

  /** "Set 2 weight", "A1 · Round 2 weight": the weight row's label. */
  function weightLabel(place: Place): string {
    return letter === null
      ? `Set ${place.setIndex + 1} weight`
      : `${supersetExerciseLabel(letter, place.position)} · Round ${place.setIndex + 1} weight`;
  }

  function formatKg(kg: number | null): string {
    return kg === null ? '' : formatWeight(kg, unit);
  }

  /** The weight being typed, in `unit`. */
  let weightText = $state(untrack(() => formatKg(selectedKg)));
  /** The set whose weight `weightText` holds. */
  let weightTextFor: string | null = untrack(() => selected?.set.id ?? null);
  const weightValid = $derived(parseWeight(weightText, unit).ok);

  // Show the selected set's weight when the selection or the weight changes
  // (− / +, the unit), but not while typing a value that means it ("62.").
  $effect(() => {
    const setId = selected?.set.id ?? null;
    const kg = selectedKg;
    const currentUnit = unit;
    untrack(() => {
      const typed = parseWeight(weightText, currentUnit);
      if (setId !== weightTextFor || !typed.ok || typed.kg !== kg) {
        weightText = kg === null ? '' : formatWeight(kg, currentUnit);
      }
      weightTextFor = setId;
    });
  });

  function changeWeight(kg: number | null) {
    if (!selected) return;
    const { entry, set } = selected;
    userData.update((data) => setLoggedWeight(data, sessionId, entry.id, set.id, kg));
  }

  function onWeightInput() {
    const typed = parseWeight(weightText, unit);
    if (typed.ok) changeWeight(typed.kg);
  }

  function onWeightKeydown(event: KeyboardEvent & { currentTarget: HTMLInputElement }) {
    if (event.key === 'Enter') event.currentTarget.blur();
  }

  function toggle(place: Place) {
    const { entry, set } = place;
    const done = !set.done;
    // A tick moves the selection on to the next set, if one is left.
    if (done) {
      const left = places.some((other) => !other.set.done && other.set.id !== set.id);
      chosen = left ? null : set.id;
    }
    userData.update((data) => setLoggedSetDone(data, sessionId, entry.id, set.id, done));
    ondone(entry.id, set.id, done);
  }
</script>

<div class="set-circles" data-testid="set-circles">
  {#if selected}
    <div
      class="card weight-row"
      role="group"
      aria-labelledby={`${id}-weight`}
      data-testid="weight-row"
      data-set-id={selected.set.id}
    >
      <span class="weight-label" id={`${id}-weight`} data-testid="weight-label">
        {weightLabel(selected)}
      </span>
      <button
        type="button"
        class="round-btn"
        aria-label={`${WEIGHT_STEP[unit]} ${unit} less`}
        data-testid="weight-dec"
        disabled={selectedKg === null || selectedKg <= 0}
        onclick={() => changeWeight(stepWeight(selectedKg, unit, -1))}
      >
        <Icon name="minus" />
      </button>
      <label class="weight-value">
        <input
          class="weight-input"
          type="text"
          inputmode="decimal"
          autocomplete="off"
          enterkeyhint="done"
          placeholder="—"
          aria-label={`${weightLabel(selected)} (${unit})`}
          aria-invalid={!weightValid}
          data-testid="set-weight"
          bind:value={weightText}
          oninput={onWeightInput}
          onfocus={(event) => event.currentTarget.select()}
          onblur={() => (weightText = formatKg(selectedKg))}
          onkeydown={onWeightKeydown}
        />
        <span class="weight-unit">{unit}</span>
      </label>
      <button
        type="button"
        class="round-btn"
        aria-label={`${WEIGHT_STEP[unit]} ${unit} more`}
        data-testid="weight-inc"
        disabled={selectedKg !== null && selectedKg >= MAX_WEIGHT_KG}
        onclick={() => changeWeight(stepWeight(selectedKg, unit, 1))}
      >
        <Icon name="plus" />
      </button>
    </div>
  {/if}

  {#if letter === null}
    <ol class="circles" style:--cols={circlesPerLine(places.length)} aria-label="Sets">
      {#each places as place (place.set.id)}
        <li class="cell">
          {@render circle(place)}
          {@render caption(place)}
        </li>
      {/each}
    </ol>
  {:else}
    {#each circleLines(rounds.length) as line, lineIndex (lineIndex)}
      <div class="band" style:--cols={line.length}>
        <div class="line heads" aria-hidden="true">
          {#each line as round, column (round)}
            <span
              class="round"
              style:grid-column={column + 2}
              data-testid="workout-round"
              data-round={round + 1}
            >
              Round {round + 1}
            </span>
          {/each}
        </div>
        {#each entries as entry, position (entry.id)}
          {@const label = supersetExerciseLabel(letter, position)}
          <div class="line" role="group" aria-label={label} data-testid="superset-line">
            <span class="marker" aria-hidden="true" data-testid="set-marker">{label}</span>
            {#each line as round, column (round)}
              {@const set = entry.sets[round]}
              {#if set}
                {@const place = { entry, position, set, setIndex: round }}
                <div class="slot" style:grid-column={column + 2}>{@render circle(place)}</div>
                <div class="slot caption-slot" style:grid-column={column + 2}>
                  {@render caption(place)}
                </div>
              {/if}
            {/each}
          </div>
        {/each}
      </div>
    {/each}
  {/if}
  <p class="hint">Tap a circle when the set is done</p>
</div>

{#snippet circle(place: Place)}
  {@const set = place.set}
  {@const kind = amountKind(place.entry.target)}
  {@const amount = shownAmount(set, place.entry.target)}
  {@const isNext = !set.done && next?.set.id === set.id}
  {@const unitWord = kind === 'time' ? 's' : amount === '1' ? 'rep' : 'reps'}
  <button
    type="button"
    class="circle"
    class:done={set.done}
    class:next={isNext}
    class:long={amount.length > 3}
    aria-pressed={set.done}
    aria-label={`${setName(place)} done: ${amount} ${unitWord}${
      set.weightKg === null ? '' : ` at ${formatWeightWithUnit(set.weightKg, unit)}`
    }`}
    data-testid="set-circle"
    data-set-id={set.id}
    data-state={set.done ? 'done' : isNext ? 'next' : 'open'}
    onclick={() => toggle(place)}
  >
    <span class="amount" data-testid="set-amount">{amount}</span>
    <span class="amount-unit" aria-hidden="true">{kind === 'time' ? 'sec' : unitWord}</span>
    {#if set.done}
      <span class="tick" aria-hidden="true"><Icon name="check" size={16} /></span>
    {/if}
  </button>
{/snippet}

{#snippet caption(place: Place)}
  {@const isSelected = selected?.set.id === place.set.id}
  {@const weight =
    place.set.weightKg === null ? null : formatWeightWithUnit(place.set.weightKg, unit)}
  <button
    type="button"
    class="caption"
    class:selected={isSelected}
    aria-pressed={isSelected}
    aria-label={`${setName(place)} weight: ${weight ?? 'none'}`}
    data-testid="set-weight-caption"
    data-set-id={place.set.id}
    onclick={() => (chosen = place.set.id)}
  >
    <span>{weight ?? '—'}</span>
  </button>
{/snippet}

<style>
  .set-circles {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin: var(--space-2) var(--space-2) 0;
  }

  /* The selected set's weight. */
  .weight-row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-height: 64px;
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-4);
  }

  .weight-label {
    flex: 1;
    min-width: 0;
    color: var(--text-2);
    font-size: var(--text-sm);
    font-weight: 700;
    line-height: 1.25;
  }

  .round-btn {
    display: grid;
    flex: none;
    place-items: center;
    width: var(--tap);
    height: var(--tap);
    padding: 0;
    border: none;
    border-radius: 50%;
    background: var(--surface-2);
    color: var(--text);
    cursor: pointer;
    transition:
      background-color 120ms ease,
      transform 80ms ease;
  }

  .round-btn:active:not(:disabled) {
    transform: scale(0.95);
  }

  .round-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .weight-value {
    display: flex;
    align-items: baseline;
    justify-content: center;
    gap: var(--space-1);
    min-width: 96px;
    cursor: text;
  }

  .weight-input {
    field-sizing: content;
    min-width: 2.5ch;
    max-width: 6ch;
    padding: 0 var(--space-1);
    border: none;
    border-radius: var(--radius-sm);
    background: transparent;
    font-size: var(--text-2xl);
    font-weight: 800;
    line-height: 1.15;
    letter-spacing: -0.02em;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }

  @supports not (field-sizing: content) {
    .weight-input {
      width: 5.5ch;
    }
  }

  .weight-input::placeholder {
    color: var(--text-3);
  }

  .weight-input:focus {
    outline: 2px solid var(--focus);
    outline-offset: 0;
    background: var(--surface);
  }

  .weight-input[aria-invalid='true'] {
    color: var(--danger);
  }

  .weight-unit {
    color: var(--text-2);
    font-size: var(--text-md);
    font-weight: 700;
  }

  /* An exercise on its own: its circles, in even lines. */
  .circles {
    display: grid;
    grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
    row-gap: var(--space-2);
    margin: var(--space-2) 0 0;
    padding: 0;
    list-style: none;
  }

  .cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    min-width: 0;
  }

  /* A superset: a line per exercise, a column per round. */
  .band {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-top: var(--space-1);
  }

  .line {
    display: grid;
    grid-template-columns: 32px repeat(var(--cols), minmax(0, 1fr));
    column-gap: 2px;
  }

  .round {
    grid-row: 1;
    color: var(--text-3);
    font-size: var(--text-xs);
    font-weight: 800;
    letter-spacing: 0.04em;
    text-align: center;
    text-transform: uppercase;
    white-space: nowrap;
  }

  .marker {
    display: grid;
    grid-row: 1;
    grid-column: 1;
    place-items: center;
    align-self: center;
    min-width: 26px;
    height: 26px;
    padding: 0 var(--space-1);
    border-radius: var(--radius-pill);
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: var(--text-xs);
    font-weight: 800;
  }

  .slot {
    display: flex;
    grid-row: 1;
    justify-content: center;
    min-width: 0;
  }

  .caption-slot {
    grid-row: 2;
  }

  .circle {
    /* Sizes inside follow the circle, so a narrow one still fits its text. */
    container-type: inline-size;
    position: relative;
    display: flex;
    flex: none;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: min(72px, 100% - 8px);
    aspect-ratio: 1;
    padding: 0;
    border: 2px solid var(--border-strong);
    border-radius: 50%;
    background: var(--surface);
    color: var(--text-2);
    cursor: pointer;
    transition:
      background-color 150ms ease,
      border-color 150ms ease,
      transform 80ms ease;
  }

  .circle:active {
    transform: scale(0.95);
  }

  .amount {
    font-size: 1.75rem;
    font-size: min(1.75rem, 40cqi);
    font-weight: 800;
    line-height: 1;
    letter-spacing: -0.02em;
    font-variant-numeric: tabular-nums;
  }

  .long .amount {
    font-size: var(--text-md);
    font-size: min(var(--text-lg), 24cqi);
  }

  .amount-unit {
    margin-top: 2px;
    font-size: 0.625rem;
    font-size: min(0.625rem, 15cqi);
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    opacity: 0.8;
  }

  /* The next set: an accent ring that pulses a few times when it moves. */
  .circle.next {
    border: 4px solid var(--accent);
    color: var(--text);
    box-shadow: 0 0 0 5px var(--accent-soft);
  }

  @media (prefers-reduced-motion: no-preference) {
    .circle.next {
      animation: ring 1.8s ease-out 3;
    }
  }

  @keyframes ring {
    0% {
      box-shadow: 0 0 0 0 color-mix(in srgb, var(--accent) 40%, transparent);
    }

    70% {
      box-shadow: 0 0 0 14px transparent;
    }
  }

  .circle.done {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--on-accent);
  }

  .tick {
    position: absolute;
    top: -6px;
    right: -9px;
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--accent-text);
    color: var(--on-accent);
    box-shadow: 0 0 0 3px var(--bg);
  }

  .caption {
    /* Its text follows its width, so a narrow column still fits the weight. */
    container-type: inline-size;
    display: grid;
    place-items: center;
    width: 100%;
    min-height: var(--tap);
    padding: 0;
    border: none;
    background: transparent;
    cursor: pointer;
  }

  .caption span {
    max-width: 100%;
    padding: 3px var(--space-2);
    padding: 3px min(var(--space-2), 6cqi);
    overflow: hidden;
    border-radius: var(--radius-pill);
    color: var(--text-2);
    font-size: var(--text-sm);
    font-size: min(var(--text-sm), 19cqi);
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .caption.selected span {
    background: var(--accent-soft);
    color: var(--accent-text);
  }

  .hint {
    color: var(--text-3);
    font-size: var(--text-sm);
    text-align: center;
  }
</style>
