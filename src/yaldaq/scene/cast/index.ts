// The public face of the cast: buildCharacter makes one character, and playEvent plays the
// act for one data event.
import { BoxGeometry, Mesh, MeshBasicMaterial, RingGeometry, Vector3 } from 'three';
import type { Group } from 'three';
import type { Actor, FeedEvent } from '../../data/contract';
import { clamp01 } from '../kit';
import { ACTORS_A } from './actors-a';
import { ACTORS_B } from './actors-b';
import { ACTORS_C } from './actors-c';
import {
  ORIGIN,
  REASONS,
  commonActs,
  enqueue,
  makeCore,
  pulse,
  reset,
  tick,
  visibleBox,
  walkSteps,
} from './core';
import type { ActOptions, Builder, CastInfo } from './core';
import { book, buildFolder } from './rig';

export { CAST, PIPELINE } from './core';
export type { ActOptions, CastInfo } from './core';
export { buildCoin, buildEnvelope, buildFolder } from './rig';
export type { EnvelopeObject } from './rig';

const BUILD: Partial<Record<Actor, Builder>> = { ...ACTORS_A, ...ACTORS_B, ...ACTORS_C };
/** The work light under a character that plays an act. */
const WORK_RING = new RingGeometry(0.36, 0.46, 48);

/** One character of the cast, as the room uses it. */
export interface Character {
  actor: Actor;
  info: CastInfo;
  root: Group;
  figure: Group;
  prop: Group;
  height: number;
  hit: Mesh;
  /** The names of the acts, for menus: the shared acts and then the acts of this actor. */
  acts: string[];
  anchor(name: string): Vector3;
  update(dt: number): void;
  act(name: string, opts?: ActOptions): Promise<boolean>;
  busy(): boolean;
  setIdle(mode: string): void;
  setLevel(x: number): void;
  setAlarm(on: boolean): void;
  /** vault: the number of sealed envelopes inside the safe (0 to 6 show). Others: no effect. */
  setCount(n: number): void;
  walkTo(point: Vector3, opts?: { speed?: number; stop?: number }): Promise<boolean>;
  walkHome(opts?: { speed?: number }): Promise<boolean>;
  /**
   * Shows or hides the brief folder: on the 'desk' mark of the station while the character
   * works on a brief, or in the right hand when the station has no desk.
   */
  holdBrief(on: boolean): void;
  holdsBrief(): boolean;
  /** The world point of the brief folder, for the flight to the envelope. */
  briefPoint(): Vector3;
  pulse(color?: string): void;
  reset(): void;
}

/** Builds the character of one actor. See the brief and the cast table for the cast. */
export function buildCharacter(actor: Actor): Character {
  const build = BUILD[actor];
  if (!build) throw new Error(`No character for actor "${actor}"`);
  const c = makeCore(actor);
  commonActs(c);
  const common = c.names.length;
  build(c);
  const mine = c.names.slice(common);
  const main = c.main;
  c.defs.work = (o) => c.defs[main]?.(o) ?? [];
  // The head mark goes just above the top of the figure. Measure it in the rest pose.
  const headMark = c.F.sub([0, 0, 0], c.rig.head);
  c.marks.head = headMark;
  tick(c, 0);
  const figBox = visibleBox(c.figure, c.root);
  const height = figBox.max.y;
  const top = c.rig.head.worldToLocal(new Vector3(0, height + 0.08, 0));
  headMark.position.set(0, top.y, 0);
  const slot = c.marks.slot ?? c.mark('slot', [0, 0.75, 0.4], c.space);
  if (!c.marks.prop) c.mark('prop', [0, height, 0], c.space);
  // The hit box covers the figure and the prop. Its material does not draw, but rays hit it.
  const box = visibleBox(c.space, c.root);
  box.expandByScalar(0.06);
  box.min.y = 0;
  const size = box.getSize(new Vector3());
  const hit = new Mesh(
    new BoxGeometry(size.x, size.y, size.z),
    new MeshBasicMaterial({ visible: false }),
  );
  box.getCenter(hit.position);
  hit.userData.actor = actor;
  hit.userData.box = box;
  c.root.add(hit);

  const character: Character = {
    actor,
    info: c.info,
    root: c.root,
    figure: c.figure,
    prop: c.prop,
    height,
    hit,
    acts: ['work', ...c.names.slice(0, common), ...mine],
    anchor(name) {
      const o =
        name === 'head' ? headMark : name === 'hand' ? c.rig.handR : (c.marks[name] ?? slot);
      return c.world(o);
    },
    update: (dt) => tick(c, dt),
    act(name, opts = {}) {
      const fn = c.defs[name];
      if (!fn) return Promise.resolve(false);
      return enqueue(c, opts.key ?? name, () => fn(opts), !!opts.keep);
    },
    busy: () => !!c.cur || c.queue.length > 0,
    setIdle(mode) {
      if (mode === 'idle' || mode === 'read' || mode === 'nap') c.idle = mode;
    },
    setLevel(x) {
      c.level = clamp01(Number(x) || 0);
    },
    setAlarm(on) {
      c.alarm = !!on;
    },
    setCount(n) {
      c.setCount?.(Math.max(0, Math.floor(Number(n) || 0)));
    },
    walkTo(point, { speed = 1, stop = 0 } = {}) {
      const target = c.toSpace(point);
      const hop = 0.36 / Math.max(0.2, speed);
      return enqueue(c, 'walk', () => walkSteps(c, target, { hop, turn: hop * 0.4, stop }), true);
    },
    walkHome({ speed = 1 } = {}) {
      const hop = 0.36 / Math.max(0.2, speed);
      return enqueue(
        c,
        'walk',
        () => walkSteps(c, ORIGIN, { hop, turn: hop * 0.4, face: 0 }),
        true,
      );
    },
    pulse: (color = c.info.color) => pulse(c, color),
    reset: () => reset(c),
    holdBrief: (on) => void (brief.visible = on),
    holdsBrief: () => brief.visible,
    briefPoint: () => (brief.parent === c.rig.body ? c.world(c.rig.handR) : c.world(brief)),
  };
  // A book for the reading idle, in a tint of the actor color.
  c.book = book(c.F, c.rig.body, c.info.color);
  c.book.visible = false;
  c.book.scale.setScalar(1.35);
  c.carry.push({ obj: c.book, hand: 'B', off: [0, 0.06, 0.02], rot: [-0.7, 0, 0] });
  const brief = buildFolder();
  brief.visible = false;
  const desk = c.marks.desk;
  if (desk) desk.add(brief);
  else {
    c.rig.body.add(brief);
    c.carry.push({ obj: brief, hand: 'R', off: [0, 0.02, 0.06], rot: [-0.5, 0, 0] });
  }
  c.resets.push(() => (brief.visible = false));
  // The work light: a ring on the floor in the actor color. It glows while the character
  // plays an act, so a visitor sees who works at the moment.
  const ring = new Mesh(
    WORK_RING,
    new MeshBasicMaterial({
      color: c.info.color,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    }),
  );
  ring.rotation.x = -Math.PI / 2;
  ring.renderOrder = 1;
  ring.visible = false;
  c.root.add(ring);
  let lit = 0;
  c.tickers.push((dt) => {
    const busy = !!c.cur || c.queue.length > 0;
    // dt 0 is a reset: the light goes out at once.
    lit = dt === 0 ? 0 : clamp01(lit + (busy ? dt / 0.25 : -dt / 0.6));
    ring.visible = lit > 0.01;
    if (!ring.visible) return;
    const at = c.spaceToRoot(c.figure.position);
    ring.position.set(at.x, 0.015, at.z);
    ring.material.opacity = lit * (0.6 + 0.25 * Math.sin(c.time * 4));
  });
  return character;
}

/**
 * Plays the local act for one data event of this character's actor. Every call also pulses
 * the floor ring. speed is the replay speed (it sets the length of a Claude call). dur, when
 * set, is the wall time of a Claude call (the part that is left). n is the number of the same
 * events in a run: the controls count one bead or mark for each forecast. runTo is a world
 * point: on a network error, the foreman runs there and back. cast is an optional map of actor
 * id to Character: a loop cycle with open markets then also makes the clerk watch the tape,
 * because the trading cycle is the tape check.
 */
export function playEvent(
  ch: Character,
  ev: FeedEvent & { end?: number },
  {
    speed = 1,
    dur,
    n = 1,
    runTo = null,
    cast = null,
  }: {
    speed?: number;
    dur?: number;
    n?: number;
    runTo?: Vector3 | null;
    cast?: Partial<Record<Actor, Character>> | null;
  } = {},
): Promise<unknown> {
  const kind = ev.kind;
  const A = (name: string, o?: ActOptions): Promise<boolean> => ch.act(name, o);
  ch.pulse(ch.info.color);
  switch (ch.actor) {
    case 'scanner':
      if (kind === 'cycle') return A('scan', { series: 9 });
      if (kind === 'requests') return A('ping');
      if (kind === 'skip') return A('work', { small: true });
      break;
    case 'brief':
      if (kind === 'brief') return A('hand');
      break;
    case 'claude':
      if (kind === 'call') {
        const real = (Date.parse(ev.t_end ?? '') - Date.parse(ev.t)) / 1000;
        const sec = Number.isFinite(real) && real > 0 ? real : 12;
        return A('call', {
          dur: Math.max(dur ?? sec / Math.max(speed, 0.01), 2.5),
          searches: ev.searches ?? 0,
        });
      }
      break;
    case 'strike_rate':
    case 'base_rate':
      if (kind === 'forecast') return A('count', { n });
      break;
    case 'ladder':
      if (kind === 'repair') return A('fix');
      break;
    case 'policy':
      if (kind === 'order') return A('stamp');
      if (kind === 'pass') {
        const reasons = ev.reasons ?? {};
        const keys = Object.keys(reasons).filter((k) => reasons[k]);
        return Promise.all(
          keys.map((k) =>
            A('sign', { text: REASONS[k] ?? k.replace(/_/g, ' ').toUpperCase(), key: `sign:${k}` }),
          ),
        );
      }
      break;
    case 'risk':
      if (kind === 'pass') return A('block');
      break;
    case 'loop':
      if (kind === 'cycle') {
        const ring = A('tick');
        const open = Number(ev.counts?.open_markets) || 0;
        const clerk = cast?.shadow;
        if (!clerk || open <= 0) return ring;
        // The clerk check comes about 0.5 s after the ring. The wait is part of the act, so reset() clears it.
        return Promise.all([
          ring,
          clerk.act('watch', { n: Math.min(4, open), delay: 0.5, pulse: true }),
        ]);
      }
      break;
    case 'shadow':
      if (kind === 'fill') return A('stamp');
      if (kind === 'settle') return A('settle');
      break;
    case 'demo':
      if (kind === 'requests') return A('mirror');
      break;
    case 'reconcile':
      if (kind === 'reconcile') return ev.ok === false ? A('alert', { bad: true }) : A('stamp');
      break;
    case 'cost':
      if (kind === 'spend') return A('coin');
      break;
    case 'supervisor':
      if (kind === 'stall_check') return A('check');
      if (kind === 'error') return A('alarm', runTo ? { runTo } : {});
      break;
    case 'vault':
      if (kind === 'unseal') return A('open');
      break;
  }
  return Promise.resolve(false);
}
