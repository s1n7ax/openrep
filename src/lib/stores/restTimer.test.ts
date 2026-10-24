import { afterEach, describe, expect, it } from 'vitest';
import { restSecondsLeft, restTimer, type Rest } from './restTimer.svelte.ts';

const START = Date.parse('2026-01-01T10:00:00.000Z');

describe('restSecondsLeft', () => {
  const rest: Rest = {
    sessionId: 's1',
    sessionExerciseId: 'e1',
    setId: 'a',
    seconds: 60,
    endsAt: START + 60_000,
  };

  it('counts down whole seconds, rounding up', () => {
    expect(restSecondsLeft(rest, START)).toBe(60);
    expect(restSecondsLeft(rest, START + 400)).toBe(60);
    expect(restSecondsLeft(rest, START + 1000)).toBe(59);
    expect(restSecondsLeft(rest, START + 59_001)).toBe(1);
    expect(restSecondsLeft(rest, START + 60_000)).toBe(0);
  });

  it('stays at 0 once over and at its length before it started', () => {
    expect(restSecondsLeft(rest, START + 3_600_000)).toBe(0);
    expect(restSecondsLeft(rest, START - 5000)).toBe(60);
  });
});

describe('restTimer', () => {
  afterEach(() => restTimer.stop());

  it('starts a countdown ending its length from now, replacing the running one', () => {
    restTimer.start({ sessionId: 's1', sessionExerciseId: 'e1', setId: 'a', seconds: 60 }, START);
    expect(restTimer.current).toEqual({
      sessionId: 's1',
      sessionExerciseId: 'e1',
      setId: 'a',
      seconds: 60,
      endsAt: START + 60_000,
    });
    expect(restTimer.startedBy('e1', 'a')).toBe(true);
    restTimer.start({ sessionId: 's1', sessionExerciseId: 'e1', setId: 'b', seconds: 90 }, START);
    expect(restTimer.current?.endsAt).toBe(START + 90_000);
    expect(restTimer.startedBy('e1', 'a')).toBe(false);
    expect(restTimer.startedBy('e1', 'b')).toBe(true);
  });

  it('stops', () => {
    restTimer.start({ sessionId: 's1', sessionExerciseId: 'e1', setId: 'a', seconds: 60 }, START);
    restTimer.stop();
    expect(restTimer.current).toBeNull();
    expect(restTimer.startedBy('e1', 'a')).toBe(false);
  });
});
