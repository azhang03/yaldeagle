// The props of the firm: the glass locker wall in the data vault, the blast door, the wall
// screen with the scores, the operations console, and the clerk's watch screen. A port of the
// trial's p1/room.js (the props part).
import {
  BoxGeometry,
  CircleGeometry,
  Color,
  CylinderGeometry,
  type Group,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  type Vector3,
} from 'three';
import { type Vec3, kit, texture } from './kit';
import { PAL, ctx2d, desk, monitor, paint, poolMesh } from './set';

export type CubbyLight = 'off' | 'sealed' | 'open';
export type BadgeKind = 'forecasts' | 'orders' | 'fills';
export interface BadgeCounts {
  forecasts: number;
  orders?: number;
  fills?: number;
}
export interface Cubby {
  back: Mesh<PlaneGeometry, MeshBasicMaterial>;
  /** The hinge of the glass door. */
  pivot: Group;
  badges: Mesh[];
  /** Where an envelope rests, in locker space. */
  slot: Vec3;
  /** Where an opened envelope rests: lower, so its letter shows under the shelf above. */
  openSlot: Vec3;
  /** The floor point in front of the cubby, in locker space. */
  front: Vec3;
  pops: { b: Mesh; t: number }[];
}
export interface Locker {
  root: Group;
  /** The height of the locker. */
  H: number;
  cub: Cubby[];
  setLit(i: number, mode: CubbyLight): void;
  /** 0 shut, 1 open. */
  setDoor(i: number, f: number): void;
  setBadges(i: number, counts: BadgeCounts): void;
  /** The badge of the newest count of this kind grows and shrinks once. */
  pop(i: number, kind: BadgeKind): void;
  update(dt: number): void;
  /** The cubby at a point in locker space (its front face), or null between the cubbies. */
  cubbyAt(p: Vector3): number | null;
}

/** The number of cubbies in the locker. */
export const CUBBIES = 12;
const COLS = 4;
const ROWS = 3;
/** The size of one cubby, 0.8 times the cubby of the trial (0.86 by 0.58). */
const IW = 0.688;
const IH = 0.464;
/** The thickness of a post and of a shelf. */
const POST = 0.08;
const SHELF = 0.1;
/** The badges, their spacing, and their discs are 0.8 times the trial's. */
const BADGE = 0.8;
const BADGE_KINDS: readonly BadgeKind[] = [
  'forecasts',
  'orders',
  'orders',
  'orders',
  'fills',
  'fills',
  'fills',
];

/**
 * The glass locker wall in the data vault: a steel frame with four columns and three rows of
 * cubbies. Each cubby has a glass door on a hinge, a light at the back, and a row of stamp
 * badges for the counts. Cubby 0 is at the top left; the index goes along the row.
 */
export function buildLocker(): Locker {
  const k = kit(paint, true);
  const pitchX = IW + POST;
  const pitchY = IH + SHELF + 0.02;
  const cols = Array.from({ length: COLS }, (_, c) => (c - (COLS - 1) / 2) * pitchX);
  // The bottom of each row, top row first, as in the trial.
  const rows = Array.from({ length: ROWS }, (_, r) => 0.16 + (ROWS - 1 - r) * pitchY);
  const D = 0.52;
  const W = COLS * pitchX + POST;
  const topY = 0.16 + (ROWS - 1) * pitchY + IH + 0.06;
  const frame = '#2d3239';
  k.box([W, 0.1, D], [0, 0.05, 0], frame);
  k.box([W, 0.1, D], [0, topY, 0], frame);
  k.box([W, topY, 0.04], [0, topY / 2 + 0.03, -D / 2 + 0.02], '#1c2026');
  for (let c = 0; c <= COLS; c++)
    k.box([POST, topY, D], [(c - COLS / 2) * pitchX, topY / 2 + 0.03, 0], frame);
  for (let r = 1; r < ROWS; r++) k.box([W, SHELF, D], [0, 0.16 + r * pitchY - 0.06, 0], frame);
  k.label('SEALED UNTIL CLOSE', 1.3, 0.08, [0, topY, D / 2 + 0.003], '#cfe8ff', frame);
  const root = k.g;
  const backMat: Record<CubbyLight, Color> = {
    off: new Color('#2a3340'),
    sealed: new Color('#ffcf86'),
    open: new Color('#8ff0b8'),
  };
  const cub: Cubby[] = [];
  const badgeMats: Record<BadgeKind, MeshBasicMaterial> = {
    forecasts: new MeshBasicMaterial({ color: '#7fb0ff' }),
    orders: new MeshBasicMaterial({ color: '#ff8cc6' }),
    fills: new MeshBasicMaterial({ color: '#ffd166' }),
  };
  const disc = new CylinderGeometry(0.045 * BADGE, 0.045 * BADGE, 0.015, 16);
  for (let i = 0; i < CUBBIES; i++) {
    const x = cols[i % COLS] ?? 0;
    const y0 = rows[Math.floor(i / COLS)] ?? 0;
    const back = new Mesh(
      new PlaneGeometry(IW, IH),
      new MeshBasicMaterial({ color: backMat.off.clone() }),
    );
    back.position.set(x, y0 + IH / 2, -D / 2 + 0.045);
    root.add(back);
    // The glass door turns on its left edge.
    const pivot = k.sub([x - IW / 2, y0 + IH / 2, D / 2 - 0.01]);
    const g = k.box([IW, IH, 0.012], [IW / 2, 0, 0], PAL.glass, null, pivot);
    g.castShadow = false;
    k.box([IW, 0.025, 0.02], [IW / 2, IH / 2 - 0.012, 0], '#9aa1ab', null, pivot);
    k.box([IW, 0.025, 0.02], [IW / 2, -IH / 2 + 0.012, 0], '#9aa1ab', null, pivot);
    k.box([0.02, 0.12, 0.03], [IW - 0.05, 0, 0.015], '#c9ced3', null, pivot);
    // The badges stand on the front lip of the cubby floor: one for the forecasts, then up
    // to three for the orders and three for the fills.
    const badges = BADGE_KINDS.map((kind, j) => {
      const m = new Mesh(disc, badgeMats[kind]);
      m.rotation.x = Math.PI / 2;
      const dx = 0.09 + j * 0.1 + (j >= 1 ? 0.04 : 0) + (j >= 4 ? 0.04 : 0);
      m.position.set(x - IW / 2 + dx * BADGE, y0 + 0.06 * BADGE, D / 2 - 0.05);
      m.visible = false;
      root.add(m);
      return m;
    });
    cub.push({
      back,
      pivot,
      badges,
      slot: [x, y0 + 0.28 * BADGE, -0.02],
      openSlot: [x, y0 + 0.28 * BADGE - 0.08, -0.02],
      front: [x, 0, D / 2 + 0.45],
      pops: [],
    });
  }
  root.traverse((o) => {
    if (o instanceof Mesh && !(o.material instanceof MeshBasicMaterial)) o.receiveShadow = true;
  });
  return {
    root,
    H: topY + 0.06,
    cub,
    cubbyAt(p) {
      const c = Math.round(p.x / pitchX + (COLS - 1) / 2);
      const fromBottom = Math.floor((p.y - 0.16) / pitchY);
      const inRow = p.y - 0.16 - fromBottom * pitchY;
      if (c < 0 || c >= COLS || fromBottom < 0 || fromBottom >= ROWS || inRow > IH) return null;
      if (Math.abs(p.x - (cols[c] ?? 0)) > IW / 2) return null;
      return (ROWS - 1 - fromBottom) * COLS + c;
    },
    setLit(i, mode) {
      cub[i]?.back.material.color.copy(backMat[mode]);
    },
    setDoor(i, f) {
      const c = cub[i];
      if (c) c.pivot.rotation.y = -f * 1.7;
    },
    setBadges(i, counts) {
      const c = cub[i];
      if (!c) return;
      const n: Record<BadgeKind, number> = {
        forecasts: counts.forecasts > 0 ? 1 : 0,
        orders: Math.min(3, counts.orders ?? 0),
        fills: Math.min(3, counts.fills ?? 0),
      };
      const seen: Record<BadgeKind, number> = { forecasts: 0, orders: 0, fills: 0 };
      c.badges.forEach((b, j) => {
        const kind = BADGE_KINDS[j] ?? 'forecasts';
        b.visible = seen[kind]++ < n[kind];
      });
    },
    pop(i, kind) {
      const c = cub[i];
      if (!c) return;
      const b = c.badges.filter((m, j) => BADGE_KINDS[j] === kind && m.visible).at(-1);
      if (b) c.pops.push({ b, t: 0 });
    },
    update(dt) {
      for (const c of cub) {
        c.pops = c.pops.filter((p) => {
          p.t += dt;
          const s = 1 + 1.4 * Math.sin(Math.PI * Math.min(1, p.t / 0.6));
          p.b.scale.setScalar(s);
          if (p.t >= 0.6) p.b.scale.setScalar(1);
          return p.t < 0.6;
        });
      }
    },
  };
}

export interface BlastDoor {
  root: Group;
  /** 0 shut, 1 open. */
  setDoor(f: number): void;
  /** 'shut' is red, 'open' is green. */
  setLamp(mode: 'shut' | 'open'): void;
}

/** The blast door of the data vault. It slides to the right into the wall pocket. */
export function buildBlastDoor(): BlastDoor {
  const k = kit(paint, true);
  const slab = k.sub([0, 0, 0]);
  k.box([1.0, 1.02, 0.16], [0, 0.53, 0], '#7d8690', null, slab);
  for (const y of [0.3, 0.55, 0.8]) k.box([0.9, 0.05, 0.02], [0, y, 0.09], '#69717b', null, slab);
  for (let i = 0; i < 5; i++)
    k.box(
      [0.12, 0.09, 0.02],
      [-0.4 + i * 0.2, 0.08, 0.09],
      i % 2 ? '#1b1d20' : '#e8b923',
      [0, 0, 0.5],
      slab,
    );
  k.box([0.05, 0.36, 0.05], [-0.38, 0.6, 0.1], '#c9ced3', null, slab);
  // The keypad on the wall to the left of the door.
  k.box([0.16, 0.22, 0.04], [-0.64, 0.72, 0.1], '#2b2f36');
  const lamp = new Mesh(
    new BoxGeometry(0.1, 0.05, 0.02),
    new MeshBasicMaterial({ color: '#ff4d4d' }),
  );
  lamp.position.set(-0.64, 0.79, 0.125);
  k.g.add(lamp);
  for (let i = 0; i < 3; i++) k.box([0.1, 0.02, 0.01], [-0.64, 0.7 - i * 0.04, 0.122], '#8a8f98');
  k.label('DATA VAULT', 0.9, 0.16, [0, 1.16, 0.0], PAL.sign, PAL.signBg);
  const red = new Color('#ff4d4d');
  const green = new Color('#5cf08f');
  return {
    root: k.g,
    setDoor(f) {
      slab.position.x = f * 1.12;
    },
    setLamp(mode) {
      lamp.material.color.copy(mode === 'open' ? green : red);
    },
  };
}

export type ConsoleJob = 'scanner' | 'loop';
export type ConsoleTone = 'ok' | 'stale' | 'error' | 'idle';
export interface Console {
  root: Group;
  setTone(job: ConsoleJob, tone: ConsoleTone): void;
}

/**
 * The operations console with two job lamps: the scanner and the trading loop. The lamp
 * colors come from the job state at the shown time (ok, stale, error, idle).
 */
export function buildConsole(): Console {
  const k = kit(paint, true);
  desk(k, 1.3, 0.6, { modesty: 1, top: '#3a3f46', body: PAL.black });
  monitor(k, [-0.3, 0.55, -0.15], 0.1, 0, 0.46, 0.28);
  monitor(k, [0.32, 0.55, -0.15], -0.1, 2, 0.4, 0.26);
  k.box([0.7, 0.24, 0.05], [0, 0.72, 0.16], '#22262d', [-0.5, 0, 0]);
  const mats: Record<ConsoleTone, MeshBasicMaterial> = {
    ok: new MeshBasicMaterial({ color: '#5fd07a' }),
    stale: new MeshBasicMaterial({ color: '#e8a32a' }),
    error: new MeshBasicMaterial({ color: '#ff4d4d' }),
    idle: new MeshBasicMaterial({ color: '#7a808a' }),
  };
  const lamp = (x: number, text: string): Mesh => {
    const m = new Mesh(new CircleGeometry(0.06, 20), mats.idle);
    m.position.set(x, 0.76, 0.2);
    m.rotation.x = -0.5;
    k.g.add(m);
    const l = k.label(text, 0.2, 0.05, [x, 0.68, 0.225], '#cfd6de', '#22262d');
    l.rotation.x = -0.5;
    return m;
  };
  const lamps: Record<ConsoleJob, Mesh> = {
    scanner: lamp(-0.17, 'SCAN'),
    loop: lamp(0.17, 'LOOP'),
  };
  return {
    root: k.g,
    setTone(job, tone) {
      lamps[job].material = mats[tone];
    },
  };
}

export interface TapeScreen {
  root: Group;
  show(v: { waiting: number; fills: number }): void;
}

/**
 * The clerk's watch screen on a stand. It shows only YALDAQ's own counts: the sealed orders that
 * wait and the paper fills so far. No trade data.
 */
export function buildTapeScreen(): TapeScreen {
  const k = kit(paint, true);
  k.box([0.4, 0.03, 0.3], [0, 0.015, 0], PAL.black);
  k.box([0.05, 0.9, 0.05], [0, 0.47, -0.03], '#3a3f46');
  k.box([0.98, 0.6, 0.05], [0, 1.18, 0], PAL.black);
  const cv = document.createElement('canvas');
  cv.width = 512;
  cv.height = 300;
  const ctx = ctx2d(cv);
  const map = texture(cv);
  const sc = new Mesh(new PlaneGeometry(0.92, 0.54), new MeshBasicMaterial({ map }));
  sc.position.set(0, 1.18, 0.027);
  k.g.add(sc);
  let last = '';
  return {
    root: k.g,
    show({ waiting, fills }) {
      const key = `${waiting}|${fills}`;
      if (key === last) return;
      last = key;
      ctx.fillStyle = '#0d1424';
      ctx.fillRect(0, 0, 512, 300);
      ctx.fillStyle = '#7cc8dc';
      ctx.font = '800 40px system-ui, sans-serif';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText('FILL WATCH', 26, 46);
      ctx.fillStyle = 'rgba(124,200,220,0.25)';
      ctx.fillRect(26, 78, 460, 3);
      const row = (y: number, label: string, n: number, color: string): void => {
        ctx.fillStyle = '#cfd6de';
        ctx.font = '600 32px system-ui, sans-serif';
        ctx.fillText(label, 26, y);
        for (let i = 0; i < Math.min(6, n); i++) {
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(310 + i * 34, y, 12, 0, Math.PI * 2);
          ctx.fill();
        }
        if (!n) {
          ctx.fillStyle = '#5a6472';
          ctx.fillText('none', 310, y);
        }
      };
      row(130, 'Sealed orders', waiting, '#ff8cc6');
      row(195, 'Paper fills', fills, '#ffd166');
      ctx.fillStyle = '#7a8594';
      ctx.font = '500 24px system-ui, sans-serif';
      ctx.fillText('Counts only. Prices stay sealed.', 26, 262);
      map.needsUpdate = true;
    },
  };
}

const BOARD_W = 1024;
const BOARD_H = 600;

/** The values of the wall screen. A null score shows "--". */
export interface BoardValues {
  claude: number | null;
  strike_rate: number | null;
  base_rate: number | null;
  /** The number of settled markets. */
  markets: number;
  /** The short name of the event that settled last, or null. */
  latest: string | null;
  /** 0 to 1: a green flash over the screen. */
  flash: number;
  /** 0 to 1: a green line that wipes down the screen. */
  wipe: number;
}

const score = (v: number | null): string => (v === null ? '--' : v.toFixed(3));

/** Draws the wall screen. */
function drawBoard(c: CanvasRenderingContext2D, v: BoardValues): void {
  const g = c.createLinearGradient(0, 0, 0, BOARD_H);
  g.addColorStop(0, '#101a33');
  g.addColorStop(1, '#0a1124');
  c.fillStyle = g;
  c.fillRect(0, 0, BOARD_W, BOARD_H);
  c.textAlign = 'center';
  c.textBaseline = 'middle';
  c.fillStyle = '#e9edf5';
  c.font = '800 64px system-ui, sans-serif';
  c.fillText('Claude vs Actuary', BOARD_W / 2, 62);
  const empty = v.markets === 0;
  const col = (x: number, name: string, color: string, val: number | null, lead: boolean): void => {
    c.fillStyle = color;
    c.font = '800 50px system-ui, sans-serif';
    c.fillText(name, x, 146);
    c.font = '800 140px system-ui, sans-serif';
    c.fillText(empty ? '--' : score(val), x, 252);
    if (lead) {
      c.font = '700 30px system-ui, sans-serif';
      c.fillText('LEADS', x, 340);
    }
  };
  const both = !empty && v.claude !== null && v.strike_rate !== null;
  const claudeLeads = both && (v.claude ?? 0) < (v.strike_rate ?? 0);
  col(262, 'Claude', '#f08a66', v.claude, both && claudeLeads);
  col(762, 'Actuary', '#6f9cf0', v.strike_rate, both && !claudeLeads);
  c.fillStyle = '#2a3654';
  c.fillRect(BOARD_W / 2 - 2, 118, 4, 230);
  c.fillStyle = '#9aa6bb';
  c.font = '500 30px system-ui, sans-serif';
  const line = empty
    ? 'No settled markets yet.'
    : `Brier score, lower is better. Grandpa ${score(v.base_rate)}. ${v.markets} settled markets.`;
  c.fillText(line, BOARD_W / 2, 392);
  if (!empty && v.latest) {
    c.fillStyle = '#8ff0b8';
    c.font = '600 28px system-ui, sans-serif';
    c.fillText(`Just added: ${v.latest}`, BOARD_W / 2, 434);
  }
  if (v.wipe > 0 && v.wipe < 1) {
    const y = v.wipe * BOARD_H;
    c.fillStyle = 'rgba(143, 240, 184, 0.18)';
    c.fillRect(0, 0, BOARD_W, y);
    c.fillStyle = '#c9ffe0';
    c.fillRect(0, y - 4, BOARD_W, 8);
  }
  if (v.flash > 0) {
    c.fillStyle = `rgba(143, 240, 184, ${(0.35 * v.flash).toFixed(3)})`;
    c.fillRect(0, 0, BOARD_W, BOARD_H);
  }
}

export interface Board {
  root: Group;
  /** The height of the top edge of the screen. */
  top: number;
  /** The height of the middle of the screen. */
  mid: number;
  show(v: BoardValues): void;
}

/** The big wall screen with the scores. show(v) draws the values. */
export function buildBoard(): Board {
  const k = kit(paint, true);
  const w = 3.0;
  const h = (w * BOARD_H) / BOARD_W;
  const y0 = 1.05;
  const face = k.sub([0, y0 + h / 2, 0.05]);
  k.box([w + 0.12, h + 0.12, 0.06], [0, 0, -0.03], PAL.black, null, face);
  const canvas = document.createElement('canvas');
  canvas.width = BOARD_W;
  canvas.height = BOARD_H;
  const ctx = ctx2d(canvas);
  const map = texture(canvas);
  const screen = new Mesh(new PlaneGeometry(w, h), new MeshBasicMaterial({ map }));
  screen.position.z = 0.002;
  face.add(screen);
  // A soft glow on the floor under the screen.
  const glow = poolMesh(1.8, '#5f86ff', 0.18);
  glow.position.set(0, 0.025, 0.9);
  k.g.add(glow);
  let last = '';
  return {
    root: k.g,
    top: y0 + h + 0.06,
    mid: y0 + h / 2,
    show(v) {
      const key = JSON.stringify(v);
      if (key === last) return;
      last = key;
      drawBoard(ctx, v);
      map.needsUpdate = true;
    },
  };
}
