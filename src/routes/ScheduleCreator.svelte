<!--
  The schedule creator (`#/schedule-creator`), step by step: one question per
  screen, everything picked by tapping — the plan to build on, popular
  answers as chips ("Your own" types anything else), pictures of equipment,
  the body for muscles and injuries, exercises by photo — then a review of
  every answer and "Create prompt". Answers are saved as they change, so the
  creator reopens filled in, at the review once nothing required is missing.
-->
<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import BodyMap from '../components/BodyMap.svelte';
  import ChoiceChips from '../components/ChoiceChips.svelte';
  import EquipmentPicker from '../components/EquipmentPicker.svelte';
  import Icon from '../components/Icon.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import PickedExercises from '../components/PickedExercises.svelte';
  import PlanPicker from '../components/PlanPicker.svelte';
  import { CreatorForm, creatorSteps, type WeightKey } from '../lib/creatorForm.svelte.ts';
  import { equipmentLabel, muscleLabel } from '../lib/labels.ts';
  import { paths, router } from '../lib/router.ts';
  import {
    COMMON_INJURIES,
    DAYS_PER_WEEK,
    EXPERIENCE,
    injuryLabel,
    POPULAR_GOALS,
    POPULAR_PLAN_CHANGES,
    POPULAR_SPORTS,
    POPULAR_WEEK_LAYOUTS,
    SESSION_MINUTES,
    SEXES,
    SPLITS,
    STRENGTH_LEVELS,
    SUPERSETS,
  } from '../lib/scheduleChoices.ts';
  import type { Muscle } from '../lib/schema/common.ts';
  import { userData } from '../lib/stores/userData.svelte.ts';
  import { setScheduleAnswers } from '../lib/userData/scheduleAnswers.ts';
  import { planToBuildOn } from '../lib/userData/selectors.ts';
  import { formatWeightWithUnit } from '../lib/units.ts';

  const STEPS = [
    { key: 'start', title: 'Start from' },
    { key: 'goal', title: 'What do you want most?' },
    { key: 'week', title: 'How does your week look?' },
    { key: 'equipment', title: 'What can you use?' },
    { key: 'muscles', title: 'Any muscles to grow most?' },
    { key: 'injuries', title: 'Anything that hurts?' },
    { key: 'exercises', title: 'Exercises you want, or not?' },
    { key: 'sports', title: 'Any other sports?' },
    { key: 'you', title: 'A bit about you' },
    { key: 'review', title: 'Looks right?' },
  ] as const;
  type StepKey = (typeof STEPS)[number]['key'];
  const REVIEW = STEPS.length - 1;

  type SingleAnswer =
    'sessionMinutes' | 'split' | 'weekLayout' | 'experience' | 'strengthLevel' | 'sex';
  type TextAnswer = 'injuries' | 'otherSports' | 'age' | 'height';

  const unit = $derived(userData.data.settings.unit);
  const form = new CreatorForm(userData.data, () => userData.data.settings.unit);
  const answers = $derived(form.answers);
  const step = $derived(STEPS[creatorSteps.step] ?? STEPS[0]);

  /** Next was tapped on this step with a required answer missing. */
  let tried = $state(false);
  let heading: HTMLHeadingElement | undefined = $state();

  const commonInjuryKeys = Object.keys(COMMON_INJURIES);
  const commonInjuryLabels: string[] = Object.values(COMMON_INJURIES);
  const supersetLabels: string[] = Object.values(SUPERSETS);

  onMount(() => {
    // Coming back from the exercise picker or the prompt keeps the step;
    // opening the creator starts over, or at the review when it is complete.
    if (router.state.direction !== 'pop') {
      creatorSteps.step = STEPS.some(({ key }) => incomplete(key)) ? 0 : REVIEW;
      creatorSteps.visited = [];
    }
  });

  $effect(() => {
    const next = $state.snapshot(form.answers);
    untrack(() => userData.update((data) => setScheduleAnswers(data, next)));
  });

  // Android's back button returns to the steps this visit came through
  // before it leaves the creator.
  $effect(() => {
    if (creatorSteps.visited.length === 0) return;
    return router.pushBackHandler(() => {
      const previous = creatorSteps.visited.at(-1) ?? 0;
      creatorSteps.visited = creatorSteps.visited.slice(0, -1);
      void show(previous);
    });
  });

  /** Whether a step still lacks an answer it needs. */
  function incomplete(key: StepKey): boolean {
    switch (key) {
      case 'goal':
        return answers.goal.trim() === '';
      case 'week':
        return answers.daysPerWeek === '' || answers.sessionMinutes === '';
      case 'you':
        return (
          answers.experience === '' ||
          form.weightInvalid('bodyWeightKg') ||
          form.weightInvalid('targetWeightKg')
        );
      default:
        return false;
    }
  }

  /** Whether an optional step has anything picked or typed (Next rather than Skip). */
  function answered(key: StepKey): boolean {
    switch (key) {
      case 'equipment':
        return answers.equipment.length + answers.extraEquipment.length > 0;
      case 'muscles':
        return answers.priorityMuscles.length > 0;
      case 'injuries':
        return answers.injuryPicks.length > 0 || answers.injuries.trim() !== '';
      case 'exercises':
        return answers.includeList.length + answers.avoidList.length > 0;
      case 'sports':
        return answers.sports.length > 0 || answers.otherSports.trim() !== '';
      default:
        return true;
    }
  }

  /** Goes to step `index`, remembering this one for Android's back button. */
  async function go(index: number) {
    creatorSteps.visited = [...creatorSteps.visited, creatorSteps.step];
    await show(index);
  }

  /** The question before this one; undoes the last step forward when it came from there. */
  async function previous() {
    const target = creatorSteps.step - 1;
    if (creatorSteps.visited.at(-1) === target) {
      creatorSteps.visited = creatorSteps.visited.slice(0, -1);
    }
    await show(target);
  }

  async function show(index: number) {
    tried = false;
    creatorSteps.step = Math.max(0, Math.min(REVIEW, index));
    window.scrollTo({ top: 0 });
    await tick();
    heading?.focus();
  }

  async function next() {
    if (incomplete(step.key)) {
      tried = true;
      return;
    }
    if (step.key !== 'review') {
      await go(creatorSteps.step + 1);
      return;
    }
    const firstIncomplete = STEPS.findIndex(({ key }) => incomplete(key));
    if (firstIncomplete === -1) {
      router.navigate(paths.scheduleCreatorPrompt());
      return;
    }
    await go(firstIncomplete);
    tried = true;
  }

  function toggle<T>(list: readonly T[], item: T): T[] {
    return list.includes(item) ? list.filter((x) => x !== item) : [...list, item];
  }

  /** A single answer as the chip list's selection. */
  function single(value: string): string[] {
    return value === '' ? [] : [value];
  }

  function pickPlan(planId: string | null) {
    form.answers.basePlanId = planId;
    const plan = userData.data.plans.find((candidate) => candidate.id === planId);
    // The plan's day count is a good first answer to how many days a week.
    if (plan && answers.daysPerWeek === '' && plan.days.length >= 1 && plan.days.length <= 7) {
      form.answers.daysPerWeek = String(plan.days.length);
    }
  }

  const commonInjuriesPicked = $derived(
    answers.injuryPicks.filter((key) => key in COMMON_INJURIES).map(injuryLabel),
  );

  function setCommonInjuries(labels: string[]) {
    form.answers.injuryPicks = [
      ...answers.injuryPicks.filter((key) => !(key in COMMON_INJURIES)),
      ...labels.flatMap((label) => commonInjuryKeys[commonInjuryLabels.indexOf(label)] ?? []),
    ];
  }

  function removeExercise(key: 'includeList' | 'avoidList', index: number) {
    form.answers[key] = answers[key].filter((_, i) => i !== index);
  }

  const basePlan = $derived(planToBuildOn(userData.data.plans, answers.basePlanId));

  function supersetsLabel(value: string): string {
    return value === 'Yes' || value === 'No' ? SUPERSETS[value] : '';
  }

  /** The review: what each step answered, `''` for nothing. */
  const review = $derived<{ step: StepKey; label: string; value: string }[]>([
    {
      step: 'start',
      label: 'Start from',
      value: basePlan
        ? [basePlan.name.trim() || 'Untitled plan', ...answers.planChanges].join(' · ')
        : 'Start fresh',
    },
    { step: 'goal', label: 'Goal', value: answers.goal },
    {
      step: 'week',
      label: 'Week',
      value: [
        answers.daysPerWeek &&
          `${answers.daysPerWeek} ${answers.daysPerWeek === '1' ? 'day' : 'days'}`,
        answers.sessionMinutes && `${answers.sessionMinutes} min`,
        answers.weekLayout,
        answers.split,
        supersetsLabel(answers.supersets),
      ]
        .filter(Boolean)
        .join(' · '),
    },
    {
      step: 'equipment',
      label: 'Equipment',
      value: [
        'Bodyweight',
        ...answers.equipment.map(equipmentLabel),
        ...answers.extraEquipment,
      ].join(', '),
    },
    {
      step: 'muscles',
      label: 'Muscles to grow',
      value: answers.priorityMuscles.map(muscleLabel).join(', '),
    },
    {
      step: 'injuries',
      label: 'Injuries',
      value: [...answers.injuryPicks.map(injuryLabel), answers.injuries.trim()]
        .filter(Boolean)
        .join(', '),
    },
    {
      step: 'exercises',
      label: 'Exercises',
      value: [
        answers.includeList.length > 0 &&
          `Want: ${answers.includeList.map((item) => item.name).join(', ')}`,
        answers.avoidList.length > 0 &&
          `Avoid: ${answers.avoidList.map((item) => item.name).join(', ')}`,
      ]
        .filter(Boolean)
        .join(' · '),
    },
    {
      step: 'sports',
      label: 'Other sports',
      value: [...answers.sports, answers.otherSports.trim()].filter(Boolean).join(', '),
    },
    {
      step: 'you',
      label: 'About you',
      value: [
        answers.experience,
        answers.strengthLevel,
        answers.bodyWeightKg === null ? '' : formatWeightWithUnit(answers.bodyWeightKg, unit),
        answers.targetWeightKg === null
          ? ''
          : `target ${formatWeightWithUnit(answers.targetWeightKg, unit)}`,
        answers.age.trim() && `${answers.age.trim()} years`,
        answers.height.trim(),
        answers.sex,
      ]
        .filter(Boolean)
        .join(' · '),
    },
  ]);

  function stepIndex(key: StepKey): number {
    return STEPS.findIndex((candidate) => candidate.key === key);
  }
</script>

{#snippet chips(
  key: SingleAnswer,
  label: string,
  options: readonly string[],
  testidPrefix: string,
  own: boolean,
  required = false,
)}
  <ChoiceChips
    {label}
    {options}
    selected={single(answers[key])}
    onchange={(next) => (form.answers[key] = next[0] ?? '')}
    single
    {own}
    invalid={required && tried && answers[key] === ''}
    {testidPrefix}
  />
{/snippet}

{#snippet weight(key: WeightKey, label: string)}
  <div class="field">
    <label class="field-label" for={`creator-${key}`}>{label} ({unit})</label>
    <input
      id={`creator-${key}`}
      class="input"
      type="text"
      inputmode="decimal"
      autocomplete="off"
      enterkeyhint="done"
      aria-invalid={form.weightInvalid(key)}
      data-testid={`creator-${key}`}
      value={form.weights[key]}
      oninput={(event) => form.setWeight(key, event.currentTarget.value)}
    />
    {#if form.weightInvalid(key)}
      <p class="field-error" data-testid={`creator-${key}-error`}>Enter a number, like 62.5.</p>
    {/if}
  </div>
{/snippet}

{#snippet text(
  key: TextAnswer,
  label: string,
  placeholder: string,
  numeric = false,
  maxlength = 200,
)}
  <div class="field">
    <label class="field-label" for={`creator-${key}`}>{label}</label>
    <input
      id={`creator-${key}`}
      class="input"
      type="text"
      inputmode={numeric ? 'numeric' : 'text'}
      autocomplete="off"
      enterkeyhint="done"
      {maxlength}
      {placeholder}
      data-testid={`creator-${key}`}
      bind:value={form.answers[key]}
    />
  </div>
{/snippet}

<PageHeader
  title="Create a schedule"
  subtitle={`Step ${creatorSteps.step + 1} of ${STEPS.length}`}
  back={paths.schedules()}
/>

<div class="progress" aria-hidden="true">
  <div class="bar" style:width={`${((creatorSteps.step + 1) / STEPS.length) * 100}%`}></div>
</div>

<div class="page">
  <h1 class="question" tabindex="-1" bind:this={heading} data-testid="creator-step-title">
    {step.title}
  </h1>

  <div class="step" data-testid="creator-step" data-step={step.key}>
    {#if step.key === 'start'}
      <p class="lead">
        Build on a plan you train with, or start fresh. Your answers stay on this device; only the
        prompt you copy goes to your AI assistant.
      </p>
      <PlanPicker plans={userData.data.plans} selected={answers.basePlanId} onchange={pickPlan} />
      {#if basePlan}
        <ChoiceChips
          label="What should change?"
          options={POPULAR_PLAN_CHANGES}
          selected={answers.planChanges}
          onchange={(next) => (form.answers.planChanges = next)}
          placeholder="Harder leg days…"
          testidPrefix="creator-change"
        />
      {/if}
    {:else if step.key === 'goal'}
      <div class="goals" role="radiogroup" aria-label="Main goal">
        {#each POPULAR_GOALS as goal (goal)}
          <button
            type="button"
            class="goal"
            role="radio"
            aria-checked={answers.goal === goal}
            data-testid={`creator-goal-${goal.toLowerCase().replace(/\s+/g, '-')}`}
            onclick={() => (form.answers.goal = answers.goal === goal ? '' : goal)}
          >
            {goal}
          </button>
        {/each}
      </div>
      <ChoiceChips
        label="Something else?"
        options={[]}
        selected={(POPULAR_GOALS as readonly string[]).includes(answers.goal)
          ? []
          : single(answers.goal)}
        onchange={(next) => (form.answers.goal = next[0] ?? '')}
        single
        placeholder="Run a marathon…"
        testidPrefix="creator-goal"
      />
      {#if tried && incomplete('goal')}
        <p class="field-error" role="alert" data-testid="creator-goal-error">
          Pick a goal, or type your own.
        </p>
      {/if}
    {:else if step.key === 'week'}
      <div class="field" data-invalid={tried && answers.daysPerWeek === ''}>
        <p class="field-label" id="creator-days-label">Training days a week</p>
        <div class="days" role="radiogroup" aria-labelledby="creator-days-label">
          {#each DAYS_PER_WEEK as days (days)}
            <button
              type="button"
              class="day"
              role="radio"
              aria-checked={answers.daysPerWeek === days}
              data-testid={`creator-days-${days}`}
              onclick={() => (form.answers.daysPerWeek = days)}>{days}</button
            >
          {/each}
        </div>
      </div>
      {@render chips(
        'sessionMinutes',
        'Minutes each',
        SESSION_MINUTES,
        'creator-minutes',
        false,
        true,
      )}
      {#if tried && incomplete('week')}
        <p class="field-error" role="alert" data-testid="creator-week-error">
          Pick the days and the minutes.
        </p>
      {/if}
      {@render chips(
        'weekLayout',
        'Week layout (optional)',
        POPULAR_WEEK_LAYOUTS,
        'creator-layout',
        true,
      )}
      {@render chips('split', 'Split (optional)', SPLITS, 'creator-split', true)}
      <ChoiceChips
        label="Supersets (optional)"
        options={supersetLabels}
        selected={single(supersetsLabel(answers.supersets))}
        onchange={(next) =>
          (form.answers.supersets =
            next[0] === SUPERSETS.Yes ? 'Yes' : next[0] === SUPERSETS.No ? 'No' : '')}
        single
        own={false}
        testidPrefix="creator-supersets"
      />
    {:else if step.key === 'equipment'}
      <p class="lead">Tap everything you can use. Bodyweight exercises are always in.</p>
      <EquipmentPicker
        equipment={answers.equipment}
        extra={answers.extraEquipment}
        onchange={(equipment, extra) => {
          form.answers.equipment = equipment;
          form.answers.extraEquipment = extra;
        }}
      />
    {:else if step.key === 'muscles'}
      <p class="lead">Tap them on the body. Nothing picked means a balanced plan.</p>
      <BodyMap
        mode="muscles"
        selected={answers.priorityMuscles}
        ontoggle={(muscle) =>
          (form.answers.priorityMuscles = toggle(answers.priorityMuscles, muscle as Muscle))}
        testidPrefix="creator-priority"
      />
      <p class="picked" aria-live="polite" data-testid="creator-priority-picked">
        {answers.priorityMuscles.map(muscleLabel).join(' · ')}
      </p>
    {:else if step.key === 'injuries'}
      <p class="lead">Tap a dot where it hurts, and your assistant works around it.</p>
      <BodyMap
        mode="injuries"
        selected={answers.injuryPicks}
        ontoggle={(area) => (form.answers.injuryPicks = toggle(answers.injuryPicks, area))}
        testidPrefix="creator-injury"
      />
      <p class="picked" aria-live="polite" data-testid="creator-injury-picked">
        {answers.injuryPicks
          .filter((key) => !(key in COMMON_INJURIES))
          .map(injuryLabel)
          .join(' · ')}
      </p>
      <ChoiceChips
        label="Know what it is?"
        options={commonInjuryLabels}
        selected={commonInjuriesPicked}
        onchange={setCommonInjuries}
        own={false}
        testidPrefix="creator-common-injury"
      />
      {@render text('injuries', 'In your own words', 'Hurts when I press overhead…')}
    {:else if step.key === 'exercises'}
      <p class="lead">Find them by photo, or type a name.</p>
      <PickedExercises
        label="Want in the plan"
        list="include"
        items={answers.includeList}
        onremove={(index) => removeExercise('includeList', index)}
      />
      <PickedExercises
        label="Keep out of the plan"
        list="avoid"
        items={answers.avoidList}
        onremove={(index) => removeExercise('avoidList', index)}
      />
    {:else if step.key === 'sports'}
      <p class="lead">So the plan fits around them.</p>
      <ChoiceChips
        label="You also do"
        options={POPULAR_SPORTS}
        selected={answers.sports}
        onchange={(next) => (form.answers.sports = next)}
        placeholder="Padel, kayaking…"
        testidPrefix="creator-sport"
      />
      {#if answers.sports.length > 0 || answers.otherSports.trim() !== ''}
        {@render text('otherSports', 'When and how much?', 'Volleyball straight after the gym…')}
      {/if}
    {:else if step.key === 'you'}
      {@render chips(
        'experience',
        'Training experience',
        EXPERIENCE,
        'creator-experience',
        false,
        true,
      )}
      {#if tried && answers.experience === ''}
        <p class="field-error" role="alert" data-testid="creator-experience-error">
          Pick how long you have been training.
        </p>
      {/if}
      <div class="row">
        {@render weight('bodyWeightKg', 'Body weight')}
        {@render weight('targetWeightKg', 'Target weight')}
      </div>
      <div class="row">
        {@render text('age', 'Age', '', true, 3)}
        {@render text('height', 'Height', unit === 'kg' ? '178 cm' : '5 ft 10 in', false, 40)}
      </div>
      {@render chips(
        'strengthLevel',
        'Strength level (optional)',
        STRENGTH_LEVELS,
        'creator-strength',
        false,
      )}
      {@render chips('sex', 'Sex (optional)', SEXES, 'creator-sex', false)}
    {:else}
      <ul class="review" data-testid="creator-review">
        {#each review as line (line.step)}
          <li>
            <button
              type="button"
              class="review-row"
              data-testid={`creator-review-${line.step}`}
              onclick={() => go(stepIndex(line.step))}
            >
              <span class="review-text">
                <span class="review-label">{line.label}</span>
                <span class="review-value" class:empty={line.value === ''}
                  >{line.value || 'Nothing picked'}</span
                >
              </span>
              <span class="review-edit" aria-hidden="true"><Icon name="edit" size={18} /></span>
            </button>
          </li>
        {/each}
      </ul>
      <div class="field">
        <label class="field-label" for="creator-notes">Anything else?</label>
        <textarea
          id="creator-notes"
          class="input"
          rows="2"
          placeholder="Anything your assistant should know…"
          data-testid="creator-notes"
          bind:value={form.answers.notes}></textarea>
      </div>
    {/if}
  </div>

  <div class="nav">
    {#if creatorSteps.step > 0}
      <button
        type="button"
        class="btn btn-outline btn-lg previous"
        aria-label="Previous question"
        data-testid="creator-previous"
        onclick={previous}
      >
        <Icon name="back" size={22} />
      </button>
    {/if}
    {#if step.key === 'review'}
      <button
        type="button"
        class="btn btn-primary btn-lg grow"
        data-testid="creator-create"
        onclick={next}
      >
        Create prompt
      </button>
    {:else}
      <button
        type="button"
        class="btn btn-lg grow"
        class:btn-primary={answered(step.key)}
        class:skip={!answered(step.key)}
        data-testid="creator-next"
        onclick={next}
      >
        {answered(step.key) ? 'Next' : 'Skip'}
      </button>
    {/if}
  </div>
</div>

<style>
  .progress {
    position: sticky;
    top: var(--header-offset, var(--header-height));
    z-index: 2;
    height: 4px;
    background: var(--surface-2);
  }

  .bar {
    height: 100%;
    border-radius: 0 var(--radius-pill) var(--radius-pill) 0;
    background: var(--accent);
    transition: width 240ms ease;
  }

  @media (prefers-reduced-motion: reduce) {
    .bar {
      transition: none;
    }
  }

  .page {
    display: flex;
    flex-direction: column;
    gap: var(--space-5);
    min-height: calc(100dvh - var(--header-height) - var(--tabbar-height) - var(--safe-top));
  }

  .question {
    margin-top: var(--space-2);
    font-size: var(--text-2xl);
    font-weight: 800;
    line-height: 1.15;
  }

  .question:focus {
    outline: none;
  }

  .step {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: var(--space-5);
  }

  .lead {
    margin-top: calc(-1 * var(--space-3));
    color: var(--text-2);
  }

  .goals {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }

  .goal {
    min-height: 84px;
    padding: var(--space-3) var(--space-4);
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    box-shadow: var(--shadow-sm);
    color: var(--text);
    font-size: var(--text-lg);
    font-weight: 700;
    line-height: 1.2;
    text-align: left;
    cursor: pointer;
    transition: transform 80ms ease;
  }

  .goal:active {
    transform: scale(0.98);
  }

  .goal[aria-checked='true'] {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--on-accent);
  }

  .days {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: var(--space-2);
    margin-top: var(--space-2);
  }

  .day {
    aspect-ratio: 1;
    min-width: 0;
    padding: 0;
    border: 1px solid var(--border-strong);
    border-radius: 50%;
    background: var(--surface);
    color: var(--text-2);
    font-size: var(--text-lg);
    font-weight: 750;
    cursor: pointer;
  }

  .field[data-invalid='true'] .day:not([aria-checked='true']) {
    border-color: var(--danger);
  }

  .day[aria-checked='true'] {
    border-color: var(--accent);
    background: var(--accent);
    color: var(--on-accent);
  }

  .picked {
    min-height: 1.45em;
    margin-top: calc(-1 * var(--space-3));
    color: var(--text-2);
    font-weight: 650;
    text-align: center;
  }

  .row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: var(--space-3);
  }

  .review {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    overflow: hidden;
    border: 1px solid var(--border);
    border-radius: var(--radius-lg);
    background: var(--surface);
    list-style: none;
  }

  .review li + li {
    border-top: 1px solid var(--border);
  }

  .review-row {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    width: 100%;
    min-height: var(--tap-lg);
    padding: var(--space-3) var(--space-4);
    border: none;
    background: transparent;
    color: inherit;
    text-align: left;
    cursor: pointer;
  }

  .review-row:active {
    background: var(--surface-2);
  }

  .review-text {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  .review-label {
    color: var(--text-3);
    font-size: var(--text-xs);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .review-value {
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .review-value.empty {
    color: var(--text-3);
    font-weight: 500;
  }

  .review-edit {
    color: var(--text-3);
  }

  .nav {
    position: sticky;
    bottom: calc(var(--tabbar-height) + var(--safe-bottom) + var(--space-3));
    z-index: 1;
    display: flex;
    gap: var(--space-2);
  }

  .nav .btn {
    box-shadow: var(--shadow-md);
  }

  .previous {
    width: var(--tap-lg);
    padding: 0;
    background: var(--surface);
  }

  .skip {
    border-color: var(--border-strong);
    background: var(--surface);
  }

  .grow {
    flex: 1;
  }
</style>
