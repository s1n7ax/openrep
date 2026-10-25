<!--
  The options of an exercise or a superset on the workout screen, behind its
  ⋯ button: show its history, change the reps (or seconds) of its sets, add
  a set (a round), and remove the last one, which is not offered for the
  only one. History opens a sheet with every past workout with the exercise
  (each exercise of a superset), newest first, and the sets done in it.
  Changing reps opens a sheet with − n + per set; done sets are muted but
  can still be changed.
-->
<script module lang="ts">
  /** The options menu, the history sheet, or the sheet changing reps and seconds. */
  export type BlockSheet = 'menu' | 'history' | 'amounts';
</script>

<script lang="ts">
  import { newId } from '../lib/ids.ts';
  import type { LoggedSet, SessionExercise, Unit } from '../lib/schema/userData.ts';
  import { restTimer } from '../lib/stores/restTimer.svelte.ts';
  import { userData } from '../lib/stores/userData.svelte.ts';
  import { formatWeightWithUnit } from '../lib/units.ts';
  import {
    addLoggedRound,
    addLoggedSet,
    addedSetValues,
    lastSetsFor,
    removeLastLoggedRound,
    removeLastLoggedSet,
    updateLoggedSet,
    type SetValues,
  } from '../lib/userData/sessions.ts';
  import { exerciseHistory, type PastSets } from '../lib/userData/selectors.ts';
  import { amountKind, loggedAmount, shownAmount } from '../lib/userData/setCircles.ts';
  import {
    blockEntries,
    supersetExerciseLabel,
    supersetRounds,
    type Block,
  } from '../lib/userData/supersets.ts';
  import { formatDuration, formatSupersetSummary } from '../lib/userData/targets.ts';
  import { formatDay, formatSets } from '../lib/userData/workoutText.ts';
  import AmountStepper from './AmountStepper.svelte';
  import Dialog from './Dialog.svelte';
  import Icon from './Icon.svelte';

  interface Props {
    sessionId: string;
    /** The exercise or superset whose options are open; null while closed. */
    block: Block<SessionExercise> | null;
    /** Which of them shows while open. */
    sheet: BlockSheet;
    unit: Unit;
    /** The name shown for an exercise. */
    nameOf: (exercise: SessionExercise) => string;
    /** Shows `sheet`, or closes the options (null). */
    onsheet: (sheet: BlockSheet | null) => void;
  }

  let { sessionId, block, sheet, unit, nameOf, onsheet }: Props = $props();

  const entries = $derived(block ? blockEntries(block) : []);
  const isSuperset = $derived(block?.kind === 'superset');
  /** The sets, round by round (for an exercise on its own, one per round). */
  const rounds = $derived(supersetRounds(entries));
  /** Sets of the exercise, or rounds of the superset. */
  const count = $derived(rounds.length);
  const title = $derived(
    block === null
      ? ''
      : block.kind === 'superset'
        ? `Superset ${block.letter}`
        : nameOf(block.entry),
  );
  const summary = $derived.by(() => {
    if (block === null) return '';
    if (block.kind === 'superset') return formatSupersetSummary(count, block.superset.restSec);
    const sets = `${count} ${count === 1 ? 'set' : 'sets'}`;
    const { restSec } = block.entry.target;
    return restSec === undefined ? sets : `${sets} · Rest ${formatDuration(restSec)}`;
  });
  /** The history of each exercise (see `exerciseHistory`), in order. */
  const histories = $derived(
    entries.map((entry) => exerciseHistory(userData.data.sessions, entry.exercise, sessionId)),
  );
  /** "3 workouts": how many past workouts have the exercise (any of the superset's). */
  const historyHint = $derived.by(() => {
    const workouts = new Set(histories.flat().map(({ session }) => session.id)).size;
    if (workouts === 0) return 'No history yet';
    return `${workouts} ${workouts === 1 ? 'workout' : 'workouts'}`;
  });
  /** "Change reps", "Change seconds", or both for a superset of both. */
  const amountsTitle = $derived.by(() => {
    const kinds = new Set(entries.map((entry) => amountKind(entry.target)));
    if (kinds.size > 1) return 'Change reps / seconds';
    return kinds.has('time') ? 'Change seconds' : 'Change reps';
  });

  /** "10 · 8 · 8": the reps or seconds of `entry`'s sets. */
  function amounts(entry: SessionExercise): string {
    return entry.sets.map((set) => shownAmount(set, entry.target)).join(' · ');
  }

  /** "62.5 kg × 8", "30 s", "20 kg × 8–12": what a set of `entry` holds. */
  function summarize(values: SetValues, entry: SessionExercise): string {
    const amount =
      shownAmount(values, entry.target) + (amountKind(entry.target) === 'time' ? ' s' : '');
    return values.weightKg === null
      ? amount
      : `${formatWeightWithUnit(values.weightKg, unit)} × ${amount}`;
  }

  const amountsHint = $derived.by(() => {
    if (block === null) return '';
    if (block.kind === 'exercise') return amounts(block.entry);
    const { letter } = block;
    return block.entries
      .map((entry, position) => `${supersetExerciseLabel(letter, position)}: ${amounts(entry)}`)
      .join(', ');
  });
  const addHint = $derived.by(() => {
    if (block === null) return '';
    if (block.kind === 'superset') return `Round ${count + 1}`;
    const lastSets = lastSetsFor(userData.data.sessions, block.entry.exercise, sessionId);
    return `Set ${count + 1} · ${summarize(addedSetValues(block.entry, lastSets), block.entry)}`;
  });
  const removeHint = $derived.by(() => {
    if (block === null) return '';
    if (block.kind === 'superset') return `Round ${count}`;
    const last = block.entry.sets.at(-1);
    if (!last) return '';
    return `Set ${count} · ${summarize(last, block.entry)}${last.done ? ' · done' : ''}`;
  });

  function add() {
    if (block === null) return;
    const current = block;
    userData.update((data) =>
      current.kind === 'superset'
        ? addLoggedRound(data, sessionId, current.superset.id, newId)
        : addLoggedSet(data, sessionId, current.entry.id, newId()),
    );
    onsheet(null);
  }

  function removeLast() {
    if (block === null) return;
    const current = block;
    // A countdown started by a set removed goes with it.
    const removed = rounds.at(-1) ?? [];
    if (removed.some(({ entry, set }) => restTimer.startedBy(entry.id, set.id))) restTimer.stop();
    userData.update((data) =>
      current.kind === 'superset'
        ? removeLastLoggedRound(data, sessionId, current.superset.id)
        : removeLastLoggedSet(data, sessionId, current.entry.id),
    );
    onsheet(null);
  }

  function changeAmount(entry: SessionExercise, set: LoggedSet, value: number | null) {
    const patch = amountKind(entry.target) === 'time' ? { durationSec: value } : { reps: value };
    userData.update((data) => updateLoggedSet(data, sessionId, entry.id, set.id, patch));
  }
</script>

<Dialog
  open={block !== null && sheet === 'menu'}
  {title}
  subtitle={summary}
  onclose={() => onsheet(null)}
  testid="set-options"
>
  <ul class="menu">
    <li>
      <button
        type="button"
        class="menu-item"
        data-testid="show-history"
        onclick={() => onsheet('history')}
      >
        <span class="menu-icon"><Icon name="history" size={22} /></span>
        <span class="menu-text">
          <span class="menu-label">History</span>
          <span class="menu-hint">{historyHint}</span>
        </span>
        <span class="go"><Icon name="chevron-right" size={20} /></span>
      </button>
    </li>
    <li>
      <button
        type="button"
        class="menu-item"
        data-testid="change-amounts"
        onclick={() => onsheet('amounts')}
      >
        <span class="menu-icon"><Icon name="edit" size={22} /></span>
        <span class="menu-text">
          <span class="menu-label">{amountsTitle}</span>
          <span class="menu-hint">{amountsHint}</span>
        </span>
        <span class="go"><Icon name="chevron-right" size={20} /></span>
      </button>
    </li>
    <li>
      <button
        type="button"
        class="menu-item"
        data-testid={isSuperset ? 'round-add' : 'set-add'}
        onclick={add}
      >
        <span class="menu-icon"><Icon name="plus" size={22} /></span>
        <span class="menu-text">
          <span class="menu-label">{isSuperset ? 'Add round' : 'Add set'}</span>
          <span class="menu-hint">{addHint}</span>
        </span>
      </button>
    </li>
    {#if count > 1}
      <li>
        <button
          type="button"
          class="menu-item danger"
          data-testid={isSuperset ? 'round-remove-last' : 'set-remove-last'}
          onclick={removeLast}
        >
          <span class="menu-icon"><Icon name="trash" size={22} /></span>
          <span class="menu-text">
            <span class="menu-label">{isSuperset ? 'Remove last round' : 'Remove last set'}</span>
            <span class="menu-hint">{removeHint}</span>
          </span>
        </button>
      </li>
    {/if}
  </ul>
</Dialog>

<Dialog
  open={block !== null && sheet === 'history'}
  title="History"
  subtitle={title}
  onclose={() => onsheet(null)}
  testid="history-sheet"
>
  {#if block?.kind === 'superset'}
    {#each block.entries as entry, position (entry.id)}
      {@const label = supersetExerciseLabel(block.letter, position)}
      <section class="group" aria-label={label} data-testid="history-sheet-exercise">
        <h3 class="group-title">
          <span class="marker">{label}</span>
          <span class="group-name">{nameOf(entry)}</span>
        </h3>
        {@render pastWorkouts(histories[position] ?? [])}
      </section>
    {/each}
  {:else if block}
    {@render pastWorkouts(histories[0] ?? [])}
  {/if}
  {#snippet actions()}
    <button
      type="button"
      class="btn btn-primary"
      data-testid="history-close"
      onclick={() => onsheet(null)}
    >
      Close
    </button>
  {/snippet}
</Dialog>

<Dialog
  open={block !== null && sheet === 'amounts'}
  title={amountsTitle}
  subtitle={title}
  onclose={() => onsheet(null)}
  testid="amounts-sheet"
>
  {#if block?.kind === 'superset'}
    {#each block.entries as entry, position (entry.id)}
      {@const label = supersetExerciseLabel(block.letter, position)}
      <section class="group" aria-label={label} data-testid="amounts-exercise">
        <h3 class="group-title">
          <span class="marker">{label}</span>
          <span class="group-name">{nameOf(entry)}</span>
        </h3>
        <ol class="amounts">
          {#each entry.sets as set, setIndex (set.id)}
            {@render row(entry, set, `Round ${setIndex + 1}`, `Round ${setIndex + 1} ${label}`)}
          {/each}
        </ol>
      </section>
    {/each}
  {:else if block}
    {@const entry = block.entry}
    <ol class="amounts">
      {#each entry.sets as set, setIndex (set.id)}
        {@render row(entry, set, `Set ${setIndex + 1}`, `Set ${setIndex + 1}`)}
      {/each}
    </ol>
  {/if}
  {#snippet actions()}
    <button
      type="button"
      class="btn btn-primary"
      data-testid="amounts-done"
      onclick={() => onsheet(null)}
    >
      Done
    </button>
  {/snippet}
</Dialog>

{#snippet pastWorkouts(workouts: PastSets[])}
  {#if workouts.length === 0}
    <p class="no-history" data-testid="no-past-workouts">No history yet</p>
  {:else}
    <ol class="past">
      {#each workouts as workout (workout.session.id)}
        <li class="past-workout" data-testid="past-workout">
          <span class="past-date" data-testid="past-workout-date">
            {formatDay(workout.session.startedAt)}
          </span>
          <span class="past-sets" data-testid="past-workout-sets">
            {formatSets(workout.sets, unit)}
          </span>
        </li>
      {/each}
    </ol>
  {/if}
{/snippet}

{#snippet row(entry: SessionExercise, set: LoggedSet, label: string, name: string)}
  {@const weight = set.weightKg === null ? null : formatWeightWithUnit(set.weightKg, unit)}
  <li class="amount-row" class:done={set.done} data-testid="amount-row" data-set-id={set.id}>
    <span class="amount-name">
      {label}
      <span class="amount-meta">
        {#if set.done}
          <Icon name="check" size={14} /> Done{weight === null ? '' : ` · ${weight}`}
        {:else}
          {weight ?? 'No weight'}
        {/if}
      </span>
    </span>
    <AmountStepper
      {name}
      value={loggedAmount(set, amountKind(entry.target))}
      target={entry.target}
      onchange={(value) => changeAmount(entry, set, value)}
    />
  </li>
{/snippet}

<style>
  .menu {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0 calc(-1 * var(--space-2));
    padding: 0;
    list-style: none;
  }

  .menu-item {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    min-height: 60px;
    padding: var(--space-2);
    border: none;
    border-radius: var(--radius-md);
    background: transparent;
    color: var(--text);
    text-align: left;
    cursor: pointer;
  }

  .menu-item:hover {
    background: var(--surface-2);
  }

  .menu-icon {
    display: grid;
    flex: none;
    place-items: center;
    width: var(--tap);
    height: var(--tap);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text-2);
  }

  .menu-text {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  .menu-label {
    font-size: var(--text-md);
    font-weight: 700;
    line-height: 1.3;
  }

  .menu-hint {
    color: var(--text-3);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  .go {
    color: var(--text-3);
  }

  .danger .menu-label {
    color: var(--danger);
  }

  .danger .menu-icon {
    background: var(--danger-soft);
    color: var(--danger);
  }

  .group {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .group + .group {
    margin-top: var(--space-4);
  }

  .group-title {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--text);
    font-size: var(--text-md);
    font-weight: 700;
    line-height: 1.25;
  }

  .marker {
    display: grid;
    flex: none;
    place-items: center;
    min-width: 26px;
    height: 26px;
    padding: 0 var(--space-1);
    border-radius: var(--radius-pill);
    background: var(--accent-soft);
    color: var(--accent-text);
    font-size: var(--text-xs);
    font-weight: 800;
  }

  .group-name {
    min-width: 0;
  }

  /* Past workouts, newest first: the day, then the sets done. */
  .past {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .past-workout {
    display: flex;
    flex-direction: column;
    gap: 2px;
    padding: var(--space-2) 0;
    border-top: 1px solid var(--border);
  }

  .past-workout:first-child {
    padding-top: 0;
    border-top: none;
  }

  .past-date {
    color: var(--text);
    font-weight: 700;
  }

  .past-sets {
    color: var(--text-2);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  .no-history {
    color: var(--text-3);
  }

  .amounts {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .amount-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    min-height: 52px;
  }

  .amount-name {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
    color: var(--text);
    font-weight: 700;
    line-height: 1.25;
  }

  .amount-meta {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--text-3);
    font-size: var(--text-sm);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }

  /* Done sets are muted, and can still be changed. */
  .done .amount-name,
  .done :global(.stepper) {
    opacity: 0.5;
  }

  .done .amount-meta {
    color: var(--accent-text);
    font-weight: 700;
  }
</style>
