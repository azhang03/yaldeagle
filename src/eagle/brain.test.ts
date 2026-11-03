import { describe, expect, it } from 'vitest';
import { boundsContains, type Bounds } from '../lib/bounds';
import { createRandom } from '../lib/rng';
import { ROOM_BOUNDS } from '../lib/room';
import { facingVector, TUNING, type Action } from './actions';
import { createBrain } from './brain';

// The room bounds, and small bounds that leave few lines that fit.
const SMALL: Bounds = { ...ROOM_BOUNDS, halfU: 2, halfV: 3 };

/** Time steps from 0.005 to 0.05 s, from their own seed, like a real frame loop. */
function steps(seed: number): () => number {
  const random = createRandom(seed);
  return () => 0.005 + random() * 0.045;
}

/** Runs a brain for `seconds` and returns the actions in order. */
function run(seed: number, bounds: Bounds, seconds: number, dtSeed = 1): Action[] {
  const brain = createBrain(createRandom(seed), bounds, { x: bounds.x, z: bounds.z, facing: 2 });
  const nextDt = steps(dtSeed);
  const actions: Action[] = [];
  for (let t = 0; t < seconds;) {
    const dt = nextDt();
    t += dt;
    actions.push(...brain.update(dt));
  }
  return actions;
}

describe('brain', () => {
  it('stays in the bounds, faces 45° steps, and wanders, for 50 seeds and 10 minutes', () => {
    // Plain checks in the loop (an expect for each step is too slow). Each seed reports its first
    // problem.
    const problems: string[] = [];
    for (let seed = 1; seed <= 50; seed++) {
      const bounds = seed % 2 ? ROOM_BOUNDS : SMALL;
      const brain = createBrain(createRandom(seed), bounds, {
        x: bounds.x,
        z: bounds.z,
        facing: 2,
      });
      const nextDt = steps(seed + 1000);
      let { x, z, facing } = brain.pose();
      let hops = 0;
      let problem = '';
      // The current body action, and the frame time of the last look in the current rests.
      let body: Action | null = null;
      let lastLook = -Infinity;
      const isRest = (a: Action | null) => a?.kind === 'idle' && a.duration >= TUNING.rest.min;
      for (let t = 0; t < 600 && !problem;) {
        const dt = nextDt();
        t += dt;
        for (const action of brain.update(dt)) {
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
            if (action.fromX !== x || action.fromZ !== z)
              problem = 'hop does not start at the pose';
            if (
              Math.abs(action.toX - x - step.x * length) > 1e-9 ||
              Math.abs(action.toZ - z - step.z * length) > 1e-9
            ) {
              problem = 'hop is not one hop length in the facing direction';
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
        if (pose.x !== x || pose.z !== z || pose.facing !== facing)
          problem = 'pose and actions differ';
        if (!Number.isInteger(pose.facing) || pose.facing < 0 || pose.facing > 7) {
          problem = `facing ${pose.facing}`;
        }
        if (!boundsContains(bounds, pose.x, pose.z)) problem = `outside at t = ${t.toFixed(2)}`;
      }
      // About 1.2 s for each hop and its pause (about 20 hops each minute in a simulation).
      // Rests, turns, and squawks take part of the time.
      if (!problem && hops <= 100) problem = `only ${hops} hops`;
      if (problem) problems.push(`seed ${seed}: ${problem}`);
    }
    expect(problems).toEqual([]);
  });

  it('gives the same actions for the same seed with different frame times', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const a = run(seed, ROOM_BOUNDS, 300, 1);
      const b = run(seed, ROOM_BOUNDS, 300, 2);
      // The two runs end at slightly different times, so compare all but the last few actions.
      const n = Math.min(a.length, b.length) - 3;
      expect(a.slice(0, n), `seed ${seed}`).toEqual(b.slice(0, n));
    }
    expect(run(7, ROOM_BOUNDS, 120)).not.toEqual(run(8, ROOM_BOUNDS, 120));
  });

  it('comes back into the bounds after they shrink with the eagle outside', () => {
    for (let seed = 1; seed <= 50; seed++) {
      const brain = createBrain(createRandom(seed), ROOM_BOUNDS, {
        x: ROOM_BOUNDS.x,
        z: ROOM_BOUNDS.z,
        facing: 2,
      });
      const nextDt = steps(seed);
      for (let t = 0; t < 20; t += 0.02) brain.update(0.02);

      // Small bounds 3.5 units away from the eagle.
      const { x, z } = brain.pose();
      const small: Bounds = { ...ROOM_BOUNDS, x: x + 3, z: z + 1.8, halfU: 0.6, halfV: 0.6 };
      brain.setBounds(small);
      expect(boundsContains(small, x, z)).toBe(false);

      let back = -1;
      for (let t = 0; t < 20;) {
        const dt = nextDt();
        t += dt;
        brain.update(dt);
        const pose = brain.pose();
        if (boundsContains(small, pose.x, pose.z)) {
          back = t;
          break;
        }
      }
      expect(back, `seed ${seed}`).toBeGreaterThan(0);

      // When it is back, it stays inside.
      for (let t = 0; t < 60; t += 0.02) {
        brain.update(0.02);
        const pose = brain.pose();
        expect(boundsContains(small, pose.x, pose.z), `seed ${seed}`).toBe(true);
      }
    }
  });
});
