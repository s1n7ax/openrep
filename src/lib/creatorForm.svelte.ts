/**
 * The schedule creator's form state: a copy of the saved answers that the
 * form edits (the screen saves it back as it changes) and the weight fields
 * as typed. Also the step the creator shows and the steps it came through,
 * kept while the exercise picker is open on top of it.
 */
import type { ScheduleAnswers, Unit, UserData } from './schema/userData.ts';
import { readScheduleAnswers } from './userData/scheduleAnswers.ts';
import { formatWeight, parseWeight } from './units.ts';

export type WeightKey = 'bodyWeightKg' | 'targetWeightKg';

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

  weightInvalid(key: WeightKey): boolean {
    return !parseWeight(this.weights[key], this.#unit()).ok;
  }

  setWeight(key: WeightKey, text: string): void {
    this.weights[key] = text;
    const parsed = parseWeight(text, this.#unit());
    if (parsed.ok) this.answers[key] = parsed.kg;
  }
}

/**
 * The step the creator shows, and the steps it went forward from in this
 * visit, newest last: Android's back button returns to them.
 */
export const creatorSteps = $state<{ step: number; visited: number[] }>({ step: 0, visited: [] });
