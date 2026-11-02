// Keys that start each action by hand, for development: H hop, T turn left, Shift+T turn right,
// S squawk, L look. The keys do not check the bounds.
import { facingVector, HOP_DURATION, TUNING, type Action, type Pose } from './actions';
import type { Animator } from './animator';

export function startManualKeys(animator: Animator, start: Pose, random: () => number): void {
  let { x, z, facing } = start;

  function act(key: string): Action | null {
    switch (key) {
      case 'h': {
        const step = facingVector(facing);
        const toX = x + step.x * TUNING.hop.length;
        const toZ = z + step.z * TUNING.hop.length;
        const hop = { kind: 'hop', duration: HOP_DURATION, fromX: x, fromZ: z, toX, toZ } as const;
        x = toX;
        z = toZ;
        return hop;
      }
      case 't':
      case 'T': {
        const to = facing + (key === 't' ? 1 : -1);
        const turn = { kind: 'turn', duration: HOP_DURATION, from: facing, to } as const;
        facing = (to + 8) % 8;
        return turn;
      }
      case 's':
        return { kind: 'squawk', duration: TUNING.squawk.duration };
      case 'l': {
        const { maxYaw, maxRoll, hold } = TUNING.look;
        return {
          kind: 'look',
          duration: hold.min + random() * (hold.max - hold.min),
          yaw: (random() * 2 - 1) * maxYaw,
          roll: (random() * 2 - 1) * maxRoll,
        };
      }
      default:
        return null;
    }
  }

  addEventListener('keydown', (event) => {
    if (event.repeat || event.metaKey || event.ctrlKey || event.altKey) return;
    const action = act(event.key);
    if (action) animator.play(action);
  });
}
