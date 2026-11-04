// Decides what the eagle does next. This file has no Three.js and no DOM, so tests can run it
// without a browser, and a mini game can use it again.
import { boundsContains, type Bounds } from '../lib/bounds';
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
  /** Moves the time forward by dt seconds. Returns the actions that start, in order. */
  update(dt: number): Action[];
  /**
   * Starts again from a new pose, with no goal and a pause first. The facing of the pose must be
   * a whole 45° step. A visit calls it when the eagle wanders again.
   */
  restart(pose: Pose): void;
}

/** A circle on the ground that the eagle does not land in, for example an item. */
export interface Obstacle {
  readonly x: number;
  readonly z: number;
  readonly radius: number;
}

interface Point {
  readonly x: number;
  readonly z: number;
}

/** A goal at the end of a straight line. `loose`: its hops only need to stay in the bounds. */
interface Goal extends Point {
  readonly loose: boolean;
}

/**
 * Wander: pick a goal in the bounds, turn toward it in 45° steps, and hop to it with short pauses.
 * At the goal, rest and look around, squawk, or pick a new goal. No hop lands outside the bounds.
 * No hop lands inside an obstacle, but for the way out when the eagle stands in one.
 */
export function createBrain(
  random: Random,
  bounds: Bounds,
  obstacles: readonly Obstacle[],
  start: Pose,
): Brain {
  let { x, z, facing } = start;
  let goal: Goal | null = null;
  /** A pause comes after each hop and each turn. */
  let pauseNext = false;
  /** True while the current body action is a rest. The head looks around only then. */
  let resting = false;
  let lookYaw = 0;
  let bodyLeft = 0;
  let lookLeft = Infinity;

  /** True if the point (px, pz) is outside every obstacle. */
  const clear = (px: number, pz: number): boolean =>
    obstacles.every((o) => Math.hypot(px - o.x, pz - o.z) >= o.radius);
  /** True if a hop can land on the point (px, pz). */
  const fits = (px: number, pz: number): boolean => boundsContains(bounds, px, pz) && clear(px, pz);
  const inBounds = (px: number, pz: number): boolean => boundsContains(bounds, px, pz);

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

  /**
   * A goal a whole number of hops away in a straight line, so the eagle does not turn on the
   * way. Mostly straight on (TUNING.goal.turn). Each hop on the line fits: inside the bounds and
   * outside every obstacle. Null if no line fits.
   *
   * The person can move the items, so the eagle can stand in an item circle with no line that
   * fits. Then a loose line, which only stays in the bounds, takes it out. It ends outside every
   * circle if it can. In a very big crowd, it only moves on.
   */
  function newGoal(): Goal | null {
    if (clear(x, z)) return lineGoal(fits, false, false);
    return (
      lineGoal(fits, false, false) ??
      lineGoal(inBounds, true, true) ??
      lineGoal(inBounds, true, false)
    );
  }

  function lineGoal(
    ok: (px: number, pz: number) => boolean,
    loose: boolean,
    clearEnd: boolean,
  ): Goal | null {
    const { hops, turn } = TUNING.goal;
    const length = TUNING.hop.length;
    // The weight of each turn size, from 0 to 4 steps. The two sides share the weight.
    const weights = [turn.none, turn.one / 2, turn.two / 2, 0, 0];
    // For each direction: the hop counts that a goal can have.
    const options: { facing: number; counts: number[]; weight: number }[] = [];
    for (let d = -3; d <= 4; d++) {
      const direction = (facing + d + 8) % 8;
      const step = facingVector(direction);
      let fit = 0;
      while (
        fit < hops.max &&
        ok(x + step.x * length * (fit + 1), z + step.z * length * (fit + 1))
      ) {
        fit++;
      }
      const counts: number[] = [];
      for (let count = hops.min; count <= fit; count++) {
        if (!clearEnd || clear(x + step.x * length * count, z + step.z * length * count)) {
          counts.push(count);
        }
      }
      if (counts.length > 0) {
        options.push({ facing: direction, counts, weight: weights[Math.abs(d)] ?? 0 });
      }
    }
    const first = options[0];
    if (!first) return null;
    // If no direction with a weight fits, each direction that fits has the same chance.
    const total = options.reduce((sum, o) => sum + o.weight, 0);
    let r = random() * (total > 0 ? total : options.length);
    let pick = first;
    for (const option of options) {
      r -= total > 0 ? option.weight : 1;
      if (r < 0) {
        pick = option;
        break;
      }
    }
    const count = pick.counts[Math.floor(random() * pick.counts.length)] ?? hops.min;
    const step = facingVector(pick.facing);
    return { x: x + step.x * length * count, z: z + step.z * length * count, loose };
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
  function moveToward(target: Goal): BodyAction | null {
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
    // A hop that does not fit becomes a turn, and the goal is dropped.
    if (!(target.loose ? inBounds : fits)(toX, toZ)) {
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
    // Handle the events in time order, at their exact times. Then the frame times cannot change
    // the order of the random numbers, and a seed replays the same moves.
    while (bodyLeft <= 0 || lookLeft <= 0) {
      if (lookLeft < bodyLeft) {
        const action = look();
        started.push(action);
        lookLeft += action.duration;
        continue;
      }
      const wasResting = resting;
      // bodyLeft is 0 or less: the new action started that many seconds ago.
      const startedAt = bodyLeft;
      const action = decide();
      started.push(action);
      bodyLeft += action.duration;
      if (!resting) {
        lookLeft = Infinity;
        // The animator turns the head forward for each action that is not a rest.
        lookYaw = 0;
      } else if (!wasResting) {
        // The first look starts with the rest. A rest after a rest keeps the current look.
        lookLeft = startedAt;
      }
    }
    return started;
  }

  function restart(pose: Pose): void {
    ({ x, z, facing } = pose);
    goal = null;
    pauseNext = true;
    resting = false;
    lookYaw = 0;
    // The pause starts at the next update.
    bodyLeft = 0;
    lookLeft = Infinity;
  }

  return { pose: () => ({ x, z, facing }), update, restart };
}
