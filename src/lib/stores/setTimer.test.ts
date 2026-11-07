import { afterEach, describe, expect, it } from 'vitest';
import { heldSeconds, setTimer, type TimedSet } from './setTimer.svelte.ts';

const START = Date.parse('2026-01-01T10:00:00.000Z');

describe('heldSeconds', () => {
  const timed: TimedSet = {
    sessionId: 's1',
    sessionExerciseId: 'e1',
    setId: 'a',
    seconds: 30,
    endsAt: START + 30_000,
  };

  it('counts whole seconds held, rounding down', () => {
    expect(heldSeconds(timed, START)).toBe(0);
    expect(heldSeconds(timed, START + 999)).toBe(0);
    expect(heldSeconds(timed, START + 1000)).toBe(1);
    expect(heldSeconds(timed, START + 29_999)).toBe(29);
  });

  it('stays at its length once over and at 0 before it started', () => {
    expect(heldSeconds(timed, START + 30_000)).toBe(30);
    expect(heldSeconds(timed, START + 3_600_000)).toBe(30);
    expect(heldSeconds(timed, START - 5000)).toBe(0);
  });
});

describe('setTimer', () => {
  afterEach(() => setTimer.stop());

  it('starts a countdown ending its length from now, replacing the running one', () => {
    setTimer.start({ sessionId: 's1', sessionExerciseId: 'e1', setId: 'a', seconds: 30 }, START);
    expect(setTimer.current).toEqual({
      sessionId: 's1',
      sessionExerciseId: 'e1',
      setId: 'a',
      seconds: 30,
      endsAt: START + 30_000,
    });
    setTimer.start({ sessionId: 's1', sessionExerciseId: 'e2', setId: 'b', seconds: 45 }, START);
    expect(setTimer.current?.setId).toBe('b');
    expect(setTimer.current?.endsAt).toBe(START + 45_000);
  });

  it('stops', () => {
    setTimer.start({ sessionId: 's1', sessionExerciseId: 'e1', setId: 'a', seconds: 30 }, START);
    setTimer.stop();
    expect(setTimer.current).toBeNull();
  });
});
