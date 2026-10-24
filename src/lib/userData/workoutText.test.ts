import { describe, expect, it } from 'vitest';
import type { LoggedSet, Session } from '../schema/userData.ts';
import {
  formatCountdown,
  formatDay,
  formatLoggedSet,
  formatMonth,
  formatSessionDuration,
  formatSets,
  sessionSetCounts,
} from './workoutText.ts';

function set(patch: Partial<LoggedSet>): LoggedSet {
  return { id: 's', weightKg: null, reps: null, durationSec: null, done: true, ...patch };
}

describe('formatLoggedSet', () => {
  it('shows weight and reps or duration in the unit', () => {
    expect(formatLoggedSet(set({ weightKg: 60, reps: 8 }), 'kg')).toBe('60 kg × 8');
    expect(formatLoggedSet(set({ weightKg: 60, reps: 8 }), 'lb')).toBe('132.3 lb × 8');
    expect(formatLoggedSet(set({ weightKg: 20, durationSec: 45 }), 'kg')).toBe('20 kg × 45 s');
    expect(formatLoggedSet(set({ durationSec: 90 }), 'kg')).toBe('1 min 30 s');
    expect(formatLoggedSet(set({ reps: 12 }), 'kg')).toBe('12 reps');
    expect(formatLoggedSet(set({ reps: 1 }), 'kg')).toBe('1 rep');
    expect(formatLoggedSet(set({ weightKg: 62.5 }), 'kg')).toBe('62.5 kg');
    expect(formatLoggedSet(set({}), 'kg')).toBe('—');
  });

  it('joins sets', () => {
    expect(
      formatSets([set({ weightKg: 60, reps: 8 }), set({ weightKg: 62.5, reps: 6 })], 'kg'),
    ).toBe('60 kg × 8, 62.5 kg × 6');
  });
});

describe('formatCountdown', () => {
  it('shows minutes and two-digit seconds', () => {
    expect(formatCountdown(90)).toBe('1:30');
    expect(formatCountdown(60)).toBe('1:00');
    expect(formatCountdown(120)).toBe('2:00');
    expect(formatCountdown(5)).toBe('0:05');
    expect(formatCountdown(0)).toBe('0:00');
    expect(formatCountdown(3600)).toBe('60:00');
  });
});

describe('formatSessionDuration', () => {
  const start = '2026-01-01T10:00:00.000Z';
  it('formats minutes and hours', () => {
    expect(formatSessionDuration(start, '2026-01-01T10:00:20.000Z')).toBe('under 1 min');
    expect(formatSessionDuration(start, '2026-01-01T10:45:00.000Z')).toBe('45 min');
    expect(formatSessionDuration(start, '2026-01-01T11:05:00.000Z')).toBe('1 h 5 min');
    expect(formatSessionDuration(start, '2026-01-01T12:00:00.000Z')).toBe('2 h');
  });

  it('has no duration while in progress or when the clock went backwards', () => {
    expect(formatSessionDuration(start, null)).toBe('—');
    expect(formatSessionDuration(start, '2026-01-01T09:00:00.000Z')).toBe('—');
  });
});

describe('dates', () => {
  it('formats days and months in a locale', () => {
    expect(formatDay('2026-10-21T12:00:00.000Z', 'en-GB')).toBe('Wed 21 Oct');
    expect(formatMonth('2026-10-21T12:00:00.000Z', 'en-GB')).toBe('October 2026');
  });
});

describe('sessionSetCounts', () => {
  it('counts done and all sets', () => {
    const session = {
      exercises: [
        { sets: [set({ done: true }), set({ done: false })] },
        { sets: [set({ done: true })] },
      ],
    } as unknown as Session;
    expect(sessionSetCounts(session)).toEqual({ done: 2, total: 3 });
  });
});
