/**
 * Human-readable text for logged workouts: sets, "last time", session
 * duration and dates. Weights are shown in the user's unit.
 */
import type { LoggedSet, Session, Unit } from '../schema/userData.ts';
import { formatWeightWithUnit } from '../units.ts';
import { formatDuration } from './targets.ts';

/** "60 kg × 8", "8 reps", "20 kg × 45 s", "45 s", "60 kg", or "—" when nothing was entered. */
export function formatLoggedSet(
  set: Pick<LoggedSet, 'weightKg' | 'reps' | 'durationSec'>,
  unit: Unit,
): string {
  const weight = set.weightKg === null ? null : formatWeightWithUnit(set.weightKg, unit);
  const amount =
    set.durationSec !== null
      ? formatDuration(set.durationSec)
      : set.reps !== null
        ? weight === null
          ? `${set.reps} ${set.reps === 1 ? 'rep' : 'reps'}`
          : String(set.reps)
        : null;
  if (weight !== null && amount !== null) return `${weight} × ${amount}`;
  return weight ?? amount ?? '—';
}

/** The sets of one exercise, e.g. "60 kg × 8, 60 kg × 8, 62.5 kg × 6". */
export function formatSets(sets: readonly LoggedSet[], unit: Unit): string {
  return sets.map((set) => formatLoggedSet(set, unit)).join(', ');
}

/** "1 h 5 min", "45 min", "under 1 min"; "—" for an unfinished or inconsistent session. */
export function formatSessionDuration(startedAt: string, finishedAt: string | null): string {
  if (finishedAt === null) return '—';
  const ms = Date.parse(finishedAt) - Date.parse(startedAt);
  if (!Number.isFinite(ms) || ms < 0) return '—';
  const minutes = Math.round(ms / 60_000);
  if (minutes < 1) return 'under 1 min';
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours === 0) return `${minutes} min`;
  return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
}

/** Sets marked done and all sets of a session. */
export function sessionSetCounts(session: Session): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const exercise of session.exercises) {
    for (const set of exercise.sets) {
      total += 1;
      if (set.done) done += 1;
    }
  }
  return { done, total };
}

/** "Wed 21 Oct" (in the device's locale unless `locale` is given). */
export function formatDay(iso: string, locale?: string): string {
  return new Date(iso).toLocaleDateString(locale, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
  });
}

/** "Wednesday 21 October 2026, 18:05" (in the device's locale unless `locale` is given). */
export function formatDateTime(iso: string, locale?: string): string {
  return new Date(iso).toLocaleString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

/** "October 2026", for grouping history by month. */
export function formatMonth(iso: string, locale?: string): string {
  return new Date(iso).toLocaleDateString(locale, { month: 'long', year: 'numeric' });
}
