// Decides what the eagle does next. This file has no Three.js and no DOM, so tests can run it
// without a browser, and a mini game can use it again.
import { boundsContains, boundsPoint, type Bounds } from '../lib/bounds';
import type { Random } from '../lib/rng';
import {
  facingVector,
  HOP_DURATION,
  TUNING,
  type Action,
  type BodyAction,
  type LookAction,
  type Pose,
} from './actions';

export interface Brain {
  /** The pose at the end of the current body action. */
  pose(): Pose;
  /** Sets new bounds, for example after a resize. */
  setBounds(bounds: Bounds): void;
  /** Moves the time forward by dt seconds. Returns the actions that start, in order. */
  update(dt: number): Action[];
}

interface Point {
  readonly x: number;
  readonly z: number;
}

/**
 * Wander: pick a goal in the bounds, turn toward it in 45° steps, and hop to it with short pauses.
 * At the goal, rest and look around, squawk, or pick a new goal.
 */
export function createBrain(random: Random, initialBounds: Bounds, start: Pose): Brain {
  let bounds = initialBounds;
  let { x, z, facing } = start;
  let goal: Point | null = null;
  /** A pause comes after each hop and each turn. */
  let pauseNext = false;
  /** True while the current body action is a rest. The head looks around only then. */
  let resting = false;
  let lookYaw = 0;
  let bodyLeft = 0;
  let lookLeft = Infinity;

  const between = (min: number, max: number): number => min + random() * (max - min);

  function rest(): BodyAction {
    resting = true;
    return { kind: 'idle', duration: between(TUNING.rest.min, TUNING.rest.max) };
  }

  function turn(step: 1 | -1): BodyAction {
    const to = facing + step;
    const action = { kind: 'turn', duration: HOP_DURATION, from: facing, to } as const;
    facing = (to + 8) % 8;
    pauseNext = true;
    return action;
  }

  function hop(toX: number, toZ: number): BodyAction {
    const action = { kind: 'hop', duration: HOP_DURATION, fromX: x, fromZ: z, toX, toZ } as const;
    x = toX;
    z = toZ;
    pauseNext = true;
    return action;
  }

  /** A random point in the bounds, far enough away. Null if no try finds one. */
  function newGoal(): Point | null {
    for (let i = 0; i < 8; i++) {
      const u = between(-bounds.halfU, bounds.halfU);
      const v = between(-bounds.halfV, bounds.halfV);
      const p = boundsPoint(bounds, u, v);
      if (Math.hypot(p.x - x, p.z - z) >= TUNING.goal.minDistance) return p;
    }
    return null;
  }

  /** With no goal: rest, squawk, or pick a new goal (then it returns null). */
  function choose(): BodyAction | null {
    const w = TUNING.weights;
    const r = random() * (w.rest + w.squawk + w.wander);
    if (r < w.rest) return rest();
    if (r < w.rest + w.squawk) return { kind: 'squawk', duration: TUNING.squawk.duration };
    goal = newGoal();
    return goal ? null : rest();
  }

  /** One step toward the goal: a turn or a hop. Null if the eagle is at the goal. */
  function moveToward(target: Point): BodyAction | null {
    const dx = target.x - x;
    const dz = target.z - z;
    if (Math.hypot(dx, dz) < TUNING.goal.arrive * TUNING.hop.length) return null;
    // The 45° step nearest to the direction of the goal. atan2(dx, dz) is 0 toward +z.
    const desired = (Math.round(Math.atan2(dx, dz) / (Math.PI / 4)) + 8) % 8;
    const diff = (desired - facing + 8) % 8;
    if (diff !== 0) return turn(diff < 4 ? 1 : diff > 4 ? -1 : random() < 0.5 ? 1 : -1);

    const step = facingVector(facing);
    const toX = x + step.x * TUNING.hop.length;
    const toZ = z + step.z * TUNING.hop.length;
    // Inside the bounds, a hop that would leave them becomes a turn. Outside (after a resize),
    // every hop goes toward the center, so it is allowed.
    if (boundsContains(bounds, x, z) && !boundsContains(bounds, toX, toZ)) {
      goal = null;
      return turn(random() < 0.5 ? 1 : -1);
    }
    return hop(toX, toZ);
  }

  function decide(): BodyAction {
    resting = false;
    if (pauseNext) {
      pauseNext = false;
      return { kind: 'idle', duration: between(TUNING.pause.min, TUNING.pause.max) };
    }
    // After a resize that leaves the eagle outside, go back to the center of the bounds.
    if (!boundsContains(bounds, x, z)) goal = { x: bounds.x, z: bounds.z };
    // Two tries: the first can end at the goal, and then the second starts from no goal.
    for (let attempt = 0; attempt < 2; attempt++) {
      if (!goal) {
        const action = choose();
        if (action) return action;
      }
      if (goal) {
        const move = moveToward(goal);
        if (move) return move;
        goal = null;
      }
    }
    return rest();
  }

  function look(): LookAction {
    const { maxYaw, minChange, maxRoll, hold } = TUNING.look;
    let yaw = lookYaw;
    for (let i = 0; i < 8 && Math.abs(yaw - lookYaw) < minChange; i++) {
      yaw = between(-maxYaw, maxYaw);
    }
    lookYaw = yaw;
    return {
      kind: 'look',
      duration: between(hold.min, hold.max),
      yaw,
      roll: between(-maxRoll, maxRoll),
    };
  }

  function update(dt: number): Action[] {
    const started: Action[] = [];
    bodyLeft -= dt;
    lookLeft -= dt;
    while (bodyLeft <= 0) {
      const action = decide();
      started.push(action);
      bodyLeft += action.duration;
      lookLeft = resting ? 0 : Infinity;
      // The animator turns the head forward for each action that is not a rest.
      if (!resting) lookYaw = 0;
    }
    while (lookLeft <= 0) {
      const action = look();
      started.push(action);
      lookLeft += action.duration;
    }
    return started;
  }

  return {
    pose: () => ({ x, z, facing }),
    setBounds: (next) => {
      bounds = next;
    },
    update,
  };
}
