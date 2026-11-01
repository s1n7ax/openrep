<!--
  The schedule creator (`#/schedule-creator`): the equipment the user has and
  what an AI assistant needs to know about them. Answers are saved as they
  change, so the form reopens filled in. "Create prompt" opens the prompt.
-->
<script lang="ts">
  import { tick, untrack } from 'svelte';
  import MusclePicker from '../components/MusclePicker.svelte';
  import PageHeader from '../components/PageHeader.svelte';
  import { equipmentLabel } from '../lib/labels.ts';
  import { paths, router } from '../lib/router.ts';
  import {
    DAYS_PER_WEEK,
    EQUIPMENT_CHOICES,
    EXPERIENCE,
    GOALS,
    REQUIRED_ANSWERS,
    SESSION_MINUTES,
    SEXES,
    SPLITS,
    STRENGTH_LEVELS,
    SUPERSETS,
  } from '../lib/schedulePrompt.ts';
  import type { Equipment, Muscle } from '../lib/schema/common.ts';
  import type { ScheduleAnswers } from '../lib/schema/userData.ts';
  import { userData } from '../lib/stores/userData.svelte.ts';
  import { emptyScheduleAnswers, setScheduleAnswers } from '../lib/userData/scheduleAnswers.ts';
  import { formatWeight, parseWeight } from '../lib/units.ts';

  type WeightKey = 'bodyWeightKg' | 'targetWeightKg';
  type MenuKey =
    | 'goal'
    | 'daysPerWeek'
    | 'sessionMinutes'
    | 'split'
    | 'supersets'
    | 'experience'
    | 'strengthLevel'
    | 'sex';
  type TextKey =
    'injuries' | 'weekLayout' | 'avoidExercises' | 'includeExercises' | 'otherSports' | 'notes';

  const unit = $derived(userData.data.settings.unit);

  // The form edits a copy; the saved answers are read once when the screen opens.
  const saved = userData.data.scheduleAnswers ?? emptyScheduleAnswers();
  let answers = $state<ScheduleAnswers>({ ...saved });
  let weights = $state<Record<WeightKey, string>>({
    bodyWeightKg: weightText(saved.bodyWeightKg),
    targetWeightKg: weightText(saved.targetWeightKg),
  });
  let triedCreate = $state(false);
  let form: HTMLDivElement | undefined = $state();

  const missing = $derived<readonly string[]>(
    REQUIRED_ANSWERS.filter((key) => answers[key] === ''),
  );

  $effect(() => {
    const next = $state.snapshot(answers);
    untrack(() => userData.update((data) => setScheduleAnswers(data, next)));
  });

  function weightText(kg: number | null): string {
    return kg === null ? '' : formatWeight(kg, unit);
  }

  function weightInvalid(key: WeightKey): boolean {
    return !parseWeight(weights[key], unit).ok;
  }

  function setWeight(key: WeightKey, text: string) {
    weights[key] = text;
    const parsed = parseWeight(text, unit);
    if (parsed.ok) answers[key] = parsed.kg;
  }

  function toggleEquipment(equipment: Equipment) {
    answers.equipment = answers.equipment.includes(equipment)
      ? answers.equipment.filter((item) => item !== equipment)
      : [...answers.equipment, equipment];
  }

  function togglePriority(muscle: Muscle) {
    answers.priorityMuscles = answers.priorityMuscles.includes(muscle)
      ? answers.priorityMuscles.filter((item) => item !== muscle)
      : [...answers.priorityMuscles, muscle];
  }

  async function createPrompt() {
    triedCreate = true;
    if (missing.length > 0 || weightInvalid('bodyWeightKg') || weightInvalid('targetWeightKg')) {
      await tick();
      form?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
      return;
    }
    router.navigate(paths.scheduleCreatorPrompt());
  }
</script>

{#snippet menu(key: MenuKey, label: string, options: readonly string[], blank: string)}
  {@const invalid = triedCreate && missing.includes(key)}
  <div class="field">
    <label class="field-label" for={`creator-${key}`}>{label}</label>
    <select
      id={`creator-${key}`}
      class="input"
      aria-invalid={invalid}
      data-testid={`creator-${key}`}
      bind:value={answers[key]}
    >
      <option value="">{blank}</option>
      {#each options as option (option)}
        <option value={option}>{option}</option>
      {/each}
    </select>
    {#if invalid}
      <p class="field-error" data-testid={`creator-${key}-error`}>Choose one.</p>
    {/if}
  </div>
{/snippet}

{#snippet text(key: TextKey, label: string, placeholder: string)}
  <div class="field">
    <label class="field-label" for={`creator-${key}`}>{label}</label>
    <textarea
      id={`creator-${key}`}
      class="input"
      rows="2"
      {placeholder}
      data-testid={`creator-${key}`}
      bind:value={answers[key]}></textarea>
  </div>
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
      aria-invalid={weightInvalid(key)}
      data-testid={`creator-${key}`}
      value={weights[key]}
      oninput={(event) => setWeight(key, event.currentTarget.value)}
    />
    {#if weightInvalid(key)}
      <p class="field-error" data-testid={`creator-${key}-error`}>Enter a number, like 62.5.</p>
    {/if}
  </div>
{/snippet}

<PageHeader title="Create a schedule" back={paths.schedules()} />

<div class="page">
  <!-- Not a <form>: the Done key in a field must not create the prompt halfway through. -->
  <div bind:this={form} class="form">
    <p class="lead">
      Your answers stay on this device. Only the prompt you copy goes to your AI assistant.
    </p>

    <section class="section">
      <h2 class="section-title">Your equipment</h2>
      <div class="chips" role="group" aria-label="Equipment you have">
        {#each EQUIPMENT_CHOICES as equipment (equipment)}
          <button
            type="button"
            class="chip"
            aria-pressed={answers.equipment.includes(equipment)}
            data-testid={`creator-equipment-${equipment.replace(/\s+/g, '-')}`}
            onclick={() => toggleEquipment(equipment)}>{equipmentLabel(equipment)}</button
          >
        {/each}
      </div>
      <p class="field-hint">Bodyweight exercises are always included.</p>
    </section>

    <section class="section">
      <h2 class="section-title">Your goal</h2>
      {@render menu('goal', 'Main goal', GOALS, 'Choose a goal')}
      {@render text('injuries', 'Injuries', 'Sore right shoulder, bad knees…')}
    </section>

    <section class="section">
      <h2 class="section-title">Your week</h2>
      {@render menu('daysPerWeek', 'Days per week', DAYS_PER_WEEK, 'Choose')}
      {@render menu('sessionMinutes', 'Minutes per session', SESSION_MINUTES, 'Choose')}
      {@render text('weekLayout', 'Week layout', '2 days on, 1 off, 2 on…')}
      {@render menu('split', 'Split', SPLITS, 'Let the assistant choose')}
      {@render menu('supersets', 'Supersets OK?', SUPERSETS, 'Let the assistant choose')}
    </section>

    <section class="section">
      <h2 class="section-title">About you</h2>
      {@render menu('experience', 'Training experience', EXPERIENCE, 'Choose')}
      {@render menu('strengthLevel', 'Strength level', STRENGTH_LEVELS, 'Not sure')}
      {@render weight('bodyWeightKg', 'Body weight')}
      {@render weight('targetWeightKg', 'Target weight')}
      <div class="field">
        <label class="field-label" for="creator-age">Age</label>
        <input
          id="creator-age"
          class="input"
          type="text"
          inputmode="numeric"
          autocomplete="off"
          enterkeyhint="done"
          maxlength="3"
          data-testid="creator-age"
          bind:value={answers.age}
        />
      </div>
      {@render menu('sex', 'Sex', SEXES, 'Prefer not to say')}
      <div class="field">
        <label class="field-label" for="creator-height">Height</label>
        <input
          id="creator-height"
          class="input"
          type="text"
          autocomplete="off"
          enterkeyhint="done"
          maxlength="40"
          placeholder={unit === 'kg' ? '178 cm' : '5 ft 10 in'}
          data-testid="creator-height"
          bind:value={answers.height}
        />
      </div>
    </section>

    <section class="section">
      <h2 class="section-title">Preferences</h2>
      {@render text('avoidExercises', 'Exercises to avoid', 'Barbell curls, leg press…')}
      {@render text('includeExercises', 'Exercises to include', 'Deadlifts, pull-ups…')}
      <MusclePicker
        label="Muscles to prioritise"
        selected={answers.priorityMuscles}
        ontoggle={togglePriority}
        testidPrefix="creator-priority"
      />
      {@render text('otherSports', 'Other sports', 'Volleyball straight after the gym…')}
      {@render text('notes', 'Anything else', 'Anything your assistant should know…')}
    </section>

    <button
      type="button"
      class="btn btn-primary btn-lg btn-block"
      data-testid="creator-create"
      onclick={createPrompt}
    >
      Create prompt
    </button>
  </div>
</div>

<style>
  .form,
  .section {
    display: flex;
    flex-direction: column;
  }

  .form {
    gap: var(--space-6);
  }

  .section {
    gap: var(--space-4);
  }

  .lead {
    color: var(--text-2);
  }

  .chips {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-2);
  }
</style>
