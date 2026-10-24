import { describe, expect, it } from 'vitest';
import type { LoggedSet } from '../schema/userData.ts';
import {
  amountBase,
  amountKind,
  circleLines,
  circlesPerLine,
  nextSet,
  parseAmount,
  plannedAmount,
  shownAmount,
  stepAmount,
} from './setCircles.ts';

function set(id: string, patch: Partial<LoggedSet> = {}): LoggedSet {
  return { id, weightKg: null, reps: null, durationSec: null, done: false, ...patch };
}

const EIGHT = { reps: '8' };
const RANGE = { reps: '8-12' };
const HOLD = { durationSec: 30 };

describe('what a set circle shows', () => {
  it('shows the reps or seconds logged', () => {
    expect(shownAmount(set('a', { reps: 6 }), EIGHT)).toBe('6');
    expect(shownAmount(set('a', { durationSec: 45, reps: 3 }), HOLD)).toBe('45');
    expect(shownAmount(set('a', { reps: 0 }), EIGHT)).toBe('0');
  });

  it('shows the planned amount while none is entered', () => {
    expect(shownAmount(set('a'), EIGHT)).toBe('8');
    expect(shownAmount(set('a'), RANGE)).toBe('8–12');
    expect(shownAmount(set('a', { reps: 5 }), HOLD)).toBe('30');
    expect(plannedAmount({})).toBe('—');
  });

  it('tells reps from seconds', () => {
    expect(amountKind(EIGHT)).toBe('reps');
    expect(amountKind(HOLD)).toBe('time');
  });
});

describe('stepping reps and seconds', () => {
  it('steps reps by 1 and seconds by 5, within 0 and the most a set takes', () => {
    expect(stepAmount(8, EIGHT, 1)).toBe(9);
    expect(stepAmount(8, EIGHT, -1)).toBe(7);
    expect(stepAmount(0, EIGHT, -1)).toBe(0);
    expect(stepAmount(999, EIGHT, 1)).toBe(999);
    expect(stepAmount(30, HOLD, 1)).toBe(35);
    expect(stepAmount(3, HOLD, -1)).toBe(0);
    expect(stepAmount(36_000, HOLD, 1)).toBe(36_000);
  });

  it('starts from the target while nothing is entered, from a range at its low end', () => {
    expect(amountBase(EIGHT)).toBe(8);
    expect(amountBase(RANGE)).toBe(8);
    expect(amountBase(HOLD)).toBe(30);
    expect(amountBase({})).toBe(0);
    expect(stepAmount(null, EIGHT, -1)).toBe(7);
    expect(stepAmount(null, RANGE, 1)).toBe(9);
    expect(stepAmount(null, HOLD, 1)).toBe(35);
    expect(stepAmount(null, {}, -1)).toBe(0);
  });

  it('reads typed whole numbers', () => {
    expect(parseAmount('', 'reps')).toBeNull();
    expect(parseAmount(' 12 ', 'reps')).toBe(12);
    expect(parseAmount('1000', 'reps')).toBeUndefined();
    expect(parseAmount('1000', 'time')).toBe(1000);
    expect(parseAmount('8.5', 'reps')).toBeUndefined();
    expect(parseAmount('-1', 'reps')).toBeUndefined();
  });
});

describe('the next set', () => {
  it('is the first set not ticked off of an exercise', () => {
    const entry = { id: 'e1', sets: [set('a', { done: true }), set('b'), set('c')] };
    expect(nextSet([entry])?.set.id).toBe('b');
    expect(nextSet([{ id: 'e1', sets: [set('a', { done: true })] }])).toBeNull();
  });

  it('goes round by round through a superset', () => {
    const a1 = { id: 'e1', sets: [set('a', { done: true }), set('b', { done: true })] };
    const a2 = { id: 'e2', sets: [set('c', { done: true }), set('d')] };
    expect(nextSet([a1, a2])).toMatchObject({ position: 1, setIndex: 1, set: { id: 'd' } });
  });
});

describe('lines of circles', () => {
  it('keeps up to 5 side by side, then fills lines evenly', () => {
    expect([1, 3, 5, 6, 7, 8, 10, 11, 20].map(circlesPerLine)).toEqual([1, 3, 5, 3, 4, 4, 5, 4, 5]);
    expect(circlesPerLine(0)).toBe(1);
  });

  it('breaks positions into lines', () => {
    expect(circleLines(3)).toEqual([[0, 1, 2]]);
    expect(circleLines(7)).toEqual([
      [0, 1, 2, 3],
      [4, 5, 6],
    ]);
    expect(circleLines(0)).toEqual([]);
  });
});
