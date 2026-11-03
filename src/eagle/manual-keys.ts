// Keys that start each action by hand, for development: H hop, T turn left, Shift+T turn right,
// S squawk, L look, and the visit actions: J jump 2 units forward, F face a random angle, G gaze
// on or off, I tilt, N shake. The keys do not check the bounds or the items.
import {
  faceAction,
  facingAngle,
  facingVector,
  HOP_DURATION,
  jumpAction,
  TUNING,
  type Action,
  type Pose,
} from './actions';
import type { Animator } from './animator';

/** The gaze of the close view: the head turns toward the item. */
const GAZE = -0.85;

export function startManualKeys(animator: Animator, start: Pose, random: () => number): void {
  // The pose at the end of the last action. `facing` is the 45° step for hops and turns.
  let { x, z, yaw } = animator.pose();
  let facing = start.facing;
  let gaze = false;

  // event.code names the physical key, so Caps Lock and the keyboard layout do not matter.
  function act(code: string, shift: boolean): Action | null {
    switch (code) {
      case 'KeyH': {
        const step = facingVector(facing);
        const toX = x + step.x * TUNING.hop.length;
        const toZ = z + step.z * TUNING.hop.length;
        const hop = { kind: 'hop', duration: HOP_DURATION, fromX: x, fromZ: z, toX, toZ } as const;
        x = toX;
        z = toZ;
        return hop;
      }
      case 'KeyT': {
        const to = facing + (shift ? -1 : 1);
        const turn = { kind: 'turn', duration: HOP_DURATION, from: facing, to } as const;
        facing = (to + 8) % 8;
        yaw = facingAngle(facing);
        return turn;
      }
      case 'KeyS':
        return { kind: 'squawk', duration: TUNING.squawk.duration };
      case 'KeyL': {
        const { maxYaw, maxRoll, hold } = TUNING.look;
        return {
          kind: 'look',
          duration: hold.min + random() * (hold.max - hold.min),
          yaw: (random() * 2 - 1) * maxYaw,
          roll: (random() * 2 - 1) * maxRoll,
        };
      }
      case 'KeyJ': {
        const jump = jumpAction({ x, z }, { x: x + 2 * Math.sin(yaw), z: z + 2 * Math.cos(yaw) });
        x = jump.toX;
        z = jump.toZ;
        return jump;
      }
      case 'KeyF': {
        const face = faceAction(yaw, random() * 2 * Math.PI);
        yaw = face.to;
        // Hops and turns go on from the nearest 45° step.
        facing = ((Math.round(yaw / (Math.PI / 4)) % 8) + 8) % 8;
        return face;
      }
      case 'KeyG':
        gaze = !gaze;
        animator.setGaze(gaze ? GAZE : null);
        return null;
      case 'KeyI':
        return { kind: 'tilt', duration: TUNING.visit.tilt };
      case 'KeyN':
        return { kind: 'shake', duration: TUNING.visit.shake };
      default:
        return null;
    }
  }

  addEventListener('keydown', (event) => {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    const action = act(event.code, event.shiftKey);
    if (action) animator.play(action);
  });
}
