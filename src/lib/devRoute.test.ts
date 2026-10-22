import { describe, expect, it } from 'vitest';
import { parseDevPoseRoute } from './devRoute.ts';

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
