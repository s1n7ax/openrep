/**
 * Verification "Resume and idle workouts": a workout resumes on the exercise
 * a set was last ticked in while it has sets left, else on the next one with
 * sets left after it, not on a skipped exercise before it; a workout idle
 * for more than 10 hours is finished as of its last change (or discarded
 * when nothing was ticked off) when the app is opened, comes back to the
 * foreground, or stays open; one idle for less stays in progress.
 */
import type { Page } from '@playwright/test';
import { goTo, openApp, readStoredUserData, reopen, waitForApp } from './support/app.ts';
import { expect, test } from './support/fixtures.ts';
import { copySchedule, startDay } from './support/plans.ts';
import {
  expectOnPage,
  scrollWorkout,
  setCircle,
  tickSet,
  waitForPictures,
  workoutPage,
} from './support/workout.ts';

test.use({ hasTouch: true });
// Every page change starts 3D views, which takes seconds with software WebGL.
test.describe.configure({ timeout: 180_000 });

const START = new Date('2026-03-02T08:00:00Z');

/** Leaves the workout for the Plans tab, keeping it in progress. */
async function leaveWorkout(page: Page): Promise<void> {
  await goTo(page, '#/');
  await expect(page.getByTestId('resume-workout')).toBeVisible();
}

/** Resumes the workout in progress from the Plans tab; ends once its 3D views have started. */
async function resumeWorkout(page: Page): Promise<void> {
  await page.getByTestId('resume-workout').click();
  await waitForPictures(page);
}

test('a workout resumes after the exercise last worked on, not on a skipped one', async ({
  page,
}) => {
  await openApp(page);
  // Day A: goblet squat, bench press, seated cable rows, side lateral raise, plank.
  await copySchedule(page, 'beginner-full-body');
  await startDay(page, 0);
  await expectOnPage(page, 0);

  // Skip the squat and the bench press; tick the first set of the rows.
  await scrollWorkout(page, 1 / 3);
  await expectOnPage(page, 1);
  await scrollWorkout(page, 1 / 3);
  await expectOnPage(page, 2);
  const rows = workoutPage(page, 2);
  await tickSet(rows, 0);

  // Resuming opens the rows, which have sets left.
  await leaveWorkout(page);
  await resumeWorkout(page);
  await expectOnPage(page, 2);

  // Finish the rows (moving on to the raises), close the app and reopen it:
  // resuming opens the raises, not the skipped squat.
  const sets = await rows.getByTestId('set-circle').count();
  await setCircle(rows, sets - 1).click();
  await expect(setCircle(rows, sets - 1)).toHaveAttribute('aria-pressed', 'true');
  await expectOnPage(page, 3);
  await leaveWorkout(page);
  await reopen(page);
  await resumeWorkout(page);
  await expectOnPage(page, 3);
  await expect(page.getByTestId('workout-position')).toHaveText('4 of 5');
});

test('a workout idle for more than 10 hours is finished as of its last change', async ({
  page,
}) => {
  await page.clock.install({ time: START });
  await openApp(page);
  await copySchedule(page, 'beginner-full-body');
  await startDay(page, 0);
  await tickSet(page.getByTestId('workout-exercise').first(), 0);
  await leaveWorkout(page);
  const lastChange = (await readStoredUserData(page))?.sessions[0]?.updatedAt;
  expect(lastChange).toBeTruthy();

  // 9 hours later the app, still open, keeps it in progress.
  await page.clock.fastForward('09:00:00');
  await expect(page.getByTestId('resume-workout')).toBeVisible();

  // Past 10 hours it is finished, at the time of its last change.
  await page.clock.fastForward('01:30:00');
  await expect(page.getByTestId('resume-workout')).toHaveCount(0);
  const stored = await readStoredUserData(page);
  expect(stored?.activeSessionId).toBeNull();
  expect(stored?.sessions.map((session) => session.finishedAt)).toEqual([lastChange]);
  await page.getByTestId('tab-history').click();
  await expect(page.getByTestId('history-row')).toHaveCount(1);
});

test('an idle workout with no set ticked off is discarded', async ({ page }) => {
  await page.clock.install({ time: START });
  await openApp(page);
  await copySchedule(page, 'beginner-full-body');
  await startDay(page, 0);
  await leaveWorkout(page);

  await page.clock.fastForward('10:01:00');
  await expect(page.getByTestId('resume-workout')).toHaveCount(0);
  const stored = await readStoredUserData(page);
  expect(stored?.activeSessionId).toBeNull();
  expect(stored?.sessions).toEqual([]);
  await page.getByTestId('tab-history').click();
  await expect(page.getByTestId('history-row')).toHaveCount(0);
});

test('an idle workout is closed when the app comes back to the foreground or opens', async ({
  page,
}) => {
  await page.clock.install({ time: START });
  await openApp(page);
  await copySchedule(page, 'beginner-full-body');
  await startDay(page, 0);
  await tickSet(page.getByTestId('workout-exercise').first(), 0);
  await leaveWorkout(page);
  await reopen(page);

  // Time stands still (no timer fires) while the app is in the background for
  // 11 hours. Pausing a minute ahead leaves room for a slow round trip (a
  // pause in the past throws); the minute's idle check finds nothing to close.
  await page.clock.pauseAt(new Date(Date.parse(await clockNow(page)) + 60_000));
  await page.clock.setSystemTime(new Date(Date.parse(await clockNow(page)) + 11 * 3600_000));
  await expect(page.getByTestId('resume-workout')).toBeVisible();
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await expect(page.getByTestId('resume-workout')).toHaveCount(0);
  await page.clock.resume();

  // Another workout, idle while the app is closed, is closed when it opens.
  await page.getByTestId('plan-link').first().click();
  await startDay(page, 1);
  await tickSet(page.getByTestId('workout-exercise').first(), 0);
  await leaveWorkout(page);
  await reopen(page);
  await expect(page.getByTestId('resume-workout')).toBeVisible();
  await page.clock.setSystemTime(new Date(Date.parse(await clockNow(page)) + 11 * 3600_000));
  await page.reload();
  await waitForApp(page);
  await expect(page.getByTestId('plan-link').first()).toBeVisible();
  await expect(page.getByTestId('resume-workout')).toHaveCount(0);
  const stored = await readStoredUserData(page);
  expect(stored?.activeSessionId).toBeNull();
  expect(stored?.sessions.every((session) => session.finishedAt !== null)).toBe(true);
});

/** The page's (fake) time. */
function clockNow(page: Page): Promise<string> {
  return page.evaluate(() => new Date().toISOString());
}
