import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createSaver, type SaveState } from './saver.ts';

/** Failure of a simulated write. */
class DiskFullError extends Error {
  override name = 'DiskFullError';
}

/** A save function whose writes complete only when released. */
function controllableSave() {
  const writes: { value: number; release: () => void; fail: (error: unknown) => void }[] = [];
  const save = vi.fn(
    (value: number) =>
      new Promise<void>((resolve, reject) => {
        writes.push({ value, release: resolve, fail: reject });
      }),
  );
  return { save, writes };
}

describe('createSaver', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('writes once, 300 ms after the last change', async () => {
    const save = vi.fn(async (_value: number) => {});
    const saver = createSaver({ save, delayMs: 300 });
    saver.schedule(1);
    await vi.advanceTimersByTimeAsync(200);
    saver.schedule(2);
    await vi.advanceTimersByTimeAsync(200);
    expect(save).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(100);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(2);
  });

  it('flushes immediately and never overlaps writes', async () => {
    const { save, writes } = controllableSave();
    const states: SaveState[] = [];
    const saver = createSaver({ save, delayMs: 300, onState: (state) => states.push(state) });
    saver.schedule(1);
    const first = saver.flush();
    saver.schedule(2);
    const second = saver.flush();
    await vi.advanceTimersByTimeAsync(0);
    // The second write waits for the first.
    expect(writes.map((write) => write.value)).toEqual([1]);
    writes[0]?.release();
    await first;
    await vi.advanceTimersByTimeAsync(0);
    expect(writes.map((write) => write.value)).toEqual([1, 2]);
    writes[1]?.release();
    await second;
    expect(states.at(-1)).toBe('saved');
    expect(states).toContain('saving');
  });

  it('keeps a failed value pending and retries it on the next flush', async () => {
    const { save, writes } = controllableSave();
    const onError = vi.fn();
    const states: SaveState[] = [];
    const saver = createSaver({ save, delayMs: 300, onError, onState: (s) => states.push(s) });
    saver.schedule(7);
    const failing = saver.flush();
    await vi.advanceTimersByTimeAsync(0);
    writes[0]?.fail(new DiskFullError('disk full'));
    await failing;
    expect(onError).toHaveBeenCalledTimes(1);
    expect(states.at(-1)).toBe('error');
    const retry = saver.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(writes.map((write) => write.value)).toEqual([7, 7]);
    writes[1]?.release();
    await retry;
    expect(states.at(-1)).toBe('saved');
  });

  it('save writes now, after the write in progress, and reports its own outcome', async () => {
    const { save, writes } = controllableSave();
    const saver = createSaver({ save, delayMs: 300 });
    saver.schedule(1);
    const first = saver.flush();
    const saved = saver.save(2);
    await vi.advanceTimersByTimeAsync(0);
    expect(writes.map((write) => write.value)).toEqual([1]);
    writes[0]?.release();
    await first;
    await vi.advanceTimersByTimeAsync(0);
    expect(writes.map((write) => write.value)).toEqual([1, 2]);
    writes[1]?.release();
    await expect(saved).resolves.toBeUndefined();

    const failing = saver.save(3);
    await vi.advanceTimersByTimeAsync(0);
    const error = new DiskFullError('disk full');
    writes[2]?.fail(error);
    await expect(failing).rejects.toBe(error);
    // The failed value is retried on the next flush.
    const retry = saver.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(writes.map((write) => write.value)).toEqual([1, 2, 3, 3]);
    writes[3]?.release();
    await retry;
  });

  it('resolves a flush with nothing pending', async () => {
    const save = vi.fn(async (_value: number) => {});
    await createSaver({ save, delayMs: 300 }).flush();
    expect(save).not.toHaveBeenCalled();
  });
});
