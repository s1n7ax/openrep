/**
 * Verifications "3D core exercises" and "3D non-core": each of the 30 core
 * exercises plays its movement with its primary and secondary muscles glowing
 * in different colours, and can be rotated and zoomed; other exercises show
 * the glow on a still figure that stops rendering while idle.
 *
 * Pixel checks use the dev pose route (`#/dev/pose/<id>?t=`), which freezes
 * the movement at a loop time so frames can be compared.
 */
import type { Page } from '@playwright/test';
import type { Catalog } from '../src/lib/schema/catalog.ts';
import type { Exercise } from '../src/lib/schema/exercise.ts';
import { bundledCatalog, goTo, openApp } from './support/app.ts';
import { expect, test } from './support/fixtures.ts';
import { changedFraction, glowPixels, type Image } from './support/pixels.ts';
import {
  afterRender,
  captureCanvas,
  frameCount,
  viewer,
  waitForFrameAfter,
  waitForIdle,
} from './support/viewer.ts';

/** The core animated set (requirement and plan). */
const CORE_EXERCISE_IDS = [
  'barbell-bench-press-medium-grip',
  'incline-dumbbell-press',
  'dumbbell-flyes',
  'pushups',
  'barbell-squat',
  'goblet-squat',
  'leg-press',
  'romanian-deadlift',
  'barbell-deadlift',
  'bodyweight-walking-lunge',
  'leg-extensions',
  'lying-leg-curls',
  'standing-calf-raises',
  'barbell-hip-thrust',
  'pullups',
  'wide-grip-lat-pulldown',
  'seated-cable-rows',
  'bent-over-barbell-row',
  'one-arm-dumbbell-row',
  'standing-military-press',
  'seated-dumbbell-press',
  'side-lateral-raise',
  'face-pull',
  'barbell-curl',
  'hammer-curls',
  'triceps-pushdown',
  'lying-triceps-press',
  'dips-triceps-version',
  'plank',
  'crunches',
];

const NON_CORE_EXERCISE_ID = '3-4-sit-up';
/** A non-core exercise working back muscles: its still figure starts from behind. */
const NON_CORE_BACK_EXERCISE_ID = 'hyperextensions-back-extensions';

/** Frames compared must differ in more than this share of pixels. */
const MIN_CHANGED = 0.01;
/** Fewer glow-coloured pixels than this count as no glow. */
const MIN_GLOW_PIXELS = 40;
/**
 * Primary glow pixels the default view must show without rotating (the
 * primary muscles are visible, not just a sliver of them).
 */
const MIN_PRIMARY_IN_VIEW = 150;

// A phone-sized view keeps software rendering in headless Chromium quick.
test.use({ viewport: { width: 360, height: 560 } });

let catalog: Catalog;

test.beforeAll(async ({ request }) => {
  catalog = await bundledCatalog(request);
});

function exercise(id: string): Exercise {
  const found = catalog.exercises.find((candidate) => candidate.id === id);
  expect(found, `exercise "${id}" in the bundled catalog`).toBeDefined();
  return found as Exercise;
}

async function expectMuscleAttributes(page: Page, item: Exercise, animated: boolean) {
  await expect(viewer(page)).toHaveAttribute('data-animated', String(animated));
  await expect(viewer(page)).toHaveAttribute('data-primary', item.primaryMuscles.join(','));
  await expect(viewer(page)).toHaveAttribute('data-secondary', item.secondaryMuscles.join(','));
}

function totalGlow(images: Image[]): { primary: number; secondary: number } {
  return images.map(glowPixels).reduce(
    (sum, glow) => ({
      primary: sum.primary + glow.primary,
      secondary: sum.secondary + glow.secondary,
    }),
    { primary: 0, secondary: 0 },
  );
}

test('the core exercises are exactly the animated ones', () => {
  expect(catalog.animations.map((animation) => animation.exerciseId).sort()).toEqual(
    [...CORE_EXERCISE_IDS].sort(),
  );
});

for (const id of CORE_EXERCISE_IDS) {
  test(`core exercise ${id} plays, glows, rotates and zooms`, async ({ page }) => {
    test.setTimeout(180_000);
    const item = exercise(id);

    // The exercise page plays the movement.
    await openApp(page, `#/exercises/${id}`);
    await expect(page.getByTestId('exercise-name')).toHaveText(item.name);
    await expectMuscleAttributes(page, item, true);
    await waitForFrameAfter(page, await waitForFrameAfter(page, 0));

    // Frozen at t = 0 and t = 0.5, the figure is in a different position.
    await goTo(page, `#/dev/pose/${id}?t=0`);
    await expect(page.getByTestId('dev-pose')).toBeVisible();
    await expectMuscleAttributes(page, item, true);
    await waitForFrameAfter(page, 0);
    await waitForIdle(page);
    const start = await captureCanvas(page);
    await afterRender(page, () => goTo(page, `#/dev/pose/${id}?t=0.5`));
    const middle = await captureCanvas(page);
    expect(changedFraction(start, middle), 't = 0 vs t = 0.5').toBeGreaterThan(MIN_CHANGED);

    // The default view shows the primary muscles at the start and in the middle of the movement.
    for (const [label, image] of [
      ['t = 0', start],
      ['t = 0.5', middle],
    ] as const) {
      expect(
        glowPixels(image).primary,
        `primary muscles (${item.primaryMuscles.join(', ')}) in the default view at ${label}`,
      ).toBeGreaterThan(MIN_PRIMARY_IN_VIEW);
    }

    // The wheel zooms in: the view changes and the glowing muscles get bigger.
    const box = await viewer(page).locator('canvas').boundingBox();
    expect(box, 'the 3D canvas is on screen').not.toBeNull();
    const centre = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
    await page.mouse.move(centre.x, centre.y);
    await afterRender(page, () => page.mouse.wheel(0, -500));
    const zoomed = await captureCanvas(page);
    expect(changedFraction(middle, zoomed), 'zoom').toBeGreaterThan(MIN_CHANGED);
    const glowBefore = glowPixels(middle);
    const glowAfter = glowPixels(zoomed);
    expect(glowAfter.primary + glowAfter.secondary, 'glow area after zooming in').toBeGreaterThan(
      (glowBefore.primary + glowBefore.secondary) * 1.2,
    );

    // Dragging rotates the view.
    await afterRender(page, async () => {
      await page.mouse.down();
      await page.mouse.move(centre.x + 120, centre.y, { steps: 4 });
      await page.mouse.up();
    });
    const rotated = await captureCanvas(page);
    expect(changedFraction(zoomed, rotated), 'rotation').toBeGreaterThan(MIN_CHANGED);

    // Primary muscles glow red-orange, secondary ones amber.
    const glow = totalGlow([start, middle, zoomed, rotated]);
    expect(glow.primary, `primary glow (${item.primaryMuscles.join(', ')})`).toBeGreaterThan(
      MIN_GLOW_PIXELS,
    );
    if (item.secondaryMuscles.length > 0) {
      expect(
        glow.secondary,
        `secondary glow (${item.secondaryMuscles.join(', ')})`,
      ).toBeGreaterThan(MIN_GLOW_PIXELS);
    } else {
      expect(glow.secondary, 'no secondary muscles, no secondary glow').toBeLessThan(
        MIN_GLOW_PIXELS,
      );
    }
  });
}

test(`non-core exercise ${NON_CORE_EXERCISE_ID} glows on a still figure`, async ({ page }) => {
  test.setTimeout(120_000);
  const item = exercise(NON_CORE_EXERCISE_ID);
  expect(catalog.animations.some((animation) => animation.exerciseId === item.id)).toBe(false);

  await openApp(page, `#/exercises/${item.id}`);
  await expectMuscleAttributes(page, item, false);
  await waitForFrameAfter(page, 0);
  // Nothing moves, so it stops rendering once drawn, and stays idle.
  const idle = await waitForIdle(page);
  await page.waitForTimeout(2_000);
  expect(await frameCount(page)).toBe(idle);

  const glow = glowPixels(await captureCanvas(page));
  expect(glow.primary, `primary glow (${item.primaryMuscles.join(', ')})`).toBeGreaterThan(
    MIN_PRIMARY_IN_VIEW,
  );
});

test(`non-core exercise ${NON_CORE_BACK_EXERCISE_ID} shows its back muscles without rotating`, async ({
  page,
}) => {
  test.setTimeout(120_000);
  const item = exercise(NON_CORE_BACK_EXERCISE_ID);
  expect(catalog.animations.some((animation) => animation.exerciseId === item.id)).toBe(false);

  await openApp(page, `#/exercises/${item.id}`);
  await expectMuscleAttributes(page, item, false);
  await waitForFrameAfter(page, 0);
  await waitForIdle(page);
  const glow = glowPixels(await captureCanvas(page));
  expect(glow.primary, `primary glow (${item.primaryMuscles.join(', ')})`).toBeGreaterThan(
    MIN_PRIMARY_IN_VIEW,
  );
});

test('play/pause stops and resumes the movement, reset view brings the camera back', async ({
  page,
}) => {
  test.setTimeout(180_000);
  await openApp(page, '#/exercises/barbell-squat');
  await expect(viewer(page)).toHaveAttribute('data-animated', 'true');
  await waitForFrameAfter(page, await waitForFrameAfter(page, 0));

  // Pause: the view stops rendering and stays still.
  await page.getByRole('button', { name: 'Pause' }).click();
  await expect(page.getByRole('button', { name: 'Play' })).toHaveAttribute('aria-pressed', 'true');
  const idle = await waitForIdle(page);
  const paused = await captureCanvas(page);
  await page.waitForTimeout(1_500);
  expect(await frameCount(page)).toBe(idle);

  // Rotate, then reset the view: back to the same picture.
  const box = await viewer(page).locator('canvas').boundingBox();
  expect(box, 'the 3D canvas is on screen').not.toBeNull();
  const centre = { x: box!.x + box!.width / 2, y: box!.y + box!.height / 2 };
  await afterRender(page, async () => {
    await page.mouse.move(centre.x, centre.y);
    await page.mouse.down();
    await page.mouse.move(centre.x + 140, centre.y + 30, { steps: 4 });
    await page.mouse.up();
  });
  const rotated = await captureCanvas(page);
  expect(changedFraction(paused, rotated), 'rotation').toBeGreaterThan(MIN_CHANGED);
  await afterRender(page, () => page.getByRole('button', { name: 'Reset view' }).click());
  const reset = await captureCanvas(page);
  expect(changedFraction(paused, reset), 'reset view').toBeLessThan(MIN_CHANGED / 2);

  // Play: the movement resumes.
  await page.getByRole('button', { name: 'Play' }).click();
  await expect(page.getByRole('button', { name: 'Pause' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );
  await waitForFrameAfter(page, await waitForFrameAfter(page, await frameCount(page)));
});
