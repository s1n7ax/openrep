import * as z from 'zod';
import { idSchema } from './common';

/**
 * Coordinate system of animation files: metres, y up, the figure faces +z and
 * stands with its feet on y = 0. Rotations are Euler angles in degrees, applied
 * in X, Y, Z order.
 */
export const vec3Schema = z.tuple([z.number(), z.number(), z.number()]);
export type Vec3 = z.infer<typeof vec3Schema>;

const positionSchema = vec3Schema.meta({ description: '[x, y, z] in metres.' });
const rotationSchema = vec3Schema.meta({
  description: 'Euler angles [x, y, z] in degrees, applied in X, Y, Z order.',
});

export const PROP_TYPES = [
  'barbell',
  'ez-bar',
  'dumbbell',
  'kettlebell',
  'bench',
  'incline-bench',
  'cable-handle',
  'rope-handle',
  'lat-bar',
  'pull-up-bar',
  'dip-bars',
  'leg-press',
  'leg-extension',
  'leg-curl',
  'mat',
] as const;
export const propTypeSchema = z.enum(PROP_TYPES);
export type PropType = z.infer<typeof propTypeSchema>;

export const PROP_ATTACHMENTS = [
  'none',
  'hands',
  'leftHand',
  'rightHand',
  'feet',
  'leftFoot',
  'rightFoot',
] as const;
export const propAttachSchema = z.enum(PROP_ATTACHMENTS);
export type PropAttach = z.infer<typeof propAttachSchema>;

export const propSchema = z.strictObject({
  type: propTypeSchema,
  attach: propAttachSchema.meta({
    description:
      '"none" places the prop in the world; otherwise it follows the hand(s) or foot/feet. ' +
      '"hands"/"feet" centre the prop between both hands/feet.',
  }),
  position: positionSchema
    .optional()
    .meta({ description: 'World position (attach "none") or offset from the attachment point.' }),
  rotation: rotationSchema.optional(),
  cableFrom: positionSchema
    .optional()
    .meta({ description: 'World point a cable is drawn from to this prop (cable machines).' }),
});
export type Prop = z.infer<typeof propSchema>;

export const ikTargetSchema = z.strictObject({
  target: positionSchema.meta({ description: 'Where the hand or foot should be.' }),
  pole: positionSchema.optional().meta({ description: 'Point the elbow or knee bends towards.' }),
});
export type IkTarget = z.infer<typeof ikTargetSchema>;

/** Each limb is driven either by an IK target or by FK joint angles. */
export const LIMBS = {
  leftArm: { ik: 'leftHand', fk: ['leftShoulder', 'leftElbow', 'leftWrist'] },
  rightArm: { ik: 'rightHand', fk: ['rightShoulder', 'rightElbow', 'rightWrist'] },
  leftLeg: { ik: 'leftFoot', fk: ['leftHip', 'leftKnee', 'leftAnkle'] },
  rightLeg: { ik: 'rightFoot', fk: ['rightHip', 'rightKnee', 'rightAnkle'] },
} as const;

export const poseSchema = z
  .strictObject({
    pelvis: z.strictObject({ position: positionSchema, rotation: rotationSchema }),
    spine: rotationSchema.optional(),
    chest: rotationSchema.optional(),
    neck: rotationSchema.optional(),
    head: rotationSchema.optional(),
    leftHand: ikTargetSchema.optional(),
    rightHand: ikTargetSchema.optional(),
    leftFoot: ikTargetSchema.optional(),
    rightFoot: ikTargetSchema.optional(),
    leftShoulder: rotationSchema.optional(),
    leftElbow: rotationSchema.optional(),
    leftWrist: rotationSchema.optional(),
    rightShoulder: rotationSchema.optional(),
    rightElbow: rotationSchema.optional(),
    rightWrist: rotationSchema.optional(),
    leftHip: rotationSchema.optional(),
    leftKnee: rotationSchema.optional(),
    leftAnkle: rotationSchema.optional(),
    rightHip: rotationSchema.optional(),
    rightKnee: rotationSchema.optional(),
    rightAnkle: rotationSchema.optional(),
  })
  .superRefine((pose, ctx) => {
    for (const { ik, fk } of Object.values(LIMBS)) {
      if (pose[ik] === undefined) continue;
      for (const joint of fk) {
        if (pose[joint] !== undefined) {
          ctx.addIssue({
            code: 'custom',
            message: `"${joint}" cannot be combined with the IK target "${ik}"; use one or the other`,
            path: [joint],
          });
        }
      }
    }
  });
export type Pose = z.infer<typeof poseSchema>;

export const EASINGS = ['linear', 'easeIn', 'easeOut', 'easeInOut'] as const;
export const easeSchema = z.enum(EASINGS);
export type Ease = z.infer<typeof easeSchema>;

export const keyframeSchema = z.strictObject({
  t: z.number().min(0).max(1).meta({ description: 'Time in the loop, from 0 to 1.' }),
  ease: easeSchema
    .optional()
    .meta({ description: 'Easing from this keyframe to the next one. Default "easeInOut".' }),
  pose: poseSchema,
});
export type Keyframe = z.infer<typeof keyframeSchema>;

/** Version 1 of an animation file: `data/animations/<exerciseId>.json`. */
export const animationSchema = z
  .strictObject({
    formatVersion: z.literal(1),
    exerciseId: idSchema,
    durationSec: z
      .number()
      .positive()
      .max(60)
      .meta({ description: 'Length of one repetition (one loop), in seconds.' }),
    camera: z
      .strictObject({ position: positionSchema, target: positionSchema })
      .optional()
      .meta({ description: 'Initial camera; default is a 3/4 front view.' }),
    props: z.array(propSchema),
    keyframes: z
      .array(keyframeSchema)
      .min(2)
      .meta({
        description:
          'Poses over one loop; "t" increases strictly from 0 (first) to 1 (last). ' +
          'The pose at t = 1 should equal the pose at t = 0 for a smooth loop.',
      }),
  })
  .superRefine((animation, ctx) => {
    const { keyframes } = animation;
    if (keyframes.length === 0) return;
    if (keyframes[0]?.t !== 0) {
      ctx.addIssue({
        code: 'custom',
        message: 'the first keyframe must have t = 0',
        path: ['keyframes', 0, 't'],
      });
    }
    const lastIndex = keyframes.length - 1;
    if (keyframes[lastIndex]?.t !== 1) {
      ctx.addIssue({
        code: 'custom',
        message: 'the last keyframe must have t = 1',
        path: ['keyframes', lastIndex, 't'],
      });
    }
    for (let i = 1; i < keyframes.length; i++) {
      const previous = keyframes[i - 1];
      const current = keyframes[i];
      if (previous && current && current.t <= previous.t) {
        ctx.addIssue({
          code: 'custom',
          message: 't must increase strictly from one keyframe to the next',
          path: ['keyframes', i, 't'],
        });
      }
    }
    for (const { ik } of Object.values(LIMBS)) {
      const withTarget = keyframes.filter((keyframe) => keyframe.pose[ik] !== undefined).length;
      if (withTarget > 0 && withTarget < keyframes.length) {
        ctx.addIssue({
          code: 'custom',
          message: `"${ik}" must have an IK target in every keyframe or in none`,
          path: ['keyframes'],
        });
      }
    }
  })
  .meta({
    title: 'OpenRep animation (v1)',
    description:
      'One looping movement: data/animations/<exerciseId>.json. Metres, y up, the figure faces ' +
      '+z with its feet on y = 0. Also checked by `npm run validate:data`: the file name equals ' +
      'exerciseId, the exercise exists, keyframe t runs strictly from 0 to 1, and each limb uses ' +
      'either an IK target (in every keyframe) or FK angles.',
  });
export type Animation = z.infer<typeof animationSchema>;
