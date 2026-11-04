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
     * direction counts only if all its hops fit: inside the bounds and outside every obstacle.
     * If none of these fit, each direction that fits has the same chance.
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
  /**
   * The run (R6 "Long-stride charge") to a point that the person clicks on the floor. Speed in
   * units each second. The start and the stop are the times (seconds) to reach the full speed
   * and to stop again. A short run has a shorter start and stop.
   */
  run: { speed: 2.6, start: 0.25, stop: 0.3 },
  /** The actions of a visit. The brain does not choose them. */
  visit: {
    /** The time of a quick turn to a free angle. */
    face: 0.24,
    /** The height of the small hop in that turn. */
    faceHop: 0.12,
    /** A jump takes jumpBase + jumpPerUnit × distance seconds. */
    jumpBase: 0.55,
    jumpPerUnit: 0.1,
    /** The head gestures. */
    tilt: 0.8,
    shake: 0.75,
  },
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

/** A flap jump from one point to another, over the items. Visits only. */
export interface JumpAction {
  readonly kind: 'jump';
  readonly duration: number;
  readonly fromX: number;
  readonly fromZ: number;
  readonly toX: number;
  readonly toZ: number;
}

/**
 * A quick turn to a free angle with a small hop. Visits only. `from` and `to` are yaw angles in
 * radians, and `to` is already on the short way from `from`.
 */
export interface FaceAction {
  readonly kind: 'face';
  readonly duration: number;
  readonly from: number;
  readonly to: number;
}

/** The head tilts and dips, and comes back. Visits only. */
export interface TiltAction {
  readonly kind: 'tilt';
  readonly duration: number;
}

/** The head shakes "no", smaller each time. Visits only. */
export interface ShakeAction {
  readonly kind: 'shake';
  readonly duration: number;
}

/** One hop with no move. Visits only. */
export interface HopInPlaceAction {
  readonly kind: 'hopInPlace';
  readonly duration: number;
}

/**
 * A run in a straight line. The speed rises over `start` seconds, holds, and falls over `stop`
 * seconds, so the eagle reaches the end point at the end of the duration.
 */
export interface RunAction {
  readonly kind: 'run';
  readonly duration: number;
  readonly fromX: number;
  readonly fromZ: number;
  readonly toX: number;
  readonly toZ: number;
  readonly start: number;
  readonly stop: number;
}

export type BodyAction =
  | IdleAction
  | HopAction
  | TurnAction
  | SquawkAction
  | JumpAction
  | FaceAction
  | TiltAction
  | ShakeAction
  | HopInPlaceAction
  | RunAction;

/**
 * A run between two points at TUNING.run.speed, with a start and a stop. A run too short for the
 * full start and stop gets a shorter start and stop, so it never goes past the full speed.
 */
export function runAction(
  from: { readonly x: number; readonly z: number },
  to: { readonly x: number; readonly z: number },
): RunAction {
  const { speed } = TUNING.run;
  const distance = Math.hypot(to.x - from.x, to.z - from.z);
  // The start and the stop use half the full speed on average. They fit in the run only if they
  // use at most the whole distance.
  const fit = Math.min(1, distance / speed / ((TUNING.run.start + TUNING.run.stop) / 2));
  const start = TUNING.run.start * fit;
  const stop = TUNING.run.stop * fit;
  return {
    kind: 'run',
    duration: distance / speed + (start + stop) / 2,
    fromX: from.x,
    fromZ: from.z,
    toX: to.x,
    toZ: to.z,
    start,
    stop,
  };
}

/** A jump between two points. A longer jump takes more time. */
export function jumpAction(
  from: { readonly x: number; readonly z: number },
  to: { readonly x: number; readonly z: number },
): JumpAction {
  const distance = Math.hypot(to.x - from.x, to.z - from.z);
  const { jumpBase, jumpPerUnit } = TUNING.visit;
  return {
    kind: 'jump',
    duration: jumpBase + jumpPerUnit * distance,
    fromX: from.x,
    fromZ: from.z,
    toX: to.x,
    toZ: to.z,
  };
}

/** A turn from one yaw to another, the short way. */
export function faceAction(
  fromYaw: number,
  toYaw: number,
  duration = TUNING.visit.face,
): FaceAction {
  const to = fromYaw + Math.atan2(Math.sin(toYaw - fromYaw), Math.cos(toYaw - fromYaw));
  return { kind: 'face', duration, from: fromYaw, to };
}

/** A head action. It shows only while the body is idle. */
export interface LookAction {
  readonly kind: 'look';
  readonly duration: number;
  /** Radians. A positive yaw turns the head to the eagle's left. */
  readonly yaw: number;
  readonly roll: number;
}

export type Action = BodyAction | LookAction;
