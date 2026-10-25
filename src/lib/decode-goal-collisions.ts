export type DecodeGoalExclusionCollider = {
  id: "blue-goal" | "red-goal";
  position: readonly [number, number, number];
  rotationYRadians: number;
  halfExtents: readonly [number, number, number];
};

export type DecodeRampExclusionCollider = {
  id: string;
  kind: "rail" | "panel";
  position: readonly [number, number, number];
  rotation: readonly [number, number, number];
  halfExtents: readonly [number, number, number];
};

const GOAL_FACE_X_METERS = 1.4113;
const GOAL_FACE_Z_METERS = -1.4804;
const GOAL_FACE_YAW_RADIANS = 0.943;
const GOAL_ASSEMBLY_WIDTH_METERS = 0.73009;
const GOAL_ASSEMBLY_TOP_METERS = 1.36525;
const GOAL_BLOCKER_HALF_DEPTH_METERS = 0.04;

export const DECODE_GOAL_EXCLUSION_COLLIDERS: readonly DecodeGoalExclusionCollider[] = [
  {
    id: "blue-goal",
    position: [-GOAL_FACE_X_METERS, GOAL_ASSEMBLY_TOP_METERS / 2, GOAL_FACE_Z_METERS],
    rotationYRadians: GOAL_FACE_YAW_RADIANS,
    halfExtents: [
      GOAL_ASSEMBLY_WIDTH_METERS / 2,
      GOAL_ASSEMBLY_TOP_METERS / 2,
      GOAL_BLOCKER_HALF_DEPTH_METERS,
    ],
  },
  {
    id: "red-goal",
    position: [GOAL_FACE_X_METERS, GOAL_ASSEMBLY_TOP_METERS / 2, GOAL_FACE_Z_METERS],
    rotationYRadians: -GOAL_FACE_YAW_RADIANS,
    halfExtents: [
      GOAL_ASSEMBLY_WIDTH_METERS / 2,
      GOAL_ASSEMBLY_TOP_METERS / 2,
      GOAL_BLOCKER_HALF_DEPTH_METERS,
    ],
  },
];

const RAMP_RAIL_PITCH_RADIANS = 0.2617454149;
const RAMP_ONE_HOLE_PITCH_RADIANS = 0.2617877957;

/**
 * Solid collision stand-ins measured from the supplied DECODE STEP assembly.
 * The visual/collision GLB retains the complete CAD, while these primitives
 * make its narrow paired return rails and blocker sheets reliable under CCD.
 */
export const DECODE_RAMP_EXCLUSION_COLLIDERS: readonly DecodeRampExclusionCollider[] = [
  ...([-1, 1] as const).flatMap((side) => {
    const alliance = side < 0 ? "blue" : "red";
    return [
      {
        id: `${alliance}-return-rail-inner`,
        kind: "rail" as const,
        position: [side * 1.6380801432, 0.299262845, -0.5400886102] as const,
        rotation: [RAMP_RAIL_PITCH_RADIANS, 0, 0] as const,
        halfExtents: [0.0168924388, 0.0127, 0.5760179858] as const,
      },
      {
        id: `${alliance}-return-rail-outer`,
        kind: "rail" as const,
        position: [side * 1.7523801432, 0.299262845, -0.5400886102] as const,
        rotation: [RAMP_RAIL_PITCH_RADIANS, 0, 0] as const,
        halfExtents: [0.0168924388, 0.0127, 0.5760179858] as const,
      },
      {
        id: `${alliance}-return-guard-lower`,
        kind: "rail" as const,
        position: [side * 1.76635, 0.3551031056, -0.5253] as const,
        rotation: [RAMP_ONE_HOLE_PITCH_RADIANS, 0, 0] as const,
        halfExtents: [0.00762, 0.0127, 0.5734376952] as const,
      },
      {
        id: `${alliance}-return-guard-upper-inner`,
        kind: "rail" as const,
        position: [side * 1.62411, 0.4777743508, -0.492425] as const,
        rotation: [RAMP_ONE_HOLE_PITCH_RADIANS, 0, 0] as const,
        halfExtents: [0.00635, 0.0127, 0.573463577] as const,
      },
      {
        id: `${alliance}-return-guard-upper-outer`,
        kind: "rail" as const,
        position: [side * 1.765085, 0.4777743508, -0.492425] as const,
        rotation: [RAMP_ONE_HOLE_PITCH_RADIANS, 0, 0] as const,
        halfExtents: [0.00762, 0.0127, 0.573463577] as const,
      },
      {
        id: `${alliance}-return-blocker-main`,
        kind: "panel" as const,
        position: [side * 1.6072991432, 0.2528379532, -0.9267026389] as const,
        rotation: [0, 0, 0] as const,
        halfExtents: [0.015, 0.2517639627, 0.2953341332] as const,
      },
      {
        id: `${alliance}-return-blocker-lower`,
        kind: "panel" as const,
        position: [side * 1.6072991432, 0.1933139149, -0.3072996054] as const,
        rotation: [0, 0, 0] as const,
        halfExtents: [0.015, 0.1922399149, 0.3240689004] as const,
      },
    ];
  }),
];
