// The actions that the brain chooses and the animator plays, and the values that control them.
// This file has no Three.js and no DOM.

/** All timings (seconds), lengths (world units), and weights of the behavior, in one place. */
export const TUNING = {
  hop: {
    /** The distance of one hop. */
    length: 0.5,
    /** The three parts of a hop or a turn: crouch, air, land. */
    crouch: 0.09,
    air: 0.3,
    land: 0.16,
  },
  /** A short stop after each hop and turn. */
  pause: { min: 0.3, max: 0.9 },
  /** A long stop at a goal, with the head looking around. */
  rest: { min: 1.5, max: 4 },
  squawk: { duration: 0.75 },
  look: {
    /** The head turns to an angle within ±maxYaw (radians). */
    maxYaw: (75 * Math.PI) / 180,
    /** A new look turns the head by at least this angle (radians). */
    minChange: 0.35,
    /** The largest tilt of the head (radians). */
    maxRoll: 0.15,
    hold: { min: 0.5, max: 2.3 },
  },
  goal: {
    /** A new goal is a whole number of hops away, in a straight line. */
    hops: { min: 2, max: 6 },
    /**
     * The chance of each new direction: straight on, one 45° step to a side, or two steps. A
     * direction counts only if all its hops stay in the bounds. If none of these fit, each
     * direction that fits has the same chance.
     */
    turn: { none: 0.6, one: 0.3, two: 0.1 },
    /**
     * The eagle is at the goal when it is nearer than this many hop lengths. It must be more than
     * about 0.54: a hop can point 22.5° away from the goal, and then a shorter distance can grow.
     */
    arrive: 0.6,
  },
  /** What the eagle does when it has no goal. */
  weights: { rest: 0.5, squawk: 0.2, wander: 0.3 },
} as const;

/** The duration of a hop or a turn. */
export const HOP_DURATION = TUNING.hop.crouch + TUNING.hop.air + TUNING.hop.land;

/**
 * The facing is a whole number of 45° steps around y, from 0 to 7. Step 0 faces +z. Step 2 faces
 * +x.
 */
export function facingAngle(facing: number): number {
  return (facing * Math.PI) / 4;
}

/** The unit vector on the ground for a facing. */
export function facingVector(facing: number): { x: number; z: number } {
  const angle = facingAngle(facing);
  return { x: Math.sin(angle), z: Math.cos(angle) };
}

/** Where the eagle is and where it faces. */
export interface Pose {
  readonly x: number;
  readonly z: number;
  readonly facing: number;
}

/** Stand and breathe. */
export interface IdleAction {
  readonly kind: 'idle';
  readonly duration: number;
}

/** One hop forward, from one ground point to the next. */
export interface HopAction {
  readonly kind: 'hop';
  readonly duration: number;
  readonly fromX: number;
  readonly fromZ: number;
  readonly toX: number;
  readonly toZ: number;
}

/**
 * A hop in place that turns by one 45° step. `to` is `from` plus or minus 1. It can be -1 or 8,
 * so the animator turns the short way.
 */
export interface TurnAction {
  readonly kind: 'turn';
  readonly duration: number;
  readonly from: number;
  readonly to: number;
}

/** Head up and beak open. */
export interface SquawkAction {
  readonly kind: 'squawk';
  readonly duration: number;
}

export type BodyAction = IdleAction | HopAction | TurnAction | SquawkAction;

/** A head action. It shows only while the body is idle. */
export interface LookAction {
  readonly kind: 'look';
  readonly duration: number;
  /** Radians. A positive yaw turns the head to the eagle's left. */
  readonly yaw: number;
  readonly roll: number;
}

export type Action = BodyAction | LookAction;
