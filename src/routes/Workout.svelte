<!--
  Workout logging (`#/workout/:sessionId`), full screen and one exercise per
  page: its 3D view on top (swiped sideways to its photos when it has no
  animation), then its target, what was done last time and its set rows —
  weight (in the user's unit), reps or seconds and a done tick; add and
  remove sets. Scrolling snaps from page to page (lib/pageSnap.ts); a slim
  top bar shows the day, which page this is and the sets done. A superset is
  one page: its picture swipes between its exercises, starting on the one
  whose set is next, and its rows go round by round. The last page finishes
  the workout into history. Back (the arrow or Android's back button)
  discards it, asking first when anything was entered. A workout opens on
  the first exercise with sets left; the exercise name opens its page.
  Ticking a set starts a rest countdown docked at the bottom, on every page
  (lib/userData/workoutTicks.ts says when and how long), and completing an
  exercise or superset plays a short celebration.
-->
<script module lang="ts">
  import type { Session } from '../lib/schema/userData.ts';

  /** The page each workout was last on, to return to after viewing an exercise. */
  // Not state: it is read once, when the screen opens.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const lastPages = new Map<string, string>();

  /**
   * The sessions each workout's rows were filled in from (see `prefilledSet`),
   * as they were when it first opened since the app started. Back compares the
   * rows with them, so deleting that history meanwhile neither makes untouched
   * rows look edited nor edits look untouched.
   */
  // Not state: it is read when leaving.
  // eslint-disable-next-line svelte/prefer-svelte-reactivity
  const startHistories = new Map<string, readonly Session[]>();
</script>

<script lang="ts">
  import { untrack } from 'svelte';
  import type { Attachment } from 'svelte/attachments';
  import Celebration from '../components/Celebration.svelte';
  import ConfirmDialog from '../components/ConfirmDialog.svelte';
  import EmptyState from '../components/EmptyState.svelte';
  import ExercisePicture from '../components/ExercisePicture.svelte';
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import RestTimer from '../components/RestTimer.svelte';
  import SetRow from '../components/SetRow.svelte';
  import SupersetLabel from '../components/SupersetLabel.svelte';
  import { resolveExerciseRef } from '../lib/exerciseRef.ts';
  import { newId, nowIso } from '../lib/ids.ts';
  import { PageSnapper } from '../lib/pageSnap.ts';
  import { href, paths, router } from '../lib/router.ts';
  import type { SessionExercise } from '../lib/schema/userData.ts';
  import { catalog } from '../lib/stores/catalog.svelte.ts';
  import { restTimer } from '../lib/stores/restTimer.svelte.ts';
  import { userData } from '../lib/stores/userData.svelte.ts';
  import { findPlan, findSession, lastTimeFor } from '../lib/userData/selectors.ts';
  import {
    addLoggedRound,
    addLoggedSet,
    deleteSession,
    finishSession,
  } from '../lib/userData/sessions.ts';
  import {
    blockEntries,
    blockKey,
    groupBlocks,
    supersetExerciseLabel,
    supersetRounds,
    type Block,
  } from '../lib/userData/supersets.ts';
  import {
    formatReps,
    formatSupersetExerciseTarget,
    formatSupersetSummary,
    formatTargetWithRest,
  } from '../lib/userData/targets.ts';
  import { firstOpenPage, hasEntries, nextSupersetPosition } from '../lib/userData/workoutPages.ts';
  import { tickOutcome } from '../lib/userData/workoutTicks.ts';
  import { formatDay, formatSets, sessionSetCounts } from '../lib/userData/workoutText.ts';
  import { firstSlideOf, hasPicture, pictureSlides } from '../lib/workoutPicture.ts';

  let { sessionId }: { sessionId: string } = $props();

  const session = $derived(findSession(userData.data, sessionId));
  const title = $derived(session?.dayName.trim() || 'Workout');
  const unit = $derived(userData.data.settings.unit);
  const counts = $derived(session ? sessionSetCounts(session) : { done: 0, total: 0 });
  const blocks = $derived(session ? groupBlocks(session.exercises, session.supersets) : []);
  const inProgress = $derived(session !== undefined && session.finishedAt === null);

  /** Key of the finish page, after the blocks' pages. */
  const FINISH = 'finish';

  /** Space left between a focused field and the rest countdown below it. */
  const REVEAL_GAP_PX = 8;

  function pageKey(index: number): string {
    const block = blocks[index];
    return block ? blockKey(block) : FINISH;
  }

  /** Back from an exercise's page: where the workout was; otherwise the first exercise with sets left. */
  function initialPage(): number {
    const remembered = lastPages.get(sessionId);
    if (router.state.direction === 'pop' && remembered !== undefined) {
      if (remembered === FINISH) return blocks.length;
      const index = blocks.findIndex((block) => blockKey(block) === remembered);
      if (index !== -1) return index;
    }
    return firstOpenPage(blocks);
  }

  /** The page on the screen (`blocks.length` is the finish page). */
  let page = $state(0);
  show(initialPage());
  rememberStartHistory();
  /** The confirmation being asked: discarding, or finishing with no set ticked. */
  let confirming = $state<'discard' | 'finish-empty' | null>(null);
  /** Discarded: nothing is shown while going back. */
  let discarded = $state(false);
  /** The celebration playing, if any; a new `id` starts it over. */
  let celebration = $state<{ id: number; label: string } | null>(null);

  /** This workout's rest countdown, while the set that started it is ticked off. */
  const rest = $derived.by(() => {
    const current = restTimer.current;
    if (current === null || current.sessionId !== sessionId) return null;
    const set = session?.exercises
      .find((exercise) => exercise.id === current.sessionExerciseId)
      ?.sets.find((candidate) => candidate.id === current.setId);
    return set?.done ? current : null;
  });

  const pager: Attachment<HTMLElement> = (scroller) => {
    const snapper = new PageSnapper(
      scroller,
      untrack(() => page),
      { onPageChange: show },
    );
    return () => snapper.dispose();
  };

  /** The rest countdown's dock, while it shows. */
  let restDock = $state<HTMLElement | null>(null);

  /**
   * While the countdown shows, a field that gets focus, or that has it when
   * the pages shrink (the keyboard opening), is scrolled just far enough to
   * sit above the countdown: the browser counts a field under it as visible,
   * as it floats over the pages. Never past the page, whose room below covers
   * the countdown, so the page stays.
   */
  const revealFocused: Attachment<HTMLElement> = (scroller) => {
    const reveal = () => {
      const field = document.activeElement;
      const typedIn = field instanceof HTMLInputElement && field.type !== 'checkbox';
      if (restDock === null || !typedIn || !scroller.contains(field)) return;
      const overlap = field.getBoundingClientRect().bottom - restDock.getBoundingClientRect().top;
      if (overlap > 0) scroller.scrollTop += overlap + REVEAL_GAP_PX;
    };
    const observer = new ResizeObserver(reveal);
    observer.observe(scroller);
    scroller.addEventListener('focusin', reveal);
    return () => {
      observer.disconnect();
      scroller.removeEventListener('focusin', reveal);
    };
  };

  function show(index: number) {
    page = index;
    lastPages.set(sessionId, pageKey(index));
  }

  function rememberStartHistory() {
    if (inProgress && !startHistories.has(sessionId)) {
      startHistories.set(sessionId, userData.data.sessions);
    }
  }

  // Android's back button leaves the workout like the back arrow.
  $effect(() => {
    if (!inProgress) return;
    return router.pushBackHandler(leave);
  });

  function mode(exercise: SessionExercise): 'reps' | 'time' {
    return exercise.target.durationSec !== undefined ? 'time' : 'reps';
  }

  function amountPlaceholder(exercise: SessionExercise): string {
    const { reps, durationSec } = exercise.target;
    if (durationSec !== undefined) return String(durationSec);
    return reps === undefined ? '—' : formatReps(reps);
  }

  /** Header of the reps / seconds column of a superset: "Reps", "Seconds" or both. */
  function amountHeader(exercises: SessionExercise[]): string {
    const modes = new Set(exercises.map(mode));
    return modes.size > 1 ? 'Reps / s' : modes.has('time') ? 'Seconds' : 'Reps';
  }

  function resolve(exercise: SessionExercise) {
    return resolveExerciseRef(
      exercise.exercise,
      (id) => catalog.exercise(id),
      userData.data.customExercises,
    );
  }

  /**
   * After a set was ticked off or un-ticked: any tick ends the countdown and
   * may start the next one, or a celebration; un-ticking the set that started
   * the countdown stops it.
   */
  function onSetDone(sessionExerciseId: string, setId: string, done: boolean) {
    if (!done) {
      if (restTimer.startedBy(sessionExerciseId, setId)) restTimer.stop();
      return;
    }
    const current = findSession(userData.data, sessionId);
    if (!current) return;
    const { defaultRestSec } = userData.data.settings;
    const outcome = tickOutcome(current, sessionExerciseId, setId, defaultRestSec);
    if (outcome.restSec === null) restTimer.stop();
    else restTimer.start({ sessionId, sessionExerciseId, setId, seconds: outcome.restSec });
    if (outcome.completed !== null) {
      celebration = { id: (celebration?.id ?? 0) + 1, label: doneLabel(outcome.completed) };
    }
  }

  /** "Goblet Squat done", "Superset A done": the celebration's text for the block with `key`. */
  function doneLabel(key: string): string {
    const block = blocks.find((candidate) => blockKey(candidate) === key);
    if (block?.kind === 'superset') return `Superset ${block.letter} done`;
    return block ? `${resolve(block.entry).name} done` : 'Done';
  }

  function addSet(exercise: SessionExercise) {
    userData.update((data) => addLoggedSet(data, sessionId, exercise.id, newId()));
  }

  function addRound(supersetId: string) {
    userData.update((data) => addLoggedRound(data, sessionId, supersetId, newId));
  }

  function finish() {
    if (counts.done === 0 && confirming === null) {
      confirming = 'finish-empty';
      return;
    }
    confirming = null;
    lastPages.delete(sessionId);
    startHistories.delete(sessionId);
    restTimer.stop();
    userData.update((data) => finishSession(data, sessionId, nowIso()));
    router.navigate(paths.historySession(sessionId), { replace: true });
  }

  /** Back: discards the workout, after asking when anything was entered. */
  function leave() {
    const history = startHistories.get(sessionId) ?? userData.data.sessions;
    if (session && hasEntries(session, history)) confirming = 'discard';
    else discard();
  }

  function discard() {
    const planId = session?.planId;
    const fallback = planId && findPlan(userData.data, planId) ? paths.plan(planId) : paths.plans();
    confirming = null;
    discarded = true;
    lastPages.delete(sessionId);
    startHistories.delete(sessionId);
    restTimer.stop();
    userData.update((data) => deleteSession(data, sessionId));
    router.back(fallback);
  }
</script>

{#if discarded}
  <!-- Going back. -->
{:else if !session || session.finishedAt !== null}
  <PageHeader {title} back={paths.plans()} />
  <div class="page" data-testid="workout" data-session-id={sessionId}>
    {#if !session}
      <EmptyState
        icon="alert"
        title="Workout not found"
        text="It may have been discarded."
        testid="workout-not-found"
      />
    {:else}
      <EmptyState
        icon="check"
        title="Workout finished"
        text="This workout is saved in your history."
        testid="workout-finished"
      >
        {#snippet actions()}
          <a class="btn btn-primary btn-lg" href={href(paths.historySession(session.id))}>
            View in history
          </a>
        {/snippet}
      </EmptyState>
    {/if}
  </div>
{:else}
  <div
    class="workout"
    class:resting={rest !== null}
    data-testid="workout"
    data-session-id={sessionId}
    data-page={page}
  >
    <header class="top">
      <div class="top-bar">
        <button
          type="button"
          class="icon-btn back"
          aria-label="Back"
          data-testid="back-button"
          onclick={leave}
        >
          <Icon name="back" />
        </button>
        <h1 class="title" data-testid="page-title">{title}</h1>
        {#if page < blocks.length}
          <span class="position" data-testid="workout-position">
            {page + 1} of {blocks.length}
          </span>
        {/if}
        <span
          class="sets-done"
          data-testid="workout-progress"
          data-done={counts.done}
          data-total={counts.total}
        >
          {counts.done}/{counts.total} sets
        </span>
      </div>
      <div
        class="bar"
        role="progressbar"
        aria-label="Sets done"
        aria-valuemin={0}
        aria-valuemax={counts.total}
        aria-valuenow={counts.done}
      >
        <span style:width={`${counts.total === 0 ? 0 : (100 * counts.done) / counts.total}%`}
        ></span>
      </div>
    </header>

    <div class="pages" data-testid="workout-pages" {@attach pager} {@attach revealFocused}>
      {#each blocks as block, index (blockKey(block))}
        <section
          class="slot"
          data-testid="workout-page"
          data-page={index}
          aria-label={`Exercise ${index + 1} of ${blocks.length}`}
        >
          {@render picture(block, index)}
          {#if block.kind === 'exercise'}
            {@const exercise = block.entry}
            <div
              class="exercise"
              data-testid="workout-exercise"
              data-session-exercise-id={exercise.id}
            >
              {@render exerciseHead(
                exercise,
                String(block.index + 1),
                formatTargetWithRest(exercise.target, unit),
              )}

              <div class="columns" aria-hidden="true">
                <span>Set</span>
                <span>{unit}</span>
                <span>{mode(exercise) === 'time' ? 'Seconds' : 'Reps'}</span>
                <span>Done</span>
                <span></span>
              </div>
              <ol class="sets">
                {#each exercise.sets as set, setIndex (set.id)}
                  <SetRow
                    {sessionId}
                    sessionExerciseId={exercise.id}
                    {set}
                    index={setIndex}
                    mode={mode(exercise)}
                    {unit}
                    amountPlaceholder={amountPlaceholder(exercise)}
                    canRemove={exercise.sets.length > 1}
                    ondone={(done) => onSetDone(exercise.id, set.id, done)}
                  />
                {/each}
              </ol>
              <button
                type="button"
                class="btn btn-ghost add-set"
                data-testid="set-add"
                onclick={() => addSet(exercise)}
              >
                <Icon name="plus" size={20} /> Add set
              </button>
            </div>
          {:else}
            {@const rounds = supersetRounds(block.entries)}
            <div
              class="exercise superset"
              data-testid="workout-superset"
              data-superset-id={block.superset.id}
            >
              <div class="superset-head">
                <SupersetLabel
                  letter={block.letter}
                  summary={formatSupersetSummary(rounds.length, block.superset.restSec)}
                  testid="workout-superset-summary"
                />
              </div>
              <ol class="members">
                {#each block.entries as exercise, position (exercise.id)}
                  <li
                    class="member"
                    data-testid="workout-superset-exercise"
                    data-session-exercise-id={exercise.id}
                  >
                    {@render exerciseHead(
                      exercise,
                      supersetExerciseLabel(block.letter, position),
                      formatSupersetExerciseTarget(exercise.target, unit),
                    )}
                  </li>
                {/each}
              </ol>

              <div class="columns" aria-hidden="true">
                <span></span>
                <span>{unit}</span>
                <span>{amountHeader(block.entries)}</span>
                <span>Done</span>
                <span></span>
              </div>
              {#each rounds as round, roundIndex (roundIndex)}
                <section
                  class="round"
                  data-testid="workout-round"
                  data-round={roundIndex + 1}
                  aria-label={`Round ${roundIndex + 1}`}
                >
                  <h3 class="round-title">Round {roundIndex + 1}</h3>
                  <ol class="sets">
                    {#each round as row (row.set.id)}
                      {@const label = supersetExerciseLabel(block.letter, row.position)}
                      <SetRow
                        {sessionId}
                        sessionExerciseId={row.entry.id}
                        set={row.set}
                        index={row.setIndex}
                        marker={label}
                        name={`Round ${roundIndex + 1} ${label}`}
                        mode={mode(row.entry)}
                        {unit}
                        amountPlaceholder={amountPlaceholder(row.entry)}
                        canRemove={row.entry.sets.length > 1}
                        ondone={(done) => onSetDone(row.entry.id, row.set.id, done)}
                      />
                    {/each}
                  </ol>
                </section>
              {/each}
              <button
                type="button"
                class="btn btn-ghost add-set"
                data-testid="round-add"
                onclick={() => addRound(block.superset.id)}
              >
                <Icon name="plus" size={20} /> Add round
              </button>
            </div>
          {/if}
        </section>
      {/each}

      <section
        class="slot finish"
        data-testid="workout-final"
        data-page={blocks.length}
        aria-label="Finish"
      >
        <div class="finish-content">
          <span class="finish-mark"><Icon name="check" size={36} /></span>
          <h2 class="finish-title">That’s the last exercise</h2>
          <p class="finish-sets" data-testid="workout-final-sets">
            <strong>{counts.done} of {counts.total}</strong> sets done
          </p>
          <button
            type="button"
            class="btn btn-primary btn-lg btn-block"
            data-testid="workout-finish"
            onclick={finish}
          >
            <Icon name="check" size={22} /> Finish workout
          </button>
        </div>
      </section>
    </div>

    {#if rest}
      <div class="rest-dock" bind:this={restDock}>
        {#key rest}
          <RestTimer {rest} ondismiss={() => restTimer.stop()} />
        {/key}
      </div>
    {/if}
    {#if celebration}
      {#key celebration.id}
        <Celebration label={celebration.label} onend={() => (celebration = null)} />
      {/key}
    {/if}
  </div>
{/if}

{#snippet picture(block: Block<SessionExercise>, index: number)}
  {@const entries = blockEntries(block)}
  {@const slides = pictureSlides(
    entries.map((exercise, position) => {
      const resolved = resolve(exercise);
      return {
        marker: block.kind === 'superset' ? supersetExerciseLabel(block.letter, position) : null,
        resolved,
        animation: resolved.exercise ? catalog.animation(resolved.exercise.id) : null,
      };
    }),
  )}
  {#if hasPicture(slides)}
    <ExercisePicture
      {slides}
      initial={firstSlideOf(slides, nextSupersetPosition(entries))}
      current={index === page}
      live={Math.abs(index - page) <= 1}
    />
  {/if}
{/snippet}

{#snippet exerciseHead(exercise: SessionExercise, label: string, target: string)}
  {@const resolved = resolve(exercise)}
  {@const last = lastTimeFor(userData.data.sessions, exercise.exercise, sessionId)}
  <header class="head">
    <span class="number" aria-hidden="true" data-testid="workout-exercise-label">{label}</span>
    <div class="titles">
      {#if resolved.link}
        <a class="name" href={resolved.link} data-testid="workout-exercise-name">
          {resolved.name}
          <Icon name="chevron-right" size={16} />
        </a>
      {:else}
        <span class="name" data-testid="workout-exercise-name">{resolved.name}</span>
      {/if}
      {#if resolved.note}
        <span class="missing" data-testid="missing-note">
          <Icon name="alert" size={14} />
          {resolved.note}
        </span>
      {/if}
      <span class="target" data-testid="workout-target">{target}</span>
      {#if exercise.target.notes}
        <span class="notes">{exercise.target.notes}</span>
      {/if}
    </div>
  </header>

  {#if last}
    <p class="last-time" data-testid="last-time">
      <Icon name="history" size={16} />
      <span>
        <span class="last-label">Last time · {formatDay(last.session.startedAt)}:</span>
        {formatSets(last.sets, unit)}
      </span>
    </p>
  {/if}
{/snippet}

<ConfirmDialog
  open={confirming !== null}
  title={confirming === 'discard' ? 'Discard this workout?' : 'No sets ticked off'}
  message={confirming === 'discard'
    ? 'Everything logged in this workout is deleted. This cannot be undone.'
    : 'Finish anyway? The workout is saved to your history without completed sets.'}
  confirmLabel={confirming === 'discard' ? 'Discard' : 'Finish'}
  danger={confirming === 'discard'}
  onconfirm={() => (confirming === 'discard' ? discard() : finish())}
  oncancel={() => (confirming = null)}
/>

<style>
  .workout {
    --picture-height: min(38dvh, 24rem);
    /* The rest countdown and the gap below it. */
    --rest-height: calc(64px + var(--space-3));
    position: fixed;
    inset: 0;
    display: flex;
    flex-direction: column;
    background: var(--bg);
  }

  .top {
    position: relative;
    z-index: 1;
    flex: none;
    padding-top: var(--safe-top);
    background: var(--header-bg);
    border-bottom: 1px solid var(--border);
  }

  .top-bar {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    max-width: var(--page-max);
    min-height: 52px;
    margin: 0 auto;
    padding: var(--space-1) calc(var(--space-3) + var(--safe-right)) var(--space-1)
      calc(var(--space-1) + var(--safe-left));
  }

  .back {
    color: var(--text);
  }

  .title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    font-size: var(--text-lg);
    font-weight: 700;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .position {
    flex: none;
    padding: 2px var(--space-3);
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    font-size: var(--text-sm);
    font-weight: 750;
    font-variant-numeric: tabular-nums;
  }

  .sets-done {
    flex: none;
    color: var(--text-2);
    font-size: var(--text-sm);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .bar {
    position: absolute;
    right: 0;
    bottom: -1px;
    left: 0;
    height: 3px;
  }

  .bar span {
    display: block;
    height: 100%;
    background: var(--accent);
    transition: width 200ms ease;
  }

  /* The pages, one screen each, paged by PageSnapper. */
  .pages {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    /* Composited: otherwise Chromium ignores swipes after a snap (which turns
       scrolling off and on) until something on the pages repaints. */
    will-change: scroll-position;
  }

  .slot {
    display: flex;
    flex-direction: column;
    min-height: 100%;
    max-width: var(--page-max);
    margin: 0 auto;
    padding-bottom: calc(var(--space-6) + var(--safe-bottom));
  }

  /* Room below the content to scroll it out from under the rest countdown.
     It is added at the bottom, so nothing on the screen moves. */
  .resting .slot {
    padding-bottom: calc(var(--space-6) + var(--safe-bottom) + var(--rest-height));
  }

  .rest-dock {
    position: absolute;
    right: calc(var(--space-3) + var(--safe-right));
    bottom: calc(var(--space-3) + var(--safe-bottom));
    left: calc(var(--space-3) + var(--safe-left));
    z-index: 1;
    max-width: calc(var(--page-max) - 2 * var(--space-3));
    margin: 0 auto;
  }

  .exercise {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-4) calc(var(--space-2) + var(--safe-right)) 0
      calc(var(--space-2) + var(--safe-left));
  }

  .head {
    display: flex;
    align-items: flex-start;
    gap: var(--space-3);
    padding: 0 var(--space-2);
  }

  .number {
    display: grid;
    flex: none;
    place-items: center;
    min-width: 26px;
    height: 26px;
    padding: 0 var(--space-1);
    margin-top: 1px;
    border-radius: var(--radius-pill);
    background: var(--surface-2);
    color: var(--text-2);
    font-size: var(--text-xs);
    font-weight: 800;
  }

  .titles {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
  }

  .name {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    align-self: flex-start;
    color: var(--text);
    font-size: var(--text-lg);
    font-weight: 750;
    line-height: 1.25;
    text-decoration: none;
  }

  a.name :global(.icon) {
    color: var(--text-3);
  }

  .missing {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    color: var(--warning-text);
    font-size: var(--text-xs);
    font-weight: 700;
  }

  .target {
    color: var(--text-2);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  .notes {
    color: var(--text-3);
    font-size: var(--text-sm);
    font-style: italic;
  }

  .last-time {
    display: flex;
    align-items: flex-start;
    gap: var(--space-2);
    margin: var(--space-1) var(--space-2) 0;
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--surface-2);
    color: var(--text-2);
    font-size: var(--text-sm);
    font-variant-numeric: tabular-nums;
  }

  .last-time :global(.icon) {
    margin-top: 2px;
    color: var(--text-3);
  }

  .last-label {
    color: var(--text);
    font-weight: 700;
  }

  .columns {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) minmax(0, 1fr) var(--tap) var(--tap);
    gap: 6px;
    margin-top: var(--space-2);
    padding: 0 var(--space-2) 0 var(--space-3);
    color: var(--text-3);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-align: center;
    text-transform: uppercase;
  }

  .sets {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }

  .add-set {
    align-self: flex-start;
    margin-left: var(--space-1);
  }

  .superset-head {
    padding: 0 var(--space-2);
  }

  .members {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    margin: var(--space-1) 0 0;
    padding: 0;
    list-style: none;
  }

  .member {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }

  .superset .number {
    background: var(--accent-soft);
    color: var(--accent-text);
  }

  .round-title {
    margin: var(--space-2) var(--space-2) var(--space-1) var(--space-3);
    color: var(--text-3);
    font-size: var(--text-xs);
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .finish {
    align-items: center;
    justify-content: center;
    padding: var(--space-6) calc(var(--page-gutter) + var(--safe-right))
      calc(var(--space-6) + var(--safe-bottom)) calc(var(--page-gutter) + var(--safe-left));
  }

  .finish-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    max-width: 420px;
    text-align: center;
  }

  .finish-mark {
    display: grid;
    place-items: center;
    width: 72px;
    height: 72px;
    border-radius: 50%;
    background: var(--accent-soft);
    color: var(--accent-text);
  }

  .finish-title {
    font-size: var(--text-xl);
    font-weight: 750;
  }

  .finish-sets {
    margin-bottom: var(--space-3);
    color: var(--text-2);
  }

  .finish-sets strong {
    color: var(--text);
    font-variant-numeric: tabular-nums;
  }
</style>
