/**
 * Body dimensions of the 3D figure, in metres.
 *
 * Rest pose (every joint rotation zero): standing upright, facing +z, y up,
 * feet flat on y = 0, arms hanging at the sides with the palms facing the
 * thighs. The figure's left is +x. Proportions follow a ~1.78 m adult
 * (about 8 heads tall).
 *
 * Every limb bone extends along its local −y axis; local +x is the hinge axis
 * of the elbow / knee (pointing to the figure's left in the rest pose) and
 * local +z points forward.
 */

export const FIGURE_HEIGHT = 1.78;

/** Height of the pelvis joint (the root of the skeleton) when standing. */
export const STANDING_PELVIS_HEIGHT = 0.98;

/** Pelvis → spine (lumbar) joint. */
export const SPINE_OFFSET = { x: 0, y: 0.1, z: -0.005 } as const;
/** Spine → chest (thoracic) joint. */
export const CHEST_OFFSET = { x: 0, y: 0.17, z: 0 } as const;
/** Chest → neck (base of the neck). */
export const NECK_OFFSET = { x: 0, y: 0.235, z: -0.02 } as const;
/** Neck → head joint (base of the skull). */
export const HEAD_OFFSET = { x: 0, y: 0.09, z: 0.012 } as const;
/** Head joint → top of the head. */
export const HEAD_TOP = 0.205;

/** Chest → left shoulder joint (mirror x for the right shoulder). */
export const SHOULDER_OFFSET = { x: 0.18, y: 0.19, z: -0.012 } as const;
/** Shoulder → elbow. */
export const UPPER_ARM_LENGTH = 0.29;
/** Elbow → wrist. */
export const FOREARM_LENGTH = 0.255;
/**
 * Wrist → grip point: the centre of the closed fist, where a bar or handle
 * passes. Hand IK targets are grip points.
 */
export const GRIP_OFFSET = 0.078;
/** Wrist → fingertips. */
export const HAND_LENGTH = 0.185;
/** Height of the wrist joint above the surface when the hand lies flat (palm down). */
export const FLAT_HAND_WRIST_HEIGHT = 0.026;
/** Distance along the surface from the wrist to the palm centre of a flat hand. */
export const FLAT_HAND_PALM_OFFSET = 0.06;

/** Pelvis → left hip joint (mirror x for the right hip). */
export const HIP_OFFSET = { x: 0.088, y: -0.05, z: 0 } as const;
/** Hip → knee. */
export const THIGH_LENGTH = 0.43;
/** Knee → ankle. */
export const SHIN_LENGTH = 0.43;
/** Height of the ankle joint above the sole. */
export const ANKLE_HEIGHT = 0.07;
/**
 * Distance along the foot from the ankle to the ball of the foot (below the
 * toe joints). Foot IK targets are the ball of the foot, on the sole.
 */
export const BALL_OFFSET = 0.145;
/** The toe joint (ball of the foot, just above the sole) in the ankle's frame. */
export const TOE_JOINT = { x: 0, y: -0.058, z: BALL_OFFSET } as const;
/** Distance along the foot from the ankle to the back of the heel. */
export const HEEL_OFFSET = 0.06;
/** Distance along the foot from the ankle to the tip of the toes. */
export const TOE_OFFSET = 0.2;

/** Longest reach from the shoulder joint to the grip point (straight arm). */
export const ARM_REACH = UPPER_ARM_LENGTH + FOREARM_LENGTH + GRIP_OFFSET;
/** Longest reach from the hip joint to the ankle joint (straight leg). */
export const LEG_REACH = THIGH_LENGTH + SHIN_LENGTH;

/**
 * Below this height a hand target that holds nothing is treated as resting
 * flat on the floor (palm down), and a foot target as standing on the floor.
 */
export const FLOOR_CONTACT_HEIGHT = 0.03;
