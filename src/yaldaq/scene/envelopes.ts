// The envelopes in the room. Each envelope has a token: the 3D envelope, a glow under it while
// it glides, and its stage at the shown time. Its place comes from its own events: the lab
// table (the forecasts), the mechanic's ladder, the pricer's desk (policy), and then a lit
// cubby of the locker wall in the data vault, where it waits for its close. It glides on lit
// tracks in the floor between the areas. Folders fly between the characters.
//
// The tokens follow the model: a model swap adds and removes tokens, but a token keeps its
// trip and its stage. Only a jump (reset) sets every token at once.
import { Box3, Mesh, Vector3, type Object3D, type Scene } from 'three';
import type { Actor } from '../data/contract';
import type { Envelope, Model } from '../data/model';
import {
  LOCKER_KEEP_MS,
  cubbiesAt,
  stageAt,
  timesOf,
  type EnvelopeStage,
  type StageTimes,
} from '../data/stages';
import { buildEnvelope, buildFolder, type Character, type EnvelopeObject } from './cast';
import { AZ, FACE_VIEWER, at, clamp01, ease, smooth, unitBox, unitCyl, uvOf } from './kit';
import { CUBBIES, type BlastDoor, type Locker } from './props';
import { GLIDE, buildTracks, poolMesh, type Layout, type RouteName, type Tracks } from './set';

/** The actors with a character. The vault is the locker wall. */
export type CastActor = Exclude<Actor, 'vault'>;

type Station = 'brief' | RouteName;

const STAGES: readonly EnvelopeStage[] = ['lab', 'ladder', 'policy', 'locker', 'open'];
const ROUTES: readonly RouteName[] = ['lab', 'ladder', 'policy', 'locker'];
const PREV: Readonly<Record<RouteName, Station>> = {
  lab: 'brief',
  ladder: 'lab',
  policy: 'ladder',
  locker: 'policy',
};
/** The width of an envelope in room units. The cubbies are 0.69 wide. */
const ENV_W = 0.42;
/** An act that waits for an envelope to arrive waits at most this long (wall seconds). */
const WAIT_MAX_S = 5;

interface Trip {
  s: RouteName;
  name: string;
  pts: Vector3[];
  cum: number[];
  total: number;
  dur: number;
  t: number;
}

export interface Token {
  env: Envelope;
  times: StageTimes;
  /** The cubby, or null while the envelope is not in the locker or on its way there. */
  i: number | null;
  obj: EnvelopeObject;
  glow: Mesh;
  base: number;
  stage: EnvelopeStage | null;
  goal: EnvelopeStage | null;
  queue: RouteName[];
  trip: Trip | null;
}

export interface EnvelopeDeps {
  scene: Scene;
  locker: Locker;
  door: BlastDoor;
  chars: Readonly<Record<CastActor, Character>>;
  layout(): Layout;
  addHit(obj: Object3D): void;
  removeHit(obj: Object3D): void;
}

export interface Envelopes {
  readonly tokens: ReadonlyMap<string, Token>;
  /** A new model, or null. Recomputes the times of every token and adds or removes tokens. */
  setModel(model: Model | null, t: number): void;
  /** Adds the tokens that come into the shown span at t and removes the ones that leave it. */
  sync(t: number): void;
  /** Builds the paths and the floor tracks again for the current layout. */
  layoutChanged(): void;
  /** A jump: every token goes to its state at t with no motion. */
  reset(t: number): void;
  /** Puts one token at rest at its stage at t, with no motion. */
  setStatic(tok: Token, t: number): void;
  /** The cubby of a token. It gets one when it has none. */
  cubbyOf(tok: Token, t: number): number;
  /** Moves the tokens. busy: the token that the unseal moves, or null. */
  update(dt: number, t: number, busy: Token | null): void;
  /** Shuts the blast door at once. */
  shutDoor(): void;
  /**
   * A folder flies from one point to another, in an arc. The points are functions, so the
   * folder follows a moving hand or envelope. onArrive runs when it lands; a reset drops the
   * flight and onArrive does not run.
   */
  fly(
    from: () => Vector3,
    to: () => Vector3,
    opts?: { dur?: number; delay?: number; onArrive?: () => void },
  ): void;
  /**
   * Resolves when the envelope has arrived at a stage (at once when it rests there or past
   * it, or is gone). A reset resolves every wait: the caller checks that no jump came between.
   */
  arrival(id: string, stage: RouteName): Promise<void>;
  /** A small wall-time tween. fn gets the progress 0 to 1. A reset clears it. */
  tween(dur: number, fn: (k: number) => void, delay?: number): void;
}

const trackName = (s: RouteName, i: number | null): string =>
  s === 'locker' ? `locker${i ?? 0}` : s;

export function createEnvelopes(deps: EnvelopeDeps): Envelopes {
  const { scene, locker, door, chars } = deps;
  const tokens = new Map<string, Token>();
  let model: Model | null = null;
  let timesById = new Map<string, StageTimes>();

  // Small wall-time tweens for the scripted motion. A reset clears them.
  let tweens: { t: number; dur: number; fn: (k: number) => void }[] = [];
  function runTweens(dt: number): void {
    for (const w of tweens) {
      w.t += dt;
      if (w.t >= 0) w.fn(w.dur ? clamp01(w.t / w.dur) : 1);
    }
    tweens = tweens.filter((w) => w.t < w.dur);
  }

  // The paths of the trips for the current layout, by track name, and the tracks under them.
  let paths = new Map<string, Vector3[]>();
  let tracks: Tracks | null = null;
  let tracksKey = '';

  /** The world point where an envelope rests at one station. */
  function stationPoint(s: Station, i: number | null): Vector3 {
    const L = deps.layout();
    if (s === 'brief') return chars.brief.anchor('prop').add(new Vector3(0, 0.12, 0));
    if (s === 'lab') return at(L.spots.labTable[0], L.spots.labTable[1], 0.8);
    if (s === 'ladder') return chars.ladder.anchor('slot');
    if (s === 'policy') return chars.policy.anchor('slot').add(new Vector3(0, 0.14, 0));
    const c = locker.cub[i ?? 0];
    return locker.root.localToWorld(c ? new Vector3(...c.slot) : new Vector3());
  }
  /** The path of one trip: the last station, the floor points of the route, and the new station. */
  function buildPath(s: RouteName, i: number | null): Vector3[] {
    const L = deps.layout();
    const pts = [stationPoint(PREV[s], i)];
    for (const [u, v, y] of L.routes[s]) pts.push(at(u, v, y ?? GLIDE));
    const c = locker.cub[i ?? 0];
    const last = L.routes.locker.at(-1);
    if (s === 'locker' && c && last) {
      const f = uvOf(locker.root.localToWorld(new Vector3(...c.front)));
      pts.push(at(f.u, last[1], GLIDE), at(f.u, f.v, GLIDE));
    }
    pts.push(stationPoint(s, i));
    return pts;
  }

  /** Builds the tracks again when the set of cubbies in use changes. */
  function refreshTracks(force = false): void {
    const used = new Set<number>();
    for (const tok of tokens.values()) if (tok.i != null) used.add(tok.i);
    const names: string[] = ['lab', 'ladder', 'policy'];
    for (const i of [...used].sort((a, b) => a - b)) names.push(trackName('locker', i));
    const key = names.join(',');
    if (!force && key === tracksKey && tracks) return;
    tracksKey = key;
    if (tracks) {
      scene.remove(tracks.root);
      // Each build makes its own geometries and materials.
      tracks.root.traverse((o) => {
        if (!(o instanceof Mesh)) return;
        o.geometry.dispose();
        for (const m of [o.material].flat()) m.dispose();
      });
    }
    const polys: Record<string, [number, number][]> = {};
    for (const name of names) {
      polys[name] = (paths.get(name) ?? []).map((p) => {
        const q = uvOf(p);
        return [q.u, q.v];
      });
    }
    tracks = buildTracks(polys);
    scene.add(tracks.root);
    // A glide that runs now lights its new track on the next frame.
  }

  function layoutChanged(): void {
    paths = new Map();
    scene.updateMatrixWorld(true);
    for (const s of ROUTES) {
      if (s === 'locker') {
        for (let i = 0; i < CUBBIES; i++) paths.set(trackName(s, i), buildPath(s, i));
      } else paths.set(s, buildPath(s, null));
    }
    for (const tok of tokens.values()) if (tok.trip) tok.trip = null;
    refreshTracks(true);
  }

  /**
   * An opened envelope whose cubby went to a newer envelope (a full locker) has no entry in
   * `cub`. It leaves the room at that moment.
   */
  function displaced(tok: Token, t: number, cub: ReadonlyMap<string, number>): boolean {
    return t >= tok.times.unseal && !cub.has(tok.env.id);
  }

  /** A free cubby for a token that enters the locker at t. */
  function pickCubby(tok: Token, t: number): number {
    const cub = cubbiesAt(timesById, t, CUBBIES);
    const ideal = cub.get(tok.env.id);
    const used = new Set<number>();
    for (const o of tokens.values()) {
      if (o !== tok && o.i != null && !displaced(o, t, cub)) used.add(o.i);
    }
    if (ideal != null && !used.has(ideal)) return ideal;
    for (let i = 0; i < CUBBIES; i++) if (!used.has(i)) return i;
    return ideal ?? 0;
  }
  function cubbyOf(tok: Token, t: number): number {
    if (tok.i == null) {
      tok.i = pickCubby(tok, t);
      refreshTracks();
    }
    return tok.i;
  }

  function clearCubby(i: number): void {
    locker.setLit(i, 'off');
    locker.setDoor(i, 0);
    locker.setBadges(i, { forecasts: 0 });
  }

  function makeToken(env: Envelope, times: StageTimes): Token {
    const obj = buildEnvelope();
    const box = new Box3().setFromObject(obj);
    obj.scale.multiplyScalar(ENV_W / Math.max(0.01, box.max.x - box.min.x));
    obj.visible = false;
    scene.add(obj);
    deps.addHit(obj);
    const glow = poolMesh(0.38, '#7fe3ff', 0.55);
    glow.visible = false;
    scene.add(glow);
    return {
      env,
      times,
      i: null,
      obj,
      glow,
      base: obj.scale.x,
      stage: null,
      goal: null,
      queue: [],
      trip: null,
    };
  }
  function dropToken(tok: Token): void {
    scene.remove(tok.obj, tok.glow);
    deps.removeHit(tok.obj);
    tok.glow.geometry.dispose();
    // The flap of each envelope has its own geometry. The boxes share the unit geometries.
    tok.obj.traverse((o) => {
      if (o instanceof Mesh && o.geometry !== unitBox && o.geometry !== unitCyl)
        o.geometry.dispose();
    });
    if (tok.trip) tracks?.setGlow(tok.trip.name, 0);
    tokens.delete(tok.env.id);
    const i = tok.i;
    if (i != null && ![...tokens.values()].some((o) => o.i === i)) clearCubby(i);
  }

  function setStatic(tok: Token, t: number): void {
    const s = stageAt(tok.times, t);
    tok.stage = tok.goal = s;
    tok.queue = [];
    if (tok.trip) tracks?.setGlow(tok.trip.name, 0);
    tok.trip = null;
    tok.glow.visible = false;
    const o = tok.obj;
    o.visible = !!s;
    o.scale.setScalar(tok.base);
    o.rotation.set(0, AZ, 0);
    o.userData.open(s === 'open' ? 1 : 0);
    if (s === 'locker' || s === 'open') cubbyOf(tok, t);
    if (s === 'open') {
      const c = locker.cub[tok.i ?? 0];
      o.position.copy(locker.root.localToWorld(c ? new Vector3(...c.openSlot) : new Vector3()));
    } else if (s) o.position.copy(stationPoint(s, tok.i));
    if (tok.i != null) {
      locker.setLit(tok.i, s === 'locker' ? 'sealed' : s === 'open' ? 'open' : 'off');
      locker.setDoor(tok.i, s === 'open' ? 1 : 0);
    }
  }

  function sync(t: number): void {
    let changed = false;
    const cub = cubbiesAt(timesById, t, CUBBIES);
    for (const tok of [...tokens.values()]) {
      if (
        !timesById.has(tok.env.id) ||
        t >= tok.times.unseal + LOCKER_KEEP_MS ||
        displaced(tok, t, cub)
      ) {
        dropToken(tok);
        changed = true;
      }
    }
    if (model) {
      for (const env of model.envelopes) {
        const times = timesById.get(env.id);
        if (!times || tokens.has(env.id) || t >= times.unseal + LOCKER_KEEP_MS) continue;
        if (t >= times.unseal && !cub.has(env.id)) continue;
        const tok = makeToken(env, times);
        tokens.set(env.id, tok);
        setStatic(tok, t);
      }
    }
    if (changed) refreshTracks();
  }

  function setModel(m: Model | null, t: number): void {
    model = m;
    timesById = new Map();
    if (m) {
      for (const env of m.envelopes) {
        const times = timesOf(m, env);
        timesById.set(env.id, times);
        const tok = tokens.get(env.id);
        if (tok) {
          tok.env = env;
          tok.times = times;
        }
      }
    }
    sync(t);
  }

  function shutDoor(): void {
    doorOpen = 0;
    door.setDoor(0);
    door.setLamp('shut');
  }

  // Folders fly between the characters: the brief goes out to the three forecasters, their
  // forecasts go into the envelope, and a fill goes from the clerk to the envelope.
  const folders: {
    obj: Object3D;
    from: () => Vector3;
    to: () => Vector3;
    t: number;
    dur: number;
    onArrive?: () => void;
  }[] = [];
  const folderPool: Object3D[] = [];
  function fly(
    from: () => Vector3,
    to: () => Vector3,
    {
      dur = 0.9,
      delay = 0,
      onArrive,
    }: { dur?: number; delay?: number; onArrive?: () => void } = {},
  ): void {
    const obj = folderPool.pop() ?? buildFolder();
    obj.visible = false;
    scene.add(obj);
    folders.push({ obj, from, to, t: -delay, dur, onArrive });
  }
  function updateFolders(dt: number): void {
    for (let i = folders.length - 1; i >= 0; i--) {
      const f = folders[i];
      if (!f) continue;
      f.t += dt;
      if (f.t < 0) continue;
      const u = clamp01(f.t / f.dur);
      const p = f.from().lerp(f.to(), smooth(u));
      p.y += Math.sin(u * Math.PI) * 0.9;
      f.obj.visible = true;
      f.obj.position.copy(p);
      f.obj.rotation.y = FACE_VIEWER + u * Math.PI * 2;
      if (u >= 1) {
        scene.remove(f.obj);
        folderPool.push(f.obj);
        folders.splice(i, 1);
        f.onArrive?.();
      }
    }
  }
  function clearFolders(): void {
    for (const f of folders) {
      scene.remove(f.obj);
      folderPool.push(f.obj);
    }
    folders.length = 0;
  }

  // The trips.
  function startTrip(tok: Token, s: RouteName, t: number): void {
    if (s === 'locker') cubbyOf(tok, t);
    const name = trackName(s, tok.i);
    const pts = paths.get(name) ?? buildPath(s, tok.i);
    const cum = [0];
    for (let j = 1; j < pts.length; j++) {
      const a = pts[j - 1];
      const b = pts[j];
      cum.push((cum[j - 1] ?? 0) + (a && b ? b.distanceTo(a) : 0));
    }
    const total = cum.at(-1) ?? 0;
    // A trip takes at least 1.2 s of wall time, at any replay speed.
    const dur = Math.min(3.2, Math.max(1.2, total / 2.2));
    const appear = s === 'lab';
    tok.trip = { s, name, pts, cum, total, dur, t: appear ? -0.45 : 0 };
    if (appear) {
      // The librarian takes a new envelope from the shelf.
      const o = tok.obj;
      const p0 = pts[0];
      o.visible = true;
      o.userData.open(0);
      if (p0) o.position.copy(p0);
      o.rotation.set(0, AZ, 0);
      tween(0.4, (k) => o.scale.setScalar(tok.base * Math.max(0.01, ease(k))));
    }
  }
  function pointOn(trip: Trip, d: number, out: Vector3): Vector3 {
    const { pts, cum } = trip;
    let j = 1;
    while (j < cum.length - 1 && (cum[j] ?? 0) < d) j++;
    const c0 = cum[j - 1] ?? 0;
    const seg = (cum[j] ?? 0) - c0 || 1;
    const a = pts[j - 1];
    const b = pts[j];
    if (a && b) out.lerpVectors(a, b, clamp01((d - c0) / seg));
    return out;
  }
  function tween(dur: number, fn: (k: number) => void, delay = 0): void {
    tweens.push({ t: -delay, dur, fn });
  }

  let doorOpen = 0;
  function update(dt: number, t: number, busy: Token | null): void {
    runTweens(dt);
    let doorWant = 0;
    for (const tok of tokens.values()) {
      if (tok === busy) continue;
      const want = stageAt(tok.times, t);
      if (want !== tok.goal) {
        const from = tok.goal ? STAGES.indexOf(tok.goal) : -1;
        const to = want ? STAGES.indexOf(want) : -1;
        // The unseal event plays the show. With no show, the envelope opens in place. A stage
        // that goes back (new times after a model swap) also sets the token at once.
        if (want === 'open' || to < from) {
          setStatic(tok, t);
          continue;
        }
        for (let j = from + 1; j <= to; j++) {
          const r = ROUTES[j];
          if (r) tok.queue.push(r);
        }
        tok.goal = want;
      }
      if (!tok.trip) {
        const next = tok.queue.shift();
        if (next) startTrip(tok, next, t);
      }
      const tr = tok.trip;
      if (!tr) continue;
      tr.t += dt;
      if (tr.t < 0) continue;
      const u = clamp01(tr.t / tr.dur);
      const o = tok.obj;
      pointOn(tr, smooth(u) * tr.total, o.position);
      // A small float while it glides, and the light of the track under it.
      if (u > 0 && u < 1) o.position.y += Math.sin(u * Math.PI * 6) * 0.015;
      tok.glow.visible = u < 1;
      tok.glow.position.set(o.position.x, 0.03, o.position.z);
      tracks?.setGlow(tr.name, Math.sin(Math.PI * u));
      if (tr.s === 'locker' && tok.i != null) {
        // The blast door opens as the envelope comes near, and the cubby door opens for it.
        const q = uvOf(o.position);
        const [du, dv] = deps.layout().spots.door;
        doorWant = Math.max(doorWant, clamp01((1.8 - Math.hypot(q.u - du, q.v - dv)) / 0.7));
        locker.setDoor(tok.i, clamp01((u - 0.75) / 0.15) * (1 - clamp01((u - 0.97) / 0.03)));
      }
      if (u >= 1) {
        tok.trip = null;
        tok.stage = tr.s;
        tok.glow.visible = false;
        tracks?.setGlow(tr.name, 0);
        if (tr.s === 'locker' && tok.i != null) {
          locker.setLit(tok.i, 'sealed');
          locker.setDoor(tok.i, 0);
        }
      }
    }
    // The door follows the envelopes on their way in. The unseal moves it itself.
    if (!busy) {
      doorOpen += (doorWant - doorOpen) * Math.min(1, dt * 8);
      door.setDoor(doorOpen);
      door.setLamp(doorOpen > 0.05 ? 'open' : 'shut');
    }
    updateFolders(dt);
    settleWaits(dt);
  }

  // Waits for an envelope to arrive at a stage (see arrival()). A wait ends after WAIT_MAX_S
  // at most, so a token that never makes the trip does not hold an act back.
  let waits: { id: string; at: number; left: number; resolve: () => void }[] = [];
  function arrivedAt(tok: Token | undefined, at: number): boolean {
    return !!tok && !tok.trip && tok.stage !== null && STAGES.indexOf(tok.stage) >= at;
  }
  function arrival(id: string, stage: RouteName): Promise<void> {
    const tok = tokens.get(id);
    const at = STAGES.indexOf(stage);
    if (!tok || arrivedAt(tok, at)) return Promise.resolve();
    return new Promise((resolve) => waits.push({ id, at, left: WAIT_MAX_S, resolve }));
  }
  function settleWaits(dt: number): void {
    if (!waits.length) return;
    waits = waits.filter((w) => {
      const tok = tokens.get(w.id);
      w.left -= dt;
      if (tok && !arrivedAt(tok, w.at) && w.left > 0) return true;
      w.resolve();
      return false;
    });
  }

  function reset(t: number): void {
    tweens = [];
    clearFolders();
    for (const w of waits) w.resolve();
    waits = [];
    shutDoor();
    for (let i = 0; i < CUBBIES; i++) clearCubby(i);
    sync(t);
    const cub = cubbiesAt(timesById, t, CUBBIES);
    for (const tok of tokens.values()) {
      tok.i = cub.get(tok.env.id) ?? null;
      setStatic(tok, t);
    }
    refreshTracks();
  }

  return {
    tokens,
    setModel,
    sync,
    layoutChanged,
    reset,
    setStatic,
    cubbyOf,
    update,
    shutDoor,
    fly,
    arrival,
    tween,
  };
}
