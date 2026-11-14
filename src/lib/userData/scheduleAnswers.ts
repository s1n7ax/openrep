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
    filledByPlan: [],
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
 * use). Such an answer follows each pick while it is unanswered or the last
 * pick filled it in; one the user gave or changed is kept.
 */
export function withBasePlan(
  answers: ScheduleAnswers,
  plans: readonly Plan[],
  planId: string | null,
  exercise: (id: string) => Exercise | undefined,
): ScheduleAnswers {
  const plan = planToBuildOn(plans, planId);
  const days = plan !== undefined && plan.days.length <= 7 ? String(plan.days.length) : '';
  const equipment = plan === undefined ? [] : planEquipment(plan, exercise);
  const followsDays = answers.daysPerWeek === '' || answers.filledByPlan.includes('daysPerWeek');
  const followsEquipment =
    answers.equipment.length === 0 || answers.filledByPlan.includes('equipment');
  return {
    ...answers,
    basePlanId: planId,
    daysPerWeek: followsDays ? days : answers.daysPerWeek,
    equipment: followsEquipment ? equipment : answers.equipment,
    filledByPlan: [
      ...(followsDays && days !== '' ? (['daysPerWeek'] as const) : []),
      ...(followsEquipment && equipment.length > 0 ? (['equipment'] as const) : []),
    ],
  };
}

/** The answers with `key` given by the user, so no longer the plan's. */
export function answeredByUser(
  answers: ScheduleAnswers,
  key: ScheduleAnswers['filledByPlan'][number],
): ScheduleAnswers['filledByPlan'] {
  return answers.filledByPlan.filter((item) => item !== key);
}

export function setScheduleAnswers(data: UserData, answers: ScheduleAnswers): UserData {
  const current = data.scheduleAnswers ?? emptyScheduleAnswers();
  return JSON.stringify(current) === JSON.stringify(answers)
    ? data
    : { ...data, scheduleAnswers: answers };
}
