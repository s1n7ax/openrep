/**
 * The schedule creator's form state: a copy of the saved answers that the
 * form edits (the screen saves it back as it changes), the weight fields as
 * typed, and which required answers are missing. Also the step the creator
 * shows, kept while the exercise picker is open on top of it.
 */
import { REQUIRED_ANSWERS } from './schedulePrompt.ts';
import type { ScheduleAnswers, Unit, UserData } from './schema/userData.ts';
import { readScheduleAnswers } from './userData/scheduleAnswers.ts';
import { formatWeight, parseWeight } from './units.ts';

export type WeightKey = 'bodyWeightKg' | 'targetWeightKg';
export type RequiredAnswer = (typeof REQUIRED_ANSWERS)[number];

export class CreatorForm {
  answers: ScheduleAnswers = $state() as ScheduleAnswers;
  /** The weight fields as typed, in the unit of the settings. */
  weights: Record<WeightKey, string> = $state() as Record<WeightKey, string>;
  readonly #unit: () => Unit;

  constructor(data: UserData, unit: () => Unit) {
    const saved = readScheduleAnswers(data);
    const text = (kg: number | null) => (kg === null ? '' : formatWeight(kg, unit()));
    this.#unit = unit;
    this.answers = saved;
    this.weights = {
      bodyWeightKg: text(saved.bodyWeightKg),
      targetWeightKg: text(saved.targetWeightKg),
    };
  }

  /** Required answers left blank, in form order. */
  get missing(): readonly RequiredAnswer[] {
    return REQUIRED_ANSWERS.filter((key) => this.answers[key].trim() === '');
  }

  weightInvalid(key: WeightKey): boolean {
    return !parseWeight(this.weights[key], this.#unit()).ok;
  }

  setWeight(key: WeightKey, text: string): void {
    this.weights[key] = text;
    const parsed = parseWeight(text, this.#unit());
    if (parsed.ok) this.answers[key] = parsed.kg;
  }
}

/** The step the creator shows. */
export const creatorSteps = $state({ step: 0 });
