import { describe, expect, it } from 'vitest';
import { boundsContains } from '../lib/bounds';
import { createRandom } from '../lib/rng';
import { ROOM_AZIMUTH, ROOM_BOUNDS, roomPoint } from '../lib/room';
import { ITEM_CLEARANCE, ITEMS } from '../room/items';
import { facingVector, TUNING, type Action, type Pose } from './actions';
import { createBrain, type Brain, type Obstacle } from './brain';

// The real room: its bounds, one obstacle for each item, and the start of main.ts.
const OBSTACLES: readonly Obstacle[] = ITEMS.map((item) => ({
  ...roomPoint(item.u, item.v),
  radius: ITEM_CLEARANCE,
}));
const START: Pose = { ...roomPoint(0, 0.6), facing: 2 };

const insideObstacle = (x: number, z: number): boolean =>
  OBSTACLES.some((o) => Math.hypot(x - o.x, z - o.z) < o.radius);

/** Time steps from 0.005 to 0.05 s, from their own seed, like a real frame loop. */
function steps(seed: number): () => number {
  const random = createRandom(seed);
  return () => 0.005 + random() * 0.045;
}

/** Runs a brain for `seconds` and returns the actions in order. */
function run(seed: number, seconds: number, dtSeed = 1): Action[] {
  const brain = createBrain(createRandom(seed), ROOM_BOUNDS, OBSTACLES, START);
  const nextDt = steps(dtSeed);
  const actions: Action[] = [];
  for (let t = 0; t < seconds;) {
    const dt = nextDt();
    t += dt;
    actions.push(...brain.update(dt));
  }
  return actions;
}

/**
 * Runs a brain for `seconds` and checks each action and each frame. Plain checks in the loop (an
 * expect for each step is too slow). Returns the first problem, the hop count, and the first
 * action.
 */
function check(
  brain: Brain,
  seconds: number,
  nextDt: () => number,
): { problem: string; hops: number; runs: number; first: Action | null } {
  let { x, z, facing } = brain.pose();
  let hops = 0;
  let runs = 0;
  let problem = '';
  let first: Action | null = null;
  // The current body action, and the frame time of the last look in the current rests.
  let body: Action | null = null;
  let lastLook = -Infinity;
  const isRest = (a: Action | null) => a?.kind === 'idle' && a.duration >= TUNING.rest.min;
  for (let t = 0; t < seconds && !problem;) {
    const dt = nextDt();
    t += dt;
    for (const action of brain.update(dt)) {
      first ??= action;
      if (!(action.duration > 0)) problem = `${action.kind} with duration ${action.duration}`;
      if (action.kind !== 'look') {
        // A rest after a rest keeps the head on its look. Other actions end the looks.
        if (!(isRest(action) && isRest(body))) lastLook = -Infinity;
        body = action;
      }
      if (action.kind === 'hop') {
        hops++;
        const step = facingVector(facing);
        const length = TUNING.hop.length;
        if (action.fromX !== x || action.fromZ !== z) problem = 'hop does not start at the pose';
        if (
          Math.abs(action.toX - x - step.x * length) > 1e-9 ||
          Math.abs(action.toZ - z - step.z * length) > 1e-9
        ) {
          problem = 'hop is not one hop length in the facing direction';
        }
        if (insideObstacle(action.toX, action.toZ)) problem = `hop into an obstacle at ${t}`;
        x = action.toX;
        z = action.toZ;
      } else if (action.kind === 'run') {
        runs++;
        if (action.fromX !== x || action.fromZ !== z) problem = 'run does not start at the pose';
        const step = facingVector(facing);
        const length = TUNING.hop.length;
        const count = Math.round(Math.hypot(action.toX - x, action.toZ - z) / length);
        if (count < TUNING.run.minHops) problem = `run of ${count} hops`;
        if (
          Math.abs(action.toX - x - step.x * length * count) > 1e-9 ||
          Math.abs(action.toZ - z - step.z * length * count) > 1e-9
        ) {
          problem = 'run is not a whole number of hops in the facing direction';
        }
        // Each hop point on the line fits, so the eagle runs over no item.
        for (let i = 1; i <= count; i++) {
          const px = x + step.x * length * i;
          const pz = z + step.z * length * i;
          if (insideObstacle(px, pz) || !boundsContains(ROOM_BOUNDS, px, pz)) {
            problem = `run over a point that does not fit at ${t}`;
          }
        }
        x = action.toX;
        z = action.toZ;
      } else if (action.kind === 'turn') {
        if (action.from !== facing || Math.abs(action.to - action.from) !== 1) {
          problem = `turn from ${action.from} to ${action.to} while facing ${facing}`;
        }
        facing = (action.to + 8) % 8;
      } else if (action.kind === 'look') {
        if (Math.abs(action.yaw) > TUNING.look.maxYaw) problem = `look yaw ${action.yaw}`;
        if (!isRest(body)) problem = `look during ${body?.kind ?? 'no action'}`;
        // The frame times can move each event by up to one step (0.05 s).
        if (t - lastLook < TUNING.look.hold.min - 0.1) {
          problem = `look held for only ${(t - lastLook).toFixed(2)} s`;
        }
        lastLook = t;
      }
    }
    const pose = brain.pose();
    if (pose.x !== x || pose.z !== z || pose.facing !== facing) problem = 'pose and actions differ';
    if (!Number.isInteger(pose.facing) || pose.facing < 0 || pose.facing > 7) {
      problem = `facing ${pose.facing}`;
    }
    if (!boundsContains(ROOM_BOUNDS, pose.x, pose.z)) problem = `outside at t = ${t.toFixed(2)}`;
  }
  return { problem, hops, runs, first };
}

describe('brain', () => {
  it('stays in the room, lands on no item, faces 45° steps, and wanders, for 50 seeds and 10 minutes', () => {
    // Each seed reports its first problem.
    const problems: string[] = [];
    let runs = 0;
    for (let seed = 1; seed <= 50; seed++) {
      const brain = createBrain(createRandom(seed), ROOM_BOUNDS, OBSTACLES, START);
      const result = check(brain, 600, steps(seed + 1000));
      let { problem } = result;
      const { hops } = result;
      runs += result.runs;
      // About 1.2 s for each hop and its pause (about 20 hops each minute in a simulation).
      // Rests, turns, and squawks take part of the time.
      if (!problem && hops <= 100) problem = `only ${hops} hops`;
      if (problem) problems.push(`seed ${seed}: ${problem}`);
    }
    expect(problems).toEqual([]);
    // Runs are rare, but they come.
    expect(runs).toBeGreaterThan(0);
  });

  it('gives the same actions for the same seed with different frame times', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const a = run(seed, 300, 1);
      const b = run(seed, 300, 2);
      // The two runs end at slightly different times, so compare all but the last few actions.
      const n = Math.min(a.length, b.length) - 3;
      expect(a.slice(0, n), `seed ${seed}`).toEqual(b.slice(0, n));
    }
    expect(run(7, 120)).not.toEqual(run(8, 120));
  });

  it('starts again with a pause after a restart at a visit spot, then follows the same rules', () => {
    // The visit spot of the item fe: 1.05 to the screen right of the item.
    const fe = ITEMS.find((item) => item.id === 'fe');
    if (!fe) throw new Error('No item fe.');
    const item = roomPoint(fe.u, fe.v);
    const spot: Pose = {
      x: item.x + 1.05 * Math.cos(ROOM_AZIMUTH),
      z: item.z - 1.05 * Math.sin(ROOM_AZIMUTH),
      facing: 0,
    };
    const problems: string[] = [];
    for (let seed = 1; seed <= 20; seed++) {
      const brain = createBrain(createRandom(seed), ROOM_BOUNDS, OBSTACLES, START);
      for (let t = 0; t < 20; t += 0.02) brain.update(0.02);
      brain.restart(spot);
      expect(brain.pose()).toEqual(spot);
      let { problem, hops, first } = check(brain, 600, steps(seed));
      if (!(first?.kind === 'idle' && first.duration < TUNING.rest.min)) {
        problem ||= `first action ${first?.kind} for ${first?.duration} s`;
      }
      if (!problem && hops <= 100) problem = `only ${hops} hops`;
      if (problem) problems.push(`seed ${seed}: ${problem}`);
    }
    expect(problems).toEqual([]);
  });
});
