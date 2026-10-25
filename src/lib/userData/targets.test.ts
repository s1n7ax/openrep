import { describe, expect, it } from 'vitest';
import type { PlanTarget } from '../schema/userData.ts';
import { formatWeight, toKg } from '../units.ts';
import { applyTargetForm, plannedReps, type TargetForm } from './targets.ts';

/** 135 lb, stored at full precision. */
const STORED_KG = toKg(135, 'lb');

const stored: PlanTarget = { sets: 3, reps: '8-12', weightKg: STORED_KG, restSec: 90 };

/** The editor's fields as first shown for `stored` in `unit`, nothing edited yet. */
function formFor(unit: 'kg' | 'lb'): TargetForm {
  return {
    mode: 'reps',
    reps: '8-12',
    duration: '30',
    weight: formatWeight(STORED_KG, unit),
    rest: '90',
    notes: '',
    weightEdited: false,
  };
}

describe('applyTargetForm', () => {
  it('keeps the stored weight at full precision when other fields change', () => {
    // Shown in kg the field reads "61.2"; changing the sets must not store 61.2 kg.
    expect(formFor('kg').weight).toBe('61.2');
    const target = applyTargetForm({ ...stored, sets: 4 }, formFor('kg'), 'kg');
    expect(target.sets).toBe(4);
    expect(target.weightKg).toBe(STORED_KG);
    expect(formatWeight(target.weightKg!, 'lb')).toBe('135');
  });

  it('reads the weight field once it was edited', () => {
    const edited = { ...formFor('kg'), weight: '62,5', weightEdited: true };
    expect(applyTargetForm(stored, edited, 'kg').weightKg).toBe(62.5);
    const cleared = { ...formFor('kg'), weight: '', weightEdited: true };
    expect(applyTargetForm(stored, cleared, 'kg').weightKg).toBeUndefined();
    const invalid = { ...formFor('kg'), weight: 'heavy', weightEdited: true };
    expect(applyTargetForm(stored, invalid, 'kg').weightKg).toBe(STORED_KG);
  });

  it('applies valid fields and keeps the stored value of invalid ones', () => {
    const form = { ...formFor('lb'), reps: '8-', rest: '', notes: 'slow' };
    expect(applyTargetForm(stored, form, 'lb')).toEqual({
      sets: 3,
      reps: '8-12',
      durationSec: undefined,
      weightKg: STORED_KG,
      restSec: undefined,
      notes: 'slow',
    });
    const timed = applyTargetForm(stored, { ...formFor('lb'), mode: 'time', duration: '45' }, 'lb');
    expect(timed).toMatchObject({ reps: undefined, durationSec: 45 });
  });
});

describe('plannedReps', () => {
  it('is the number, or the low end of a range', () => {
    expect(plannedReps('8')).toBe(8);
    expect(plannedReps('10-12')).toBe(10);
    expect(plannedReps(undefined)).toBeNull();
  });
});
