/**
 * The schedule creator's saved answers (see `plans.ts` for the conventions).
 */
import type { ScheduleAnswers, UserData } from '../schema/userData.ts';

/** The answers of a form nobody has filled in. */
export function emptyScheduleAnswers(): ScheduleAnswers {
  return {
    equipment: [],
    goal: '',
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
    priorityMuscles: [],
    otherSports: '',
    notes: '',
  };
}

export function setScheduleAnswers(data: UserData, answers: ScheduleAnswers): UserData {
  const current = data.scheduleAnswers ?? emptyScheduleAnswers();
  return JSON.stringify(current) === JSON.stringify(answers)
    ? data
    : { ...data, scheduleAnswers: answers };
}
