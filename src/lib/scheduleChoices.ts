/**
 * The schedule creator's ready-made answers: popular picks shown as one tap,
 * so nobody has to remember what things are called. Typed answers sit next
 * to them in the same lists.
 */
import type { Equipment } from './schema/common.ts';

// What is picked is what the prompt says, so these are written for both.

export const DAYS_PER_WEEK = ['1', '2', '3', '4', '5', '6', '7'] as const;
export const SESSION_MINUTES = ['30', '45', '60', '75', '90', '120'] as const;
export const SPLITS = ['Full body', 'Upper/lower', 'Push/pull/legs', 'Body-part split'] as const;
/** Saved as `Yes` / `No`; shown with these labels. */
export const SUPERSETS = { Yes: 'Use them', No: 'No supersets' } as const;
export const EXPERIENCE = ['New to lifting', 'Under 1 year', '1–3 years', '3+ years'] as const;
export const STRENGTH_LEVELS = ['Novice', 'Intermediate', 'Advanced'] as const;
export const SEXES = ['Female', 'Male'] as const;

/** Popular week layouts; the user can type their own. */
export const POPULAR_WEEK_LAYOUTS = [
  'Weekdays only',
  'Weekends free',
  'Every other day',
  '2 days on, 1 off',
] as const;

/** Popular goals; the user can type their own. */
export const POPULAR_GOALS = [
  'Build muscle',
  'Get stronger',
  'Lose fat',
  'General fitness',
  'Sport performance',
  'Move better',
] as const;

/** Popular sports and activities next to the gym. */
export const POPULAR_SPORTS = [
  'Running',
  'Cycling',
  'Swimming',
  'Football',
  'Basketball',
  'Volleyball',
  'Tennis',
  'Badminton',
  'Climbing',
  'Hiking',
  'Boxing',
  'Martial arts',
  'Yoga',
  'Dance',
  'Rugby',
  'Cricket',
  'Golf',
  'Skiing',
] as const;

/** Equipment the catalog has no category for, that gyms and homes often have. */
export const POPULAR_EXTRA_EQUIPMENT = [
  'Bench',
  'Pull-up bar',
  'Dip station',
  'Squat rack',
  'Rowing machine',
  'Treadmill',
  'Exercise bike',
  'Rings or TRX',
  'Jump rope',
  'Sled',
] as const;

/** One tap for a usual setup: the equipment and the extras it brings. */
export interface EquipmentPreset {
  name: string;
  equipment: readonly Equipment[];
  extra: readonly string[];
}

export const EQUIPMENT_PRESETS: readonly EquipmentPreset[] = [
  {
    name: 'Full gym',
    equipment: ['barbell', 'cable', 'dumbbell', 'e-z curl bar', 'kettlebells', 'machine'],
    extra: ['Bench', 'Pull-up bar', 'Squat rack'],
  },
  { name: 'Home dumbbells', equipment: ['dumbbell'], extra: ['Bench'] },
  { name: 'Bands and a bar', equipment: ['bands'], extra: ['Pull-up bar'] },
  { name: 'Bodyweight only', equipment: [], extra: [] },
];

/** What to change in the plan the assistant builds on. */
export const POPULAR_PLAN_CHANGES = [
  'Progress the weights',
  'Swap in new exercises',
  'Make sessions shorter',
  'Add a training day',
  'Drop a training day',
  'More for my weak spots',
] as const;

/**
 * Injuries by where they are: the body figure's tappable spots. Sides are the
 * person's own (their left knee), as people say it.
 */
export const INJURY_AREAS = {
  neck: 'Neck',
  'left-shoulder': 'Left shoulder',
  'right-shoulder': 'Right shoulder',
  'left-elbow': 'Left elbow',
  'right-elbow': 'Right elbow',
  'left-wrist': 'Left wrist',
  'right-wrist': 'Right wrist',
  'upper-back': 'Upper back',
  'lower-back': 'Lower back',
  'left-hip': 'Left hip',
  'right-hip': 'Right hip',
  'left-knee': 'Left knee',
  'right-knee': 'Right knee',
  'left-ankle': 'Left ankle',
  'right-ankle': 'Right ankle',
} as const;
export type InjuryArea = keyof typeof INJURY_AREAS;

/** Common injuries by name, for those who know what they have. */
export const COMMON_INJURIES = {
  'tennis-elbow': 'Tennis elbow',
  'rotator-cuff': 'Rotator cuff',
  'herniated-disc': 'Herniated disc',
  sciatica: 'Sciatica',
  'runners-knee': "Runner's knee",
  'shin-splints': 'Shin splints',
  'plantar-fasciitis': 'Plantar fasciitis',
  'carpal-tunnel': 'Carpal tunnel',
} as const;

const INJURY_LABELS: Record<string, string> = { ...INJURY_AREAS, ...COMMON_INJURIES };

/** Display text of a picked injury key; unknown keys are shown as they are. */
export function injuryLabel(key: string): string {
  return INJURY_LABELS[key] ?? key;
}
