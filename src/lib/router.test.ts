import { describe, expect, it } from 'vitest';
import { isTabRoot, parentPath, parseDevPoseRoute, parseRoute, paths, tabOf } from './router.ts';

describe('parseRoute', () => {
  it('parses the app routes', () => {
    expect(parseRoute('')).toEqual({ name: 'plans' });
    expect(parseRoute('#/')).toEqual({ name: 'plans' });
    expect(parseRoute('#/plans/p1')).toEqual({ name: 'plan', planId: 'p1' });
    expect(parseRoute('#/plans/p1/edit')).toEqual({ name: 'plan-edit', planId: 'p1' });
    expect(parseRoute('#/plans/p1/days/d1/add')).toEqual({
      name: 'plan-add-exercise',
      planId: 'p1',
      dayId: 'd1',
    });
    expect(parseRoute('#/exercises')).toEqual({ name: 'exercises' });
    expect(parseRoute('#/exercises/lying-triceps-press/')).toEqual({
      name: 'exercise',
      exerciseId: 'lying-triceps-press',
    });
    expect(parseRoute('#/custom/c1')).toEqual({ name: 'custom', customId: 'c1' });
    expect(parseRoute('#/custom/c1/edit')).toEqual({ name: 'custom-edit', customId: 'c1' });
    expect(parseRoute('#/schedules/push-pull-legs')).toEqual({
      name: 'schedule',
      scheduleId: 'push-pull-legs',
    });
    expect(parseRoute('#/workout/s1')).toEqual({ name: 'workout', sessionId: 's1' });
    expect(parseRoute('#/history/s1')).toEqual({ name: 'history-session', sessionId: 's1' });
    expect(parseRoute('#/settings')).toEqual({ name: 'settings' });
  });

  it('parses the new custom exercise route with its query', () => {
    expect(parseRoute('#/custom/new?name=zzqx%20nonexistent&plan=p1&day=d1')).toEqual({
      name: 'custom-new',
      initialName: 'zzqx nonexistent',
      planId: 'p1',
      dayId: 'd1',
    });
    expect(parseRoute('#/custom/new?plan=p1')).toEqual({
      name: 'custom-new',
      initialName: '',
      planId: null,
      dayId: null,
    });
  });

  it('reports unknown and malformed paths as not found', () => {
    expect(parseRoute('#/nope')).toEqual({ name: 'not-found', path: '/nope' });
    expect(parseRoute('#/plans/%E0%A4%A/edit')).toEqual({
      name: 'not-found',
      path: '/plans/%E0%A4%A/edit',
    });
  });

  it('round-trips the path builders, encoding parameters', () => {
    expect(parseRoute(paths.plan('a b/c'))).toEqual({ name: 'plan', planId: 'a b/c' });
    expect(parseRoute(paths.planAddExercise('p', 'd'))).toEqual({
      name: 'plan-add-exercise',
      planId: 'p',
      dayId: 'd',
    });
    expect(parseRoute(paths.customNew({ name: 'Zercher & co', planId: 'p', dayId: 'd' }))).toEqual({
      name: 'custom-new',
      initialName: 'Zercher & co',
      planId: 'p',
      dayId: 'd',
    });
    expect(paths.customNew()).toBe('/custom/new');
  });
});

describe('navigation helpers', () => {
  it('knows tab roots, tabs and parents', () => {
    expect(isTabRoot(parseRoute('#/'))).toBe(true);
    expect(isTabRoot(parseRoute('#/settings'))).toBe(true);
    expect(isTabRoot(parseRoute('#/plans/p1'))).toBe(false);
    expect(tabOf(parseRoute('#/workout/s1'))).toBe('plans');
    expect(tabOf(parseRoute('#/custom/c1'))).toBe('exercises');
    expect(tabOf(parseRoute('#/dev/pose/plank'))).toBeNull();
    expect(parentPath(parseRoute('#/plans/p1/edit'))).toBe('/plans/p1');
    expect(parentPath(parseRoute('#/plans/p1/days/d1/add'))).toBe('/plans/p1/edit');
    expect(parentPath(parseRoute('#/custom/new?plan=p1&day=d1'))).toBe('/plans/p1/days/d1/add');
    expect(parentPath(parseRoute('#/custom/new'))).toBe('/exercises');
    expect(parentPath(parseRoute('#/exercises/plank'))).toBe('/exercises');
  });
});

describe('parseDevPoseRoute', () => {
  it('parses the exercise id and a frozen time', () => {
    expect(parseDevPoseRoute('#/dev/pose/barbell-squat?t=0.25')).toEqual({
      exerciseId: 'barbell-squat',
      time: 0.25,
      view: 'default',
      zoom: 1,
      focus: null,
    });
  });

  it('plays when t is missing and clamps t into [0, 1]', () => {
    expect(parseDevPoseRoute('#/dev/pose/plank')?.time).toBeNull();
    expect(parseDevPoseRoute('#/dev/pose/plank?t=')?.time).toBeNull();
    expect(parseDevPoseRoute('#/dev/pose/plank?t=3')?.time).toBe(1);
    expect(parseDevPoseRoute('#/dev/pose/plank?t=-1')?.time).toBe(0);
  });

  it('reads the review parameters', () => {
    expect(parseDevPoseRoute('#/dev/pose/plank?view=side&zoom=2&focus=0,1,0.5')).toMatchObject({
      view: 'side',
      zoom: 2,
      focus: [0, 1, 0.5],
    });
    expect(parseDevPoseRoute('#/dev/pose/plank?view=nope&zoom=-2&focus=1,2')).toMatchObject({
      view: 'default',
      zoom: 1,
      focus: null,
    });
  });

  it('ignores other routes', () => {
    expect(parseDevPoseRoute('')).toBeNull();
    expect(parseDevPoseRoute('#/exercises/plank')).toBeNull();
    expect(parseDevPoseRoute('#/dev/pose/')).toBeNull();
    expect(parseDevPoseRoute('#/dev/pose/Bad_Id')).toBeNull();
  });
});
