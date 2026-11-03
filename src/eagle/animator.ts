// Plays the actions on the part tree of the eagle. Short hand-written tweens, no library.
import { easeOutCubic, smoothstep } from '../lib/ease';
import { facingAngle, TUNING, type Action, type BodyAction, type Pose } from './actions';
import { HIP, type Eagle } from './model';

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
  /** The jump arc is jumpHeightBase + jumpHeightPerUnit × distance high. */
  jumpHeightBase: 0.5,
  jumpHeightPerUnit: 0.12,
  /** The parts of the jump time: a crouch until jumpCrouch, the air until jumpLand. */
  jumpCrouch: 0.15,
  jumpLand: 0.85,
  jumpSquash: 0.2,
  jumpStretch: 0.1,
  jumpLandSquash: 0.16,
  /** The wings in the jump: flapBase + flapAmp × sin(6πs) radians out. */
  flapBase: 1.3,
  flapAmp: 0.5,
  /** The largest head angles of the gestures (radians). */
  tiltRoll: 0.35,
  tiltPitch: 0.15,
  shakeYaw: 0.45,
  /**
   * The R6 run ("Long-stride charge"): the body leans forward and drops, the head cancels part of
   * the lean, the wings stay up in a V, and the legs swing. The body rises twice each stride.
   */
  runLean: 0.55,
  runLower: 0.08,
  runHeadLevel: 0.4,
  runWing: 2.0,
  /** Strides each second, and the leg swing (radians). */
  runStrideHz: 5,
  runStep: 0.9,
  runBob: 0.03,
  /** The short lean back when the run stops (radians). */
  runStopLean: 0.2,
} as const;

export interface Animator {
  /** Starts an action. A body action replaces the current one. */
  play(action: Action): void;
  update(dt: number): void;
  /** The seconds left in the current body action. 0 if there is none. */
  bodyLeft(): number;
  /** An idle body action (a rest or a pause) and its looks end now. Other actions go on. */
  cutIdle(): void;
  /** Holds the head turned by this yaw (radians), or null to free it. Looks do not show then. */
  setGaze(yaw: number | null): void;
  /** The gaze yaw, or null. */
  gaze(): number | null;
  /** Where the eagle is now, and its yaw in radians. */
  pose(): { x: number; z: number; yaw: number };
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
  let gaze: number | null = null;
  // The head angles that snap to their targets. The gestures add to them.
  let headYaw = 0;
  let headRoll = 0;
  let headPitch = 0;

  /** Puts the eagle at the end pose of the current body action. */
  function finishBody(): void {
    if (body?.kind === 'hop' || body?.kind === 'jump' || body?.kind === 'run') {
      x = body.toX;
      z = body.toZ;
    } else if (body?.kind === 'turn') {
      yaw = facingAngle((body.to + 8) % 8);
    } else if (body?.kind === 'face') {
      yaw = body.to;
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
    let wings = 0;
    // The run pose: body lean and drop, and the leg swing.
    let bodyLean = 0;
    let bodyDrop = 0;
    let legSwing = 0;
    // Gesture angles on top of the snapped head angles.
    let addYaw = 0;
    let addRoll = 0;
    let addPitch = 0;
    // The head looks around only while the body is idle or has no action.
    const headFree = !body || body.kind === 'idle';
    const u = body ? Math.min(1, elapsed / body.duration) : 0;

    if (body?.kind === 'hop' || body?.kind === 'turn' || body?.kind === 'hopInPlace') {
      const hop = hopShape(elapsed);
      lift = hop.lift;
      squash = hop.squash;
      if (body.kind === 'hop') {
        x = body.fromX + (body.toX - body.fromX) * hop.progress;
        z = body.fromZ + (body.toZ - body.fromZ) * hop.progress;
      } else if (body.kind === 'turn') {
        const from = facingAngle(body.from);
        yaw = from + (facingAngle(body.to) - from) * easeOutCubic(hop.progress);
      }
    } else if (body?.kind === 'squawk') {
      const envelope = Math.sin((Math.PI * elapsed) / body.duration);
      pitch = -MOTION.squawkLift * envelope;
      const shake =
        1 - MOTION.jawShake + MOTION.jawShake * Math.sin(elapsed * MOTION.jawShakeSpeed);
      jaw = MOTION.jawOpen * envelope * shake;
    } else if (body?.kind === 'jump') {
      const { jumpCrouch: crouch, jumpLand: land } = MOTION;
      if (u < crouch) {
        squash = 1 - MOTION.jumpSquash * easeOutCubic(u / crouch);
      } else if (u > land) {
        x = body.toX;
        z = body.toZ;
        squash =
          1 - MOTION.jumpLandSquash * Math.sin(Math.PI * Math.min(1, (u - land) / (1 - land)));
      } else {
        const s = (u - crouch) / (land - crouch);
        const k = smoothstep(s);
        x = body.fromX + (body.toX - body.fromX) * k;
        z = body.fromZ + (body.toZ - body.fromZ) * k;
        const distance = Math.hypot(body.toX - body.fromX, body.toZ - body.fromZ);
        lift = (MOTION.jumpHeightBase + MOTION.jumpHeightPerUnit * distance) * 4 * s * (1 - s);
        squash = 1 + MOTION.jumpStretch * Math.sin(Math.PI * s);
        wings = MOTION.flapBase + MOTION.flapAmp * Math.sin(6 * Math.PI * s);
      }
    } else if (body?.kind === 'face') {
      yaw = body.from + (body.to - body.from) * easeOutCubic(u);
      lift = TUNING.visit.faceHop * 4 * u * (1 - u);
    } else if (body?.kind === 'tilt') {
      addRoll = MOTION.tiltRoll * Math.sin(Math.PI * u);
      addPitch = MOTION.tiltPitch * Math.sin(Math.PI * u);
    } else if (body?.kind === 'shake') {
      addYaw = MOTION.shakeYaw * Math.sin(6 * Math.PI * u) * (1 - u);
    } else if (body?.kind === 'run') {
      const run = runShape(elapsed, body.duration);
      x = body.fromX + (body.toX - body.fromX) * run.progress;
      z = body.fromZ + (body.toZ - body.fromZ) * run.progress;
      const k = run.blend;
      const phase = 2 * Math.PI * MOTION.runStrideHz * elapsed;
      bodyLean = k * MOTION.runLean - run.leanBack;
      bodyDrop = k * MOTION.runLower;
      legSwing = k * MOTION.runStep * Math.sin(phase);
      // Two smooth rises for each stride.
      lift = k * MOTION.runBob * ((1 - Math.cos(2 * phase)) / 2);
      wings = k * MOTION.runWing;
      addPitch = -k * MOTION.runLean * MOTION.runHeadLevel;
    }

    squash *= 1 + MOTION.breathAmount * Math.sin(clock * MOTION.breathSpeed);
    // Keep the volume about the same: a shorter body is wider.
    const wide = 1 / Math.sqrt(squash);
    eagle.root.scale.set(wide, squash, wide);
    eagle.root.position.set(x, lift, z);
    eagle.root.rotation.y = yaw;
    eagle.wingL.rotation.z = wings;
    eagle.wingR.rotation.z = -wings;
    eagle.body.rotation.x = bodyLean;
    eagle.body.position.y = HIP - bodyDrop;
    eagle.legL.rotation.x = legSwing;
    eagle.legR.rotation.x = -legSwing;

    const looks = headFree && gaze === null;
    const snap = Math.min(1, dt * MOTION.headSnap);
    headYaw += ((gaze ?? (looks ? lookYaw : 0)) - headYaw) * snap;
    headRoll += ((looks ? lookRoll : 0) - headRoll) * snap;
    headPitch += (pitch - headPitch) * Math.min(1, dt * MOTION.pitchSnap);
    eagle.head.rotation.set(headPitch + addPitch, headYaw + addYaw, headRoll + addRoll);
    eagle.jaw.rotation.x = jaw;
  }

  update(0);
  return {
    play,
    update,
    bodyLeft: () => (body ? Math.max(0, body.duration - elapsed) : 0),
    cutIdle: () => {
      if (body?.kind !== 'idle') return;
      body = null;
      lookYaw = 0;
      lookRoll = 0;
    },
    setGaze: (next) => {
      gaze = next;
    },
    gaze: () => gaze,
    pose: () => ({ x, z, yaw }),
  };
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

/**
 * The shape of a run at time t of its duration. The speed rises in a straight line over the start,
 * holds, and falls over the stop, so `progress` reaches 1 at the end. `blend` (0 to 1) moves the
 * body into the run pose, and `leanBack` is the short lean back at the stop.
 */
function runShape(
  t: number,
  duration: number,
): { progress: number; blend: number; leanBack: number } {
  const { start, stop } = TUNING.run;
  // The full speed as a part of the distance each second.
  const v = 1 / (duration - (start + stop) / 2);
  let progress: number;
  if (t < start) progress = (v * t * t) / (2 * start);
  else if (t < duration - stop) progress = (v * start) / 2 + v * (t - start);
  else progress = 1 - (v * (duration - t) ** 2) / (2 * stop);
  const stopU = Math.min(1, Math.max(0, (t - (duration - stop)) / stop));
  let blend = 1;
  if (t < start) blend = easeOutCubic(t / start);
  else if (t > duration - stop) blend = 1 - easeOutCubic(stopU);
  return {
    progress: Math.min(1, Math.max(0, progress)),
    blend,
    leanBack: t > duration - stop ? MOTION.runStopLean * Math.sin(Math.PI * stopU) : 0,
  };
}
