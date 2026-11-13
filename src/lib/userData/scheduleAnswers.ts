/**
 * The schedule creator's saved answers (see `plans.ts` for the conventions).
 */
import type { PickedExercise, ScheduleAnswers, UserData } from '../schema/userData.ts';
import { planToBuildOn } from './selectors.ts';

/** The answers of a form nobody has filled in. */
export function emptyScheduleAnswers(): ScheduleAnswers {
  return {
    equipment: [],
    extraEquipment: [],
    basePlanId: null,
    planChanges: [],
    goal: '',
    injuryPicks: [],
    injuries: '',
    daysPerWeek: '',
    sessionMinutes: '',
    weekLayout: '',
    split: '',
    supersets: '',
    experience: '',
    strengthLevel: '',
    bodyWeightKg: null,
    targetWeightKg: null,
    age: '',
    sex: '',
    height: '',
    avoidExercises: '',
    includeExercises: '',
    avoidList: [],
    includeList: [],
    priorityMuscles: [],
    sports: [],
    otherSports: '',
    notes: '',
  };
}

/**
 * The saved answers, ready for the form: exercises typed into the first
 * version's text boxes become typed entries of the lists, and a plan to build
 * on that no longer exists, or has no day left, is dropped.
 */
export function readScheduleAnswers(data: UserData): ScheduleAnswers {
  const saved = data.scheduleAnswers ?? emptyScheduleAnswers();
  const typed = (text: string): PickedExercise[] =>
    text.trim() === '' ? [] : [{ name: text.trim() }];
  return {
    ...saved,
    includeExercises: '',
    avoidExercises: '',
    includeList: [...saved.includeList, ...typed(saved.includeExercises)],
    avoidList: [...saved.avoidList, ...typed(saved.avoidExercises)],
    basePlanId: planToBuildOn(data.plans, saved.basePlanId)?.id ?? null,
  };
}

export function setScheduleAnswers(data: UserData, answers: ScheduleAnswers): UserData {
  const current = data.scheduleAnswers ?? emptyScheduleAnswers();
  return JSON.stringify(current) === JSON.stringify(answers)
    ? data
    : { ...data, scheduleAnswers: answers };
}
