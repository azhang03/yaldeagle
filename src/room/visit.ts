// The app mode and what the person asks the eagle to do. A visit: the eagle jumps to the item, the
// camera flies down to the close view, the eagle makes its gesture, and the panel builds. The way
// back flies up again, and the eagle wanders again. A trip: the eagle runs (or jumps over an item)
// to a point that the person clicks on the floor.
import {
  faceAction,
  facingAngle,
  HOP_DURATION,
  jumpAction,
  runAction,
  TUNING,
  type BodyAction,
} from '../eagle/actions';
import type { Animator } from '../eagle/animator';
import type { Brain, Obstacle } from '../eagle/brain';
import { ROOM_BOUNDS, roomPoint } from '../lib/room';
import { closeView, flight, overview, type CameraView, type OverviewOffset } from '../lib/view';
import { buildPanel, type PanelBuild } from '../panel/build';
import { panelContent } from '../panel/content';
import type { Exhibit } from './exhibit';
import type { Gear } from './gear';
import type { ItemId } from './items';
import { planVisit } from './plan';
import { planTrip } from './trip';

/**
 * wander: the brain moves the eagle, and the overview shows. running: the eagle makes a trip to a
 * clicked point. going: the eagle jumps to the item, and the camera flies down. focus: the close
 * view and the panel. leaving: the panel comes down, and the camera flies back.
 */
export type Mode = 'wander' | 'running' | 'going' | 'focus' | 'leaving';

export interface Visits {
  mode(): Mode;
  /** Starts a visit to the item. In focus on another item, it leaves that item first. */
  open(id: ItemId): Promise<void>;
  /** Ends the visit in focus. */
  close(): Promise<void>;
  /**
   * Sends the eagle to a floor point. In wander it starts a trip. During a trip, the eagle goes on
   * to the new point when the current move ends.
   */
  runTo(point: { x: number; z: number }): void;
  /** The camera view for this frame. */
  view(): CameraView;
  update(dt: number): void;
}

/** A click during a trip. */
type Pending = { kind: 'point'; point: { x: number; z: number } } | { kind: 'visit'; id: ItemId };

export interface VisitDeps {
  readonly animator: Animator;
  /** Null with ?manual. Then the eagle does not wander after a visit. */
  readonly brain: Brain | null;
  readonly exhibits: ReadonlyMap<ItemId, Exhibit>;
  /** The item circles that a trip avoids. */
  readonly obstacles: readonly Obstacle[];
  /** The gear of an earned item goes on the eagle when its visit lands. */
  readonly gear: Gear;
  /** The panel goes in this element. */
  readonly host: HTMLElement;
  /** The overview position and zoom. The way back flies to it. */
  readonly offset: OverviewOffset;
  /** The screen width divided by its height. */
  aspect(): number;
  /** Builds the panel at a quarter of the speed. */
  readonly slow: boolean;
}

/** Flight times in seconds. */
const FLY_DOWN = 1.8;
const FLY_BACK = 1.4;
/** The eagle faces the camera azimuth turned by this angle toward the item. */
const FACE_TURN = 0.25;
/** The head turns by this yaw toward the item while the camera is close. */
const GAZE = -0.85;
/** The eagle jumps only if it is further than this from its spot. */
const AT_SPOT = 0.05;

export function createVisits(deps: VisitDeps): Visits {
  const { animator, brain, exhibits, gear, host, offset } = deps;
  let mode: Mode = 'wander';
  const currentMode = (): Mode => mode;
  let focus: { exhibit: Exhibit; hide: readonly ItemId[] } | null = null;
  let panel: PanelBuild | null = null;
  /** The items with a full panel build since the page loaded. Later builds are 3 times as fast. */
  const opened = new Set<ItemId>();
  /**
   * During a trip: the newest click, which waits for the current move to end. A floor click and an
   * item click replace each other.
   */
  let pending: Pending | null = null;
  /** Takes the newest click. A read through a function, because the click can come in an await. */
  const takePending = (): Pending | null => {
    const next = pending;
    pending = null;
    return next;
  };

  // Eagle actions in order. Each one resolves when it ends. A null action waits for the current
  // body action to end.
  const queue: { action: BodyAction | null; done: () => void }[] = [];
  let playing: (() => void) | null = null;
  const act = (action: BodyAction | null): Promise<void> =>
    new Promise((done) => queue.push({ action, done }));

  // The camera: a flight, or the view that the last flight went to.
  const overviewNow = (): CameraView => overview(deps.aspect(), offset);
  let rest: () => CameraView = overviewNow;
  let fly: {
    from: CameraView;
    to: () => CameraView;
    down: boolean;
    duration: number;
    t: number;
    done: () => void;
  } | null = null;
  let flyView: CameraView = overviewNow();
  const flyTo = (to: () => CameraView, duration: number, down: boolean): Promise<void> =>
    new Promise((done) => {
      fly = { from: view(), to, down, duration, t: 0, done };
    });

  function view(): CameraView {
    return fly ? flyView : rest();
  }

  function update(dt: number): void {
    if (fly) {
      fly.t += dt;
      const u = Math.min(1, fly.t / fly.duration);
      flyView = flight(fly.from, fly.to(), u, fly.down);
      if (u >= 1) {
        // The end view stays, so no frame shows the old view before the visit goes on.
        rest = fly.to;
        const done = fly.done;
        fly = null;
        done();
      }
    }
    while (animator.bodyLeft() <= 0) {
      playing?.();
      playing = null;
      const next = queue.shift();
      if (!next) break;
      if (!next.action) {
        next.done();
        continue;
      }
      animator.play(next.action);
      playing = next.done;
    }
  }

  async function open(id: ItemId): Promise<void> {
    if (mode === 'going' || mode === 'leaving') return;
    if (mode === 'running') {
      // The visit starts when the current move of the trip ends.
      pending = { kind: 'visit', id };
      return;
    }
    if (mode === 'focus') {
      if (focus?.exhibit.item.id === id) return;
      await close();
      // A read through a function, because TypeScript keeps the narrowed mode over the await.
      if (currentMode() !== 'wander') return;
    }
    const exhibit = exhibits.get(id);
    if (!exhibit) return;
    const { item } = exhibit;
    mode = 'going';
    // The items at their places of the moment. The person can drag them.
    const place = exhibit.place();
    const live = [...exhibits.values()].map((e) => ({ ...e.item, ...e.place() }));
    const plan = planVisit({ ...item, ...place }, live, deps.aspect(), ROOM_BOUNDS);
    focus = { exhibit, hide: plan.hide };
    exhibit.setSelected(true);
    for (const hid of plan.hide) exhibits.get(hid)?.setHidden(true);

    // A rest or a pause stops at once. A hop or a turn ends first.
    animator.cutIdle();
    await act(null);
    const pose = animator.pose();
    let yaw = pose.yaw;
    const moves: BodyAction[] = [];
    if (Math.hypot(plan.spot.x - pose.x, plan.spot.z - pose.z) > AT_SPOT) {
      const face = faceAction(yaw, Math.atan2(plan.spot.x - pose.x, plan.spot.z - pose.z));
      moves.push(face, jumpAction(pose, plan.spot));
      yaw = face.to;
    }
    moves.push(faceAction(yaw, plan.azimuth - FACE_TURN));
    await Promise.all(moves.map(act));
    animator.setGaze(GAZE);

    const at = roomPoint(place.u, place.v);
    await flyTo(() => closeView(at, plan.azimuth, deps.aspect()), FLY_DOWN, true);
    mode = 'focus';
    exhibit.setFocus(true);
    gear.equip(id);

    // The gesture, while the panel builds.
    if (item.status === 'earned') {
      void act({ kind: 'squawk', duration: TUNING.squawk.duration });
      void act({ kind: 'hopInPlace', duration: HOP_DURATION });
    } else if (item.status === 'progress') {
      void act({ kind: 'tilt', duration: TUNING.visit.tilt });
      void act({ kind: 'squawk', duration: TUNING.squawk.duration });
    } else {
      exhibit.glitchFor(0.9);
      void act({ kind: 'tilt', duration: 0.6 });
      void act({ kind: 'shake', duration: TUNING.visit.shake });
    }
    const speed = (opened.has(id) ? 3 : 1) * (deps.slow ? 0.25 : 1);
    opened.add(id);
    panel = buildPanel(host, panelContent(item), { speed, onClose: () => void close() });
  }

  async function close(): Promise<void> {
    if (mode !== 'focus' || !focus) return;
    const { exhibit, hide } = focus;
    mode = 'leaving';
    exhibit.setFocus(false);
    const current = panel;
    panel = null;
    if (current) await current.demolish();
    animator.setGaze(null);
    for (const hid of hide) exhibits.get(hid)?.setHidden(false);
    await flyTo(overviewNow, FLY_BACK, false);
    exhibit.setSelected(false);
    focus = null;
    await wanderAgain();
  }

  /**
   * Faces the nearest 45° step and starts the brain again. The turn ends at the exact step angle
   * (plus whole turns), so the next turn of the brain, which starts from the step angle, does not
   * jump.
   */
  async function wanderAgain(): Promise<void> {
    const pose = animator.pose();
    const step = ((Math.round(pose.yaw / (Math.PI / 4)) % 8) + 8) % 8;
    const turns = Math.round((pose.yaw - facingAngle(step)) / (2 * Math.PI));
    await act({
      kind: 'face',
      duration: TUNING.visit.face,
      from: pose.yaw,
      to: facingAngle(step) + turns * 2 * Math.PI,
    });
    const end = animator.pose();
    brain?.restart({ x: end.x, z: end.z, facing: step });
    mode = 'wander';
  }

  function runTo(point: { x: number; z: number }): void {
    if (mode === 'running') {
      pending = { kind: 'point', point };
      return;
    }
    if (mode !== 'wander') return;
    mode = 'running';
    pending = { kind: 'point', point };
    void trip();
  }

  async function trip(): Promise<void> {
    // A rest or a pause stops at once. A hop or a turn ends first.
    animator.cutIdle();
    await act(null);
    // Each loop takes the newest floor click.
    let next = takePending();
    while (next?.kind === 'point') {
      const target = next.point;
      const pose = animator.pose();
      const plan = planTrip(pose, target, ROOM_BOUNDS, deps.obstacles);
      if (plan) {
        void act(faceAction(pose.yaw, Math.atan2(plan.to.x - pose.x, plan.to.z - pose.z)));
        await act(plan.jump ? jumpAction(pose, plan.to) : runAction(pose, plan.to));
      }
      next = takePending();
    }
    if (next?.kind === 'visit') {
      // The visit turns the eagle itself, so no turn to a 45° step first.
      mode = 'wander';
      await open(next.id);
      return;
    }
    await wanderAgain();
    // A click during the last turn.
    const late = takePending();
    if (late?.kind === 'point') runTo(late.point);
    else if (late?.kind === 'visit') await open(late.id);
  }

  return { mode: currentMode, open, close, runTo, view, update };
}
