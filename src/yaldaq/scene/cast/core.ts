// The cast of the YALDAQ room. Each actor of the data gets one character: a blocky figure
// and a station prop that shows its job. A data event plays a short act (playEvent).
// Public rule 3 of the brief: every motion that means "something happened" comes from a
// data event. So idle motion is slow and small, and acts are quick and clear.
//
// This file holds the shared parts: the cast table, the motion helpers, the signs, and the
// character core (the act queue, the idle motion, the pose, and the effects).
import {
  Box3,
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  RingGeometry,
  Sprite,
  SpriteMaterial,
  Vector3,
} from 'three';
import type { Material, Object3D } from 'three';
import type { Actor } from '../../data/contract';
import { clamp, clamp01, ease, kit, lerpAngle, painter, rand, smooth, texture } from '../kit';
import type { Kit, Vec3 } from '../kit';

export interface CastInfo {
  name: string;
  role: string;
  module: string;
  color: string;
  tint: string;
  blurb: string;
}

/** A light tint of a color for the floor patch (about 88% white, like the tribute room). */
function tintOf(hex: string, k = 0.88): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = [n >> 16, (n >> 8) & 255, n & 255].map((v) => Math.round(v + (255 - v) * k));
  return `#${ch.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

const who = (
  name: string,
  role: string,
  module: string,
  color: string,
  blurb: string,
): CastInfo => ({
  name,
  role,
  module,
  color,
  tint: tintOf(color),
  blurb,
});

export const CAST: Record<Actor, CastInfo> = {
  scanner: who(
    'Scout',
    'Scanner',
    'yaldar',
    '#2a9d8f',
    'Every 15 minutes it lists the open markets in the nine pilot series and skips the late ones.',
  ),
  brief: who(
    'Librarian',
    'Brief',
    'brief.py',
    '#8e5bb5',
    'It builds one brief for each new event, with the rules and the history but no prices.',
  ),
  claude: who(
    'Claude',
    'Forecaster',
    'claude.py',
    '#d97757',
    'It makes one call for each event and can search the web.',
  ),
  strike_rate: who(
    'Actuary',
    'Control',
    'strike_rate.py',
    '#3f74c9',
    'It counts how often each strike won in the past.',
  ),
  base_rate: who(
    'Grandpa',
    'Second control',
    'base_rate.py',
    '#8a8f98',
    'It is a simpler second control.',
  ),
  ladder: who(
    'Mechanic',
    'Ladder',
    'ladder.py',
    '#e08a1e',
    "It makes Claude's numbers for one event agree, for example so that the buckets add up to 1.",
  ),
  policy: who(
    'Pricer',
    'Policy',
    'policy.py',
    '#c2548a',
    'It compares the forecast with the order book, then places one resting order or passes with a reason.',
  ),
  risk: who(
    'Bouncer',
    'Risk',
    'risk.py',
    '#3d405b',
    'It holds the gates: the kill switch, the drawdown flag, and the daily loss limit.',
  ),
  loop: who(
    'Desk clock',
    'Trading loop',
    'loop.py',
    '#e8b923',
    'It runs the trading cycle every 5 minutes.',
  ),
  shadow: who(
    'Clerk',
    'Shadow',
    'shadow.py',
    '#7a5c3e',
    'It watches the real trade tape and fills a paper order when a trade prints at its price.',
  ),
  demo: who(
    'Twin',
    'Demo',
    'client',
    '#b39373',
    "It copies some orders to Kalshi's demo exchange.",
  ),
  reconcile: who(
    'Auditor',
    'Reconcile',
    'reconcile.py',
    '#2f9fd0',
    'It compares our books with the demo books.',
  ),
  cost: who(
    'Treasurer',
    'Cost',
    'cost.py',
    '#2e9e5b',
    'It counts Claude spend against a $10 daily cap and a $50 monthly cap.',
  ),
  supervisor: who(
    'Foreman',
    'Supervisor',
    'supervisor.py',
    '#a8b820',
    'It runs all the loops, checks for stalls, and notices network errors.',
  ),
  vault: who(
    'Vault keeper',
    'Vault',
    'exporter',
    '#b8322a',
    "It keeps each event's numbers sealed until its markets close.",
  ),
};

/** The path of one market through the system. */
export const PIPELINE: readonly Actor[] = [
  'scanner',
  'brief',
  'claude',
  'strike_rate',
  'base_rate',
  'ladder',
  'policy',
  'risk',
  'shadow',
  'vault',
];

/** The pass reasons of policy and the text of their signs. */
export const REASONS: Record<string, string> = {
  edge: 'NOT ENOUGH EDGE',
  wide_spread: 'SPREAD TOO WIDE',
  p_extreme: 'TOO SURE',
};

// One painter for all static colors. Parts that change color (lamps, screens) get their own material.
export const PAINT = painter();
export const ORIGIN = new Vector3();
export const SKIN = {
  a: '#f1c7a0',
  b: '#e8b48a',
  c: '#d9a27a',
  d: '#c68a5e',
  e: '#a8714f',
} as const;
export const KRAFT = '#c8a46e';
export const WAX = '#b3261e';
/** An act waits in the queue only if fewer than this many acts wait. Extra copies are dropped. */
const MAX_WAITING = 3;

// Motion helpers. u is the progress of a step, 0 to 1.
export const ramp = (u: number, a: number, b: number): number => smooth((u - a) / (b - a));
/** 0 before a, up to 1 at b, 1 until c, down to 0 at d. */
export const env = (u: number, a: number, b: number, c: number, d: number): number =>
  ramp(u, a, b) * (1 - ramp(u, c, d));
export const bump = (u: number, a: number, b: number): number =>
  u > a && u < b ? Math.sin((Math.PI * (u - a)) / (b - a)) : 0;
export const lerp = (a: number, b: number, k: number): number => a + (b - a) * k;

// The pose. y and sy (the squash) are exact. The turns go through a short smoothing, so the
// joints do not jump between steps.
const ZERO = { y: 0, sy: 1, lean: 0, roll: 0, hy: 0, hp: 0, hr: 0, lx: 0, lz: 0, rx: 0, rz: 0 };
export type PoseKey = keyof typeof ZERO;
export type Pose = Record<PoseKey, number>;
const SMOOTH: readonly PoseKey[] = ['lean', 'roll', 'hy', 'hp', 'hr', 'lx', 'lz', 'rx', 'rz'];

/** Moves each pose value in v toward its target by k. */
export function to(p: Pose, v: Partial<Pose>, k: number): void {
  for (const key of Object.keys(v) as PoseKey[]) {
    const goal = v[key];
    if (goal !== undefined) p[key] += (goal - p[key]) * k;
  }
}
/** The hop of the game: a crouch, the jump, and a squash on landing. s is the floor progress. */
export function hopCurve(u: number, h: number): { s: number; y: number; sy: number } {
  if (u < 0.16) return { s: 0, y: 0, sy: 1 - 0.18 * ease(u / 0.16) };
  if (u < 0.71) {
    const s = (u - 0.16) / 0.55;
    return { s, y: h * 4 * s * (1 - s), sy: 1 + 0.1 * Math.sin(Math.PI * s) };
  }
  return { s: 1, y: 0, sy: 1 - 0.14 * Math.sin(Math.PI * clamp01((u - 0.71) / 0.29)) };
}

/** One step of an act. A step with expand() is replaced by the steps it makes when it starts. */
export interface Step {
  dur?: number;
  tick?: (u: number, p: Pose) => void;
  start?: () => void;
  end?: () => void;
  expand?: () => Step[];
}
/** One step of an act: it runs for dur seconds and calls tick(u, pose) each frame. */
export const S = (
  dur: number,
  tick: (u: number, p: Pose) => void,
  x: { start?: () => void; end?: () => void } = {},
): Step => ({ dur, tick, ...x });

/** The options of an act. Each act reads only the options it needs. */
export interface ActOptions {
  dur?: number;
  key?: string;
  keep?: boolean;
  small?: boolean;
  series?: number;
  searches?: number;
  text?: string;
  n?: number;
  delay?: number;
  pulse?: boolean;
  bad?: boolean;
  at?: Vector3;
  runTo?: Vector3 | null;
}
export type ActFn = (o: ActOptions) => Step[];

// Sprites for signs above the heads: "!", "z", the thought dots, and others.
const glyphMaps = new Map<string, CanvasTexture>();
function glyphMap(text: string, color: string): CanvasTexture {
  const key = text + color;
  let map = glyphMaps.get(key);
  if (!map) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = 128;
    const x = cv.getContext('2d');
    if (x) {
      x.lineJoin = 'round';
      x.lineWidth = 16;
      x.strokeStyle = '#ffffff';
      x.fillStyle = color;
      if (text === 'dot') {
        x.beginPath();
        x.arc(64, 64, 40, 0, Math.PI * 2);
        x.stroke();
        x.fill();
      } else {
        x.font = '900 100px system-ui, sans-serif';
        x.textAlign = 'center';
        x.textBaseline = 'middle';
        x.strokeText(text, 64, 70);
        x.fillText(text, 64, 70);
      }
    }
    map = texture(cv);
    glyphMaps.set(key, map);
  }
  return map;
}
export function glyph(text: string, color: string, size: number): Sprite {
  const s = new Sprite(
    new SpriteMaterial({ map: glyphMap(text, color), transparent: true, depthWrite: false }),
  );
  s.scale.set(size, size, 1);
  s.renderOrder = 5;
  return s;
}

/** A mesh with its own Lambert material. */
export type OwnMesh = Mesh & { material: MeshLambertMaterial };
/** Gives a mesh its own material, so it can glow or change color. */
export function own(mesh: Mesh, color: string): OwnMesh {
  const material = new MeshLambertMaterial({ color });
  return Object.assign(mesh, { material });
}
export function glow(mesh: { material: MeshLambertMaterial }, color: string, k: number): void {
  mesh.material.emissive.set(color);
  mesh.material.emissiveIntensity = k;
}

const RING = new RingGeometry(0.36, 0.46, 48);

// The figure. All characters use the same rig: legs, a torso, two arms on shoulder joints,
// and a head on a neck joint. Sizes are near the eagle: about 0.6 wide and 1.2 to 1.4 tall.
export interface Rig {
  body: Group;
  head: Group;
  armL: Group;
  armR: Group;
  handL: Group;
  handR: Group;
  eyes: Mesh[];
  legH: number;
  torsoH: number;
  shoulderY: number;
  headW: number;
  headH: number;
  w: number;
  d: number;
}

/** An object that the figure holds. hand 'B' is between both hands. */
export interface Carry {
  obj: Object3D;
  hand: 'L' | 'R' | 'B';
  off: Vec3;
  rot: Vec3 | (() => Vec3);
}

type FxObj = Object3D & { material: Material };
interface Fx {
  obj: FxObj;
  t: number;
  life: number;
  tick: (u: number) => void;
}
interface Act {
  key: string;
  make: () => Step[];
  resolve: (done: boolean) => void;
  promise: Promise<boolean>;
  steps: Step[];
  i: number;
  t: number;
}
export type IdleMode = 'idle' | 'read' | 'nap';

/** The inner state of one character. The actor builders fill it. */
export interface Core {
  actor: Actor;
  info: CastInfo;
  root: Group;
  space: Group;
  F: Kit;
  P: Kit;
  figure: Group;
  prop: Group;
  /** The rig. The actor builder sets it; reading it before that throws. */
  rig: Rig;
  defs: Record<string, ActFn>;
  names: string[];
  main: string;
  queue: Act[];
  cur: Act | null;
  time: number;
  idle: IdleMode;
  facing: number;
  pose: Pose;
  sm: Pose;
  base: Partial<Pose>;
  carry: Carry[];
  fx: Fx[];
  tickers: ((dt: number) => void)[];
  /** Functions that undo the act-only parts of this actor, for reset(). */
  resets: (() => void)[];
  look: { y: number; p: number; toY: number; toP: number; next: number };
  blink: { next: number; until: number };
  nextZ: number;
  book: Group | null;
  alarm: boolean;
  level: number;
  marks: Record<string, Group>;
  /** vault only: shows the first n sealed envelopes in the safe. */
  setCount?: (n: number) => void;
  def(name: string, fn: ActFn): void;
  mark(name: string, p: Vec3, parent?: Object3D): Group;
  spaceToRoot(v: Vector3): Vector3;
  toSpace(world: Vector3): Vector3;
  world(obj: Object3D): Vector3;
  local(obj: Object3D): Vector3;
  headLocal(): Vector3;
  /** The facing that turns the figure toward a point of its space. */
  toward(x: number, z: number): number;
}
export type Builder = (c: Core) => void;

// The character core: the act queue, the idle motion, the pose, and the effects.

export function makeCore(actor: Actor): Core {
  const root = new Group();
  root.name = `cast-${actor}`;
  const space = new Group();
  root.add(space);
  const F = kit(PAINT);
  const P = kit(PAINT);
  space.add(F.g, P.g);
  let rig: Rig | null = null;
  const c: Core = {
    actor,
    info: CAST[actor],
    root,
    space,
    F,
    P,
    figure: F.g,
    prop: P.g,
    get rig(): Rig {
      if (!rig) throw new Error(`The character "${actor}" has no rig yet`);
      return rig;
    },
    set rig(r: Rig) {
      rig = r;
    },
    defs: {},
    names: [],
    main: 'hop',
    queue: [],
    cur: null,
    time: rand(0, 20),
    idle: 'idle',
    facing: 0,
    pose: { ...ZERO },
    sm: { ...ZERO },
    base: {},
    carry: [],
    fx: [],
    tickers: [],
    resets: [],
    look: { y: 0, p: 0, toY: 0, toP: 0, next: rand(1, 4) },
    blink: { next: rand(1, 4), until: 0 },
    nextZ: 0,
    book: null,
    alarm: false,
    level: 0,
    marks: {},
    def(name, fn) {
      c.defs[name] = fn;
      if (!c.names.includes(name)) c.names.push(name);
    },
    mark: (name, p, parent = c.prop) => (c.marks[name] = P.sub(p, parent)),
    spaceToRoot(v) {
      c.space.updateMatrix();
      return v.clone().applyMatrix4(c.space.matrix);
    },
    toSpace(world) {
      c.root.updateWorldMatrix(true, true);
      return c.space.worldToLocal(world.clone());
    },
    world(obj) {
      c.root.updateWorldMatrix(true, true);
      return obj.getWorldPosition(new Vector3());
    },
    local: (obj) => c.root.worldToLocal(c.world(obj)),
    headLocal: () => c.local(c.marks.head ?? c.rig.head),
    toward: (x, z) => Math.atan2(x - c.figure.position.x, z - c.figure.position.z),
  };
  return c;
}

function turnStep(c: Core, angle: number, dur: number): Step {
  let f0 = 0;
  return S(
    dur,
    (u, p) => {
      c.facing = lerpAngle(f0, angle, ease(u));
      p.y = 0.05 * 4 * u * (1 - u);
    },
    { start: () => (f0 = c.facing) },
  );
}

function hopStep(c: Core, a: Vector3, b: Vector3, dur: number, h: number): Step {
  return S(dur, (u, p) => {
    const k = hopCurve(u, h);
    c.figure.position.lerpVectors(a, b, k.s);
    p.y = k.y;
    p.sy = k.sy;
    const air = k.y / h;
    to(p, { lz: 0.35, rz: 0.35, lx: -0.3, rx: -0.3 }, air);
  });
}

export interface WalkOptions {
  hop?: number;
  h?: number;
  turn?: number;
  face?: number | null;
  stop?: number;
}
/** Short hops to a point of the figure's space. The plan is made when the walk starts. */
export function walkSteps(
  c: Core,
  target: Vector3,
  { hop = 0.36, h = 0.2, turn = 0.14, face = null, stop = 0 }: WalkOptions = {},
): Step[] {
  return [
    {
      expand() {
        const from = c.figure.position.clone();
        const goal = target.clone().setY(0);
        const d = goal.clone().sub(from);
        let dist = d.length();
        if (stop > 0) {
          if (dist > stop) {
            goal.addScaledVector(d, -stop / dist);
            dist -= stop;
          } else {
            goal.copy(from);
            dist = 0;
          }
        }
        const steps: Step[] = [];
        if (dist > 0.02) {
          steps.push(turnStep(c, Math.atan2(d.x, d.z), turn));
          const n = Math.max(1, Math.ceil(dist / 0.45));
          for (let i = 0; i < n; i++) {
            steps.push(
              hopStep(
                c,
                from.clone().lerp(goal, i / n),
                from.clone().lerp(goal, (i + 1) / n),
                hop,
                h,
              ),
            );
          }
        }
        if (face !== null) steps.push(turnStep(c, face, turn));
        return steps;
      },
    },
  ];
}

export function enqueue(c: Core, key: string, make: () => Step[], keep = false): Promise<boolean> {
  if (!keep) {
    const same = c.queue.find((q) => q.key === key);
    if (same) return same.promise;
    if (c.queue.length >= MAX_WAITING) return Promise.resolve(false);
  }
  let resolve: (done: boolean) => void = () => {};
  const promise = new Promise<boolean>((r) => (resolve = r));
  c.queue.push({ key, make, resolve, promise, steps: [], i: -1, t: 0 });
  return promise;
}

/** Starts the next step of the current act. Returns false when the act is over. */
function nextStep(c: Core): boolean {
  const a = c.cur;
  if (!a) return false;
  for (;;) {
    a.i++;
    if (a.i >= a.steps.length) {
      c.cur = null;
      a.resolve(true);
      return false;
    }
    const s = a.steps[a.i];
    if (!s) continue;
    if (s.expand) {
      a.steps.splice(a.i, 1, ...s.expand());
      a.i--;
      continue;
    }
    a.t = 0;
    s.start?.();
    if ((s.dur ?? 0) > 0) return true;
    s.tick?.(1, c.pose);
    s.end?.();
  }
}

function runActs(c: Core, dt: number): void {
  if (!c.cur) {
    const next = c.queue.shift();
    if (next) {
      c.cur = next;
      next.steps = next.make();
      next.i = -1;
      if (!nextStep(c)) return;
      dt = 0;
    }
  }
  const a = c.cur;
  if (!a) return;
  a.t += dt;
  let s = a.steps[a.i];
  while (s && a.t >= (s.dur ?? 0)) {
    s.tick?.(1, c.pose);
    s.end?.();
    const over = a.t - (s.dur ?? 0);
    if (!nextStep(c)) return;
    a.t = over;
    s = a.steps[a.i];
  }
  s?.tick?.(a.t / (s.dur ?? 0), c.pose);
}

/** The rest height of each eye, so a blink can scale it. */
const eyeHeight = new WeakMap<Object3D, number>();

function idleTick(c: Core, dt: number): void {
  const p = c.pose;
  const busy = !!c.cur || c.queue.length > 0;
  const mode = busy ? 'busy' : c.idle;
  const t = c.time;
  const L = c.look;
  if (t > L.next) {
    L.next = t + rand(2.5, 6);
    const glance = mode === 'idle' && Math.random() < 0.75;
    L.toY = glance ? rand(-0.6, 0.6) : 0;
    L.toP = glance ? rand(-0.12, 0.1) : 0;
  }
  if (mode !== 'idle') L.toY = L.toP = 0;
  const k = 1 - Math.exp(-dt * 1.6);
  L.y += (L.toY - L.y) * k;
  L.p += (L.toP - L.p) * k;
  if (mode === 'nap') {
    to(p, { lean: 0.1, hp: 0.5, hr: 0.16, lx: 0.05, rx: 0.05, lz: 0.03, rz: 0.03 }, 1);
    p.sy += 0.022 * Math.sin(t * 1.25) - 0.02;
    if (t > c.nextZ) {
      c.nextZ = t + 1.7;
      spawnZ(c);
    }
  } else if (mode === 'read') {
    to(p, { lx: -1.3, rx: -1.3, lz: -0.32, rz: -0.32, hp: 0.38 }, 1);
    p.hy = 0.06 * Math.sin(t * 0.4);
    p.sy += 0.01 * Math.sin(t * 2.1);
  } else {
    p.sy += 0.012 * Math.sin(t * 2.1);
    p.hy += L.y;
    p.hp += L.p;
    p.lx += 0.03 * Math.sin(t * 1.3);
    p.rx += 0.03 * Math.sin(t * 1.3 + 1);
  }
  if (c.book) c.book.visible = mode === 'read';
  // Blinks. The eyes stay shut in a nap.
  let eye = 1;
  if (mode === 'nap') eye = 0.15;
  else if (t > c.blink.next) {
    c.blink.next = t + rand(2.5, 5);
    c.blink.until = t + 0.12;
  }
  if (mode !== 'nap' && t < c.blink.until) eye = 0.15;
  for (const e of c.rig.eyes) {
    let h = eyeHeight.get(e);
    if (h === undefined) {
      h = e.scale.y;
      eyeHeight.set(e, h);
    }
    e.scale.y = h * eye;
  }
}

function applyPose(c: Core, dt: number): void {
  const k = 1 - Math.exp(-dt * 22);
  for (const key of SMOOTH) c.sm[key] += (c.pose[key] - c.sm[key]) * k;
  const { body, head, armL, armR } = c.rig;
  const sm = c.sm;
  body.position.y = c.pose.y;
  const sq = c.pose.sy;
  body.scale.set(1 + (1 - sq) * 0.6, sq, 1 + (1 - sq) * 0.6);
  body.rotation.set(sm.lean, 0, sm.roll);
  head.rotation.set(sm.hp, sm.hy, sm.hr);
  armL.rotation.set(sm.lx, 0, sm.lz);
  armR.rotation.set(sm.rx, 0, -sm.rz);
  c.figure.rotation.y = c.facing;
}

const _a = new Vector3();
const _b = new Vector3();
/** Puts each held object at its hand. The objects keep their turn in the body frame. */
function updateCarry(c: Core): void {
  c.root.updateWorldMatrix(true, true);
  const { body, handL, handR } = c.rig;
  for (const it of c.carry) {
    if (!it.obj.visible) continue;
    if (it.hand === 'B') {
      handL.getWorldPosition(_a);
      handR.getWorldPosition(_b);
      _a.add(_b).multiplyScalar(0.5);
    } else {
      (it.hand === 'L' ? handL : handR).getWorldPosition(_a);
    }
    body.worldToLocal(_a);
    it.obj.position.set(_a.x + it.off[0], _a.y + it.off[1], _a.z + it.off[2]);
    const r = typeof it.rot === 'function' ? it.rot() : it.rot;
    it.obj.rotation.set(r[0], r[1], r[2]);
  }
}

function spawnFx(c: Core, obj: FxObj, life: number, tick: (u: number) => void): void {
  c.root.add(obj);
  c.fx.push({ obj, t: 0, life, tick });
  tick(0);
}

function updateFx(c: Core, dt: number): void {
  for (let i = c.fx.length - 1; i >= 0; i--) {
    const f = c.fx[i];
    if (!f) continue;
    f.t += dt;
    f.tick(Math.min(1, f.t / f.life));
    if (f.t >= f.life) {
      c.root.remove(f.obj);
      f.obj.material.dispose();
      c.fx.splice(i, 1);
    }
  }
}

function spawnZ(c: Core): void {
  const s = glyph('z', '#6f7f9c', 0.2);
  const base = c.headLocal().add(new Vector3(0.14, 0, 0));
  spawnFx(c, s, 2.6, (u) => {
    s.position.set(base.x + 0.2 * u + 0.04 * Math.sin(u * 9), base.y + 0.5 * u, base.z);
    const sc = 0.2 + 0.18 * u;
    s.scale.set(sc, sc, 1);
    s.material.opacity = Math.min(1, u * 5) * (1 - u);
  });
}

/** A "!" that pops up above the head and follows it. */
export function spawnBang(c: Core, color = '#e8473b'): void {
  const s = glyph('!', color, 0.34);
  spawnFx(c, s, 1.1, (u) => {
    s.position.copy(c.headLocal());
    s.position.y += 0.2 + 0.06 * u;
    const sc = 0.34 * (u < 0.15 ? 1.2 * ease(u / 0.15) : 1);
    s.scale.set(sc, sc, 1);
    s.material.opacity = 1 - ramp(u, 0.75, 1);
  });
}

/** A sign that pops up at a point of the figure's space, rises a little, and fades. */
export function spawnGlyph(c: Core, text: string, color: string, p: Vec3, size = 0.3): void {
  const s = glyph(text, color, size);
  const base = c.spaceToRoot(new Vector3(...p));
  spawnFx(c, s, 1.1, (u) => {
    s.position.copy(base);
    s.position.y += 0.16 * ease(u);
    const sc = size * (u < 0.15 ? 1.2 * ease(u / 0.15) : 1);
    s.scale.set(sc, sc, 1);
    s.material.opacity = 1 - ramp(u, 0.7, 1);
  });
}

export function pulse(c: Core, color: string): void {
  const m = new Mesh(
    RING,
    new MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false }),
  );
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 1;
  const at = c.spaceToRoot(ORIGIN);
  m.position.set(at.x, 0.02, at.z);
  spawnFx(c, m, 0.65, (u) => {
    const s = 0.8 + 1.6 * ease(u);
    m.scale.set(s, s, 1);
    m.material.opacity = 0.85 * (1 - u);
  });
}

export function tick(c: Core, dt: number): void {
  c.time += dt;
  Object.assign(c.pose, ZERO, c.base);
  idleTick(c, dt);
  runActs(c, dt);
  applyPose(c, dt);
  for (const t of c.tickers) t(dt);
  updateCarry(c);
  updateFx(c, dt);
}

/**
 * Stops all acts at once and puts the character back on its spot in the rest pose. The
 * promises of the stopped and waiting acts resolve with false. The idle mode stays.
 */
export function reset(c: Core): void {
  const stopped = c.cur ? [c.cur, ...c.queue] : [...c.queue];
  c.cur = null;
  c.queue.length = 0;
  for (const a of stopped) a.resolve(false);
  for (const f of c.fx) {
    c.root.remove(f.obj);
    f.obj.material.dispose();
  }
  c.fx.length = 0;
  for (const fn of c.resets) fn();
  c.figure.position.set(0, 0, 0);
  c.facing = 0;
  c.look.y = c.look.p = c.look.toY = c.look.toP = 0;
  Object.assign(c.pose, ZERO, c.base);
  Object.assign(c.sm, ZERO, c.base);
  applyPose(c, 0);
  for (const t of c.tickers) t(0);
  updateCarry(c);
}

/** A box around the visible meshes of obj, in the space of rel. */
export function visibleBox(obj: Object3D, rel: Object3D): Box3 {
  rel.updateWorldMatrix(true, true);
  const inv = rel.matrixWorld.clone().invert();
  const box = new Box3();
  const b = new Box3();
  obj.traverseVisible((o) => {
    if (!(o instanceof Mesh)) return;
    if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    if (!bb) return;
    box.union(b.copy(bb).applyMatrix4(o.matrixWorld).applyMatrix4(inv));
  });
  return box;
}

// The acts that every character has.
export function commonActs(c: Core): void {
  c.def('hop', () => [
    S(0.55, (u, p) => {
      const k = hopCurve(u, 0.42);
      p.y = k.y;
      p.sy = k.sy;
    }),
  ]);
  c.def('cheer', () => [
    S(1.1, (u, p) => {
      const e = env(u, 0, 0.12, 0.85, 1);
      const wave = 0.2 * Math.sin(u * Math.PI * 8);
      to(p, { lx: -2.9, rx: -2.9, lz: 0.45 + wave, rz: 0.45 - wave, hp: -0.2 }, e);
      const k = hopCurve((u * 2) % 1, 0.3);
      p.y = k.y;
      p.sy = k.sy;
    }),
  ]);
  c.def('alert', () => [
    S(
      0.9,
      (u, p) => {
        to(
          p,
          { lz: 0.8, rz: 0.8, lx: -0.4, rx: -0.4, hp: -0.15, lean: -0.08 },
          env(u, 0, 0.1, 0.6, 1),
        );
        const k = hopCurve(clamp01(u / 0.6), 0.32);
        p.y = k.y;
        p.sy = k.sy;
      },
      { start: () => spawnBang(c) },
    ),
  ]);
  c.def('look', (o) => {
    const target = o.at;
    if (!target) return [];
    let yaw = 0;
    let pitch = 0;
    return [
      S(o.dur ?? 1.2, (u, p) => to(p, { hy: yaw, hp: pitch }, env(u, 0, 0.15, 0.85, 1)), {
        start() {
          c.root.updateWorldMatrix(true, true);
          const q = c.figure.worldToLocal(target.clone());
          const head = c.figure.worldToLocal(c.world(c.rig.head));
          yaw = clamp(Math.atan2(q.x, q.z), -1.4, 1.4);
          pitch = clamp(-Math.atan2(q.y - head.y - 0.2, Math.hypot(q.x, q.z)), -0.6, 0.6);
        },
      }),
    ];
  });
}
