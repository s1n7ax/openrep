/** Building plans through the UI. */
import type { Page } from '@playwright/test';
import { expect } from './fixtures.ts';

/** The id in a `#/plans/<id>…` location. */
function planIdFrom(url: string): string {
  const id = /#\/plans\/([^/?]+)/.exec(url)?.[1];
  expect(id, `a plan location: ${url}`).toBeTruthy();
  return decodeURIComponent(id ?? '');
}

/** Creates a plan from the Plans tab; ends in its editor (with "Day 1"). Returns its id. */
export async function createPlan(page: Page, name: string): Promise<string> {
  await page.getByTestId('tab-plans').click();
  await page.getByTestId('new-plan').click();
  await page.getByTestId('new-plan-name').fill(name);
  await page.getByTestId('new-plan-create').click();
  await expect(page.getByTestId('edit-plan-name')).toHaveValue(name);
  return planIdFrom(page.url());
}

/**
 * In the plan editor, adds the catalog exercise `exerciseId` to the day at
 * `dayIndex` by searching for `query` in the picker. Ends back in the editor.
 */
export async function addExercise(
  page: Page,
  dayIndex: number,
  query: string,
  exerciseId: string,
): Promise<void> {
  const day = page.getByTestId('edit-day').nth(dayIndex);
  const before = await day.getByTestId('edit-exercise').count();
  await day.getByTestId('add-exercise').click();
  await page.getByTestId('exercise-search').fill(query);
  await page.locator(`[data-testid="exercise-row"][data-exercise-id="${exerciseId}"]`).click();
  await expect(page.getByTestId('edit-day').nth(dayIndex).getByTestId('edit-exercise')).toHaveCount(
    before + 1,
  );
}

/** Copies a starter schedule into the plans from the Schedules tab; ends on the new plan. Returns its id. */
export async function copySchedule(page: Page, scheduleId: string): Promise<string> {
  await page.getByTestId('tab-schedules').click();
  await page.locator(`[data-testid="schedule-card"][data-schedule-id="${scheduleId}"]`).click();
  await page.getByTestId('schedule-copy').click();
  await expect(page.getByTestId('plan-day').first()).toBeVisible();
  return planIdFrom(page.url());
}

/** Opens the plan named `name` from the Plans tab. */
export async function openPlan(page: Page, name: string): Promise<void> {
  await page.getByTestId('tab-plans').click();
  await page.getByTestId('plan-link').filter({ hasText: name }).click();
  await expect(page.getByTestId('plan-day').first()).toBeVisible();
}

/** Starts the day at `dayIndex` of the open plan; ends in the workout. */
export async function startDay(page: Page, dayIndex: number): Promise<void> {
  await page.getByTestId('plan-day').nth(dayIndex).getByTestId('day-start').click();
  await expect(page.getByTestId('workout-page').first()).toBeVisible();
}

/** Text of every day of the open plan (names, exercises, targets, notes). */
export async function planDayTexts(page: Page): Promise<string[]> {
  return page.getByTestId('plan-day').allInnerTexts();
}
