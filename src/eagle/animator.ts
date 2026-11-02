// Plays the actions on the part tree of the eagle. Short hand-written tweens, no library.
import { easeOutCubic } from '../lib/ease';
import { facingAngle, TUNING, type Action, type BodyAction, type Pose } from './actions';
import type { Eagle } from './model';

/** How the motion looks. TUNING holds the timings. */
const MOTION = {
  /** Squash and stretch of the body, as a part of its height. */
  crouchSquash: 0.2,
  airStretch: 0.12,
  landSquash: 0.16,
  /** The top of the hop arc, in world units. */
  hopHeight: 0.42,
  breathAmount: 0.018,
  /** Radians each second. */
  breathSpeed: 2.3,
  /** How fast the head goes to its target. A larger value is a faster snap. */
  headSnap: 22,
  pitchSnap: 16,
  /** The squawk lifts the head by this angle and opens the jaw by this angle (radians). */
  squawkLift: 0.4,
  jawOpen: 0.7,
  /** The jaw shakes by this part of its opening, this many radians each second. */
  jawShake: 0.15,
  jawShakeSpeed: 60,
} as const;

export interface Animator {
  /** Starts an action. A body action replaces the current one. */
  play(action: Action): void;
  update(dt: number): void;
}

export function createAnimator(eagle: Eagle, start: Pose): Animator {
  let x = start.x;
  let z = start.z;
  let yaw = facingAngle(start.facing);
  let body: BodyAction | null = null;
  let elapsed = 0;
  let clock = 0;
  let lookYaw = 0;
  let lookRoll = 0;

  /** Puts the eagle at the end pose of the current body action. */
  function finishBody(): void {
    if (body?.kind === 'hop') {
      x = body.toX;
      z = body.toZ;
    } else if (body?.kind === 'turn') {
      yaw = facingAngle((body.to + 8) % 8);
    }
    body = null;
  }

  function play(action: Action): void {
    if (action.kind === 'look') {
      lookYaw = action.yaw;
      lookRoll = action.roll;
      return;
    }
    finishBody();
    body = action;
    elapsed = 0;
    // A look belongs to one idle. The head looks forward again after it.
    if (action.kind !== 'idle') {
      lookYaw = 0;
      lookRoll = 0;
    }
  }

  function update(dt: number): void {
    clock += dt;
    if (body) {
      elapsed += dt;
      if (elapsed >= body.duration) finishBody();
    }

    let lift = 0;
    let squash = 1;
    let pitch = 0;
    let jaw = 0;
    // The head looks around only while the body is idle or has no action.
    let headFree = true;

    if (body?.kind === 'hop' || body?.kind === 'turn') {
      const hop = hopShape(elapsed);
      lift = hop.lift;
      squash = hop.squash;
      headFree = false;
      if (body.kind === 'hop') {
        x = body.fromX + (body.toX - body.fromX) * hop.progress;
        z = body.fromZ + (body.toZ - body.fromZ) * hop.progress;
      } else {
        const from = facingAngle(body.from);
        yaw = from + (facingAngle(body.to) - from) * easeOutCubic(hop.progress);
      }
    } else if (body?.kind === 'squawk') {
      const envelope = Math.sin((Math.PI * elapsed) / body.duration);
      pitch = -MOTION.squawkLift * envelope;
      const shake =
        1 - MOTION.jawShake + MOTION.jawShake * Math.sin(elapsed * MOTION.jawShakeSpeed);
      jaw = MOTION.jawOpen * envelope * shake;
      headFree = false;
    }

    squash *= 1 + MOTION.breathAmount * Math.sin(clock * MOTION.breathSpeed);
    // Keep the volume about the same: a shorter body is wider.
    const wide = 1 / Math.sqrt(squash);
    eagle.root.scale.set(wide, squash, wide);
    eagle.root.position.set(x, lift, z);
    eagle.root.rotation.y = yaw;

    const head = eagle.head.rotation;
    const snap = Math.min(1, dt * MOTION.headSnap);
    head.y += ((headFree ? lookYaw : 0) - head.y) * snap;
    head.z += ((headFree ? lookRoll : 0) - head.z) * snap;
    head.x += (pitch - head.x) * Math.min(1, dt * MOTION.pitchSnap);
    eagle.jaw.rotation.x = jaw;
  }

  update(0);
  return { play, update };
}

/**
 * The shape of a hop at time t: crouch, then an arc in the air with a stretch, then a squash on
 * landing. `progress` goes from 0 to 1 during the air time.
 */
function hopShape(t: number): { lift: number; squash: number; progress: number } {
  const { crouch, air, land } = TUNING.hop;
  if (t < crouch) {
    return { lift: 0, squash: 1 - MOTION.crouchSquash * easeOutCubic(t / crouch), progress: 0 };
  }
  if (t < crouch + air) {
    const u = (t - crouch) / air;
    return {
      lift: MOTION.hopHeight * 4 * u * (1 - u),
      squash: 1 + MOTION.airStretch * Math.sin(Math.PI * u),
      progress: u,
    };
  }
  const u = Math.min(1, (t - crouch - air) / land);
  return { lift: 0, squash: 1 - MOTION.landSquash * Math.sin(Math.PI * u), progress: 1 };
}
