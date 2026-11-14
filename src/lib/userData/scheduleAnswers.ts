/**
 * The schedule creator's saved answers (see `plans.ts` for the conventions).
 */
import { EQUIPMENT_CHOICES } from '../schedulePrompt.ts';
import type { Equipment } from '../schema/common.ts';
import type { Exercise } from '../schema/exercise.ts';
import type { PickedExercise, Plan, ScheduleAnswers, UserData } from '../schema/userData.ts';
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

/** The equipment choices a plan's catalog exercises use, in catalog order. */
export function planEquipment(
  plan: Plan,
  exercise: (id: string) => Exercise | undefined,
): Equipment[] {
  const used = new Set(
    plan.days.flatMap((day) =>
      day.exercises.flatMap(({ exercise: ref }) =>
        ref.kind === 'catalog' ? (exercise(ref.exerciseId)?.equipment ?? []) : [],
      ),
    ),
  );
  return EQUIPMENT_CHOICES.filter((item) => used.has(item));
}

/**
 * The answers building on the plan `planId` (null: starting fresh). A plan
 * answers days per week (its day count) and equipment (what its exercises
 * use); each of those follows the pick while it still holds what the last
 * pick gave, nothing included. An answer the user changed is kept.
 */
export function withBasePlan(
  answers: ScheduleAnswers,
  plans: readonly Plan[],
  planId: string | null,
  exercise: (id: string) => Exercise | undefined,
): ScheduleAnswers {
  const given = (plan: Plan | undefined) => ({
    days: plan !== undefined && plan.days.length <= 7 ? String(plan.days.length) : '',
    equipment: plan === undefined ? [] : planEquipment(plan, exercise),
  });
  const before = given(planToBuildOn(plans, answers.basePlanId));
  const after = given(planToBuildOn(plans, planId));
  const untouched =
    answers.equipment.length === before.equipment.length &&
    answers.equipment.every((item) => before.equipment.includes(item));
  return {
    ...answers,
    basePlanId: planId,
    daysPerWeek: answers.daysPerWeek === before.days ? after.days : answers.daysPerWeek,
    equipment: untouched ? after.equipment : answers.equipment,
  };
}

export function setScheduleAnswers(data: UserData, answers: ScheduleAnswers): UserData {
  const current = data.scheduleAnswers ?? emptyScheduleAnswers();
  return JSON.stringify(current) === JSON.stringify(answers)
    ? data
    : { ...data, scheduleAnswers: answers };
}
