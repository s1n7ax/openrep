/**
 * Display text for catalog values ("e-z curl bar" → "EZ curl bar").
 */
import type { Equipment, Muscle } from './schema/common.ts';

function sentenceCase(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function muscleLabel(muscle: Muscle): string {
  return sentenceCase(muscle);
}

const EQUIPMENT_LABELS: Partial<Record<Equipment, string>> = {
  'body only': 'Bodyweight',
  'e-z curl bar': 'EZ curl bar',
  bands: 'Bands',
  kettlebells: 'Kettlebells',
};

export function equipmentLabel(equipment: Equipment): string {
  return EQUIPMENT_LABELS[equipment] ?? sentenceCase(equipment);
}

/** Any lowercase catalog value ("intermediate", "olympic weightlifting") in sentence case. */
export function valueLabel(value: string): string {
  return sentenceCase(value);
}

/** "Chest, Triceps" */
export function muscleList(muscles: readonly Muscle[]): string {
  return muscles.map(muscleLabel).join(', ');
}
