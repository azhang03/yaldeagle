// The setting of the firm: a modern quant firm at night. The floor plans for wide and tall
// screens, the set (floors, walls, glass, furniture, lamps, plants, and signs), and the lit
// floor tracks. A port of the trial's p1/room.js (the set part).
//
// The set uses room coordinates: the set root turns by AZ, so a local x is u (to the screen
// right) and a local z is v (toward the viewer). Every piece faces +z, like the cast.
// The static parts of each piece merge into one mesh for each material, so the mesh count
// stays low on phones.
import {
  AdditiveBlending,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  Color,
  DoubleSide,
  Group,
  type Material,
  Matrix3,
  type Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  RepeatWrapping,
  type Texture,
  Vector3,
} from 'three';
import type { Actor } from '../data/contract';
import { AZ, type Kit, type Paint, type Vec3, kit, painter, texture } from './kit';
import type { Rect } from './stage';

/** The glide height of an envelope on the tracks. */
export const GLIDE = 0.34;

// Materials. A color that starts with '*' glows (it is not lit). A color that starts with
// '~' is glass. All other colors are lit, through one shared painter.
const lit = painter();
const glowMats = new Map<string, MeshBasicMaterial>();
const glassMats = new Map<string, MeshLambertMaterial>();
function paintFn(c: string, map?: Texture | null): Material {
  if (c[0] === '*') {
    const key = c + (map ? map.uuid : '');
    let m = glowMats.get(key);
    if (!m) {
      m = new MeshBasicMaterial({ color: c.slice(1), map: map ?? null });
      glowMats.set(key, m);
    }
    return m;
  }
  if (c[0] === '~') {
    let m = glassMats.get(c);
    if (!m) {
      m = new MeshLambertMaterial({
        color: c.slice(1),
        transparent: true,
        opacity: 0.2,
        depthWrite: false,
        side: DoubleSide,
      });
      glassMats.set(c, m);
    }
    return m;
  }
  return lit(c, map);
}
/** The shared paint of the set and the props. */
export const paint: Paint = Object.assign(paintFn, {
  tone: (c: string): string => c.replace(/^[*~]/, ''),
});

/** The palette of the firm. Warm wood and lamp light against a navy night. */
export const PAL = {
  night: '#121a33',
  plinth: '#0c1226',
  plinthEdge: '#1f2947',
  oak: '#b8875a',
  oak2: '#ab7b50',
  concrete: '#8d8781',
  concreteSeam: '#7d7771',
  polished: '#6f6a66',
  polishedSeam: '#625d59',
  slate: '#353d4a',
  slateLine: '#4a5463',
  carpet: '#2f4a3f',
  carpetEdge: '#284034',
  steel: '#4d555f',
  steelLine: '#424952',
  walnut: '#5a3825',
  walnutTop: '#6e4630',
  walnutDark: '#432a1c',
  black: '#17191d',
  frame: '#22252b',
  plaster: '#d6cbbb',
  plasterDark: '#c2b6a4',
  slatWall: '#2c3240',
  concreteWall: '#6c7078',
  glass: '~#cfeaf5',
  lampGlow: '*#ffd9a0',
  sign: '#f2d7a6',
  signBg: '#2a2f3a',
} as const;

// A small seeded random, so the set looks the same on each load.
let seed = 7;
const rnd = (): number => (seed = (seed * 16807) % 2147483647) / 2147483647;

/** A 2D context, or an error when the browser gives none. */
export function ctx2d(cv: HTMLCanvasElement): CanvasRenderingContext2D {
  const x = cv.getContext('2d');
  if (!x) throw new Error('No 2D canvas context.');
  return x;
}

export type FloorKind = 'wood' | 'concrete' | 'polished' | 'tiles' | 'carpet' | 'steel';
export interface Area {
  name: string;
  floor: FloorKind;
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  sign?: boolean;
}
export interface BackSegment {
  u0: number;
  u1: number;
  kind: 'plaster' | 'windows' | 'concrete';
}
export type WallKind = 'glass' | 'concrete' | 'steel' | 'plaster' | 'low';
export interface Wall {
  a: readonly [number, number];
  b: readonly [number, number];
  kind: WallKind;
  h: number;
  /** Door gaps along the wall, [from, to]. */
  gaps?: readonly (readonly [number, number])[];
  /** The pocket of a sliding door, [from, to]. */
  pocket?: readonly [number, number];
}
/** A home: [u, v, turn]. */
export type Spot = readonly [number, number, number?];
export type PropSpot = 'board' | 'locker' | 'door' | 'console' | 'tape' | 'labTable';
export type SpotName = Exclude<Actor, 'vault'> | PropSpot;
export interface PieceOptions {
  w?: number;
  h?: number;
  d?: number;
  s?: number;
  color?: string;
  items?: 'laptop' | 'ledgers' | 'office';
  side?: number;
}
export type PieceType = keyof typeof PIECES;
/** A piece of furniture: [type, u, v, turn, options]. */
export type Piece = readonly [PieceType, number, number, number?, PieceOptions?];
/** A light pool: [u, v, radius, color]. */
export type Pool = readonly [number, number, number, string?];
/** A floor point of a route: [u, v, glide height]. */
export type RoutePoint = readonly [number, number, number?];
export type RouteName = 'lab' | 'ladder' | 'policy' | 'locker';
export interface Layout {
  rect: Rect;
  bounds: { u0: number; u1: number; v0: number; v1: number };
  areas: readonly Area[];
  back: readonly BackSegment[];
  walls: readonly Wall[];
  spots: Record<SpotName, Spot>;
  pieces: readonly Piece[];
  pools: readonly Pool[];
  routes: Record<RouteName, readonly RoutePoint[]>;
}

/**
 * The floor plans. u goes to the screen right, v comes toward the viewer.
 * areas: the rooms with their floors and names. back: the segments of the high back wall.
 * walls: the partitions (glass, steel, concrete) with door gaps. spots: the home of each actor
 * [u, v, turn] and each prop. pieces: the furniture [type, u, v, turn, options]. pools: the
 * light pools of the lamps. routes: the floor points of each trip of an envelope (a third value
 * is a glide height, to pass over the bouncer's rope).
 */
export const LAYOUTS: Record<'wide' | 'tall', Layout> = {
  wide: {
    rect: { u0: -8.3, u1: 8.3, v0: -5.9, v1: 4.7, top: 2.9 },
    bounds: { u0: -8, u1: 8, v0: -5.6, v1: 4.4 },
    areas: [
      { name: 'Research lab', floor: 'wood', u0: -8, u1: -1.2, v0: -5.6, v1: -1.0, sign: true },
      { name: 'Fill desk', floor: 'concrete', u0: -1.2, u1: 2.4, v0: -5.6, v1: -1.0, sign: true },
      { name: 'Data vault', floor: 'steel', u0: 2.4, u1: 8, v0: -5.6, v1: -1.8, sign: true },
      { name: '', floor: 'concrete', u0: 2.4, u1: 8, v0: -1.8, v1: -0.6 },
      { name: 'Operations', floor: 'tiles', u0: -8, u1: -4.2, v0: -1.0, v1: 4.4 },
      { name: 'Trading desk', floor: 'polished', u0: -4.2, u1: 4.4, v0: -1.0, v1: 4.4 },
      { name: 'Treasurer', floor: 'carpet', u0: 4.4, u1: 8, v0: -0.6, v1: 4.4 },
    ],
    back: [
      { u0: -8, u1: -6.2, kind: 'plaster' },
      { u0: -6.2, u1: -1.2, kind: 'windows' },
      { u0: -1.2, u1: 2.4, kind: 'windows' },
      { u0: 2.4, u1: 8, kind: 'concrete' },
    ],
    walls: [
      { a: [-8, -1.0], b: [-1.2, -1.0], kind: 'glass', h: 1.05, gaps: [[-2.1, -1.42]] },
      { a: [-1.2, -5.6], b: [-1.2, -1.0], kind: 'glass', h: 2.2 },
      { a: [-1.2, -1.0], b: [2.4, -1.0], kind: 'glass', h: 1.05, gaps: [[-0.74, -0.14]] },
      { a: [2.4, -5.6], b: [2.4, -1.8], kind: 'concrete', h: 2.8 },
      {
        a: [2.4, -1.8],
        b: [8, -1.8],
        kind: 'steel',
        h: 0.9,
        gaps: [[2.9, 3.9]],
        pocket: [3.9, 5.1],
      },
      { a: [4.4, -0.6], b: [8, -0.6], kind: 'glass', h: 1.2, gaps: [[4.6, 5.2]] },
      { a: [4.4, -0.6], b: [4.4, 4.4], kind: 'glass', h: 1.0, gaps: [[1.8, 2.6]] },
      { a: [-4.2, -1.0], b: [-4.2, 4.4], kind: 'glass', h: 0.8, gaps: [[1.6, 2.4]] },
      { a: [-8, -5.6], b: [-8, -1.0], kind: 'plaster', h: 2.8 },
      { a: [8, -5.6], b: [8, -1.8], kind: 'concrete', h: 2.8 },
      { a: [-8, -1.0], b: [-8, 4.4], kind: 'low', h: 0.4 },
      { a: [8, -1.8], b: [8, 4.4], kind: 'low', h: 0.4 },
      { a: [-8, 4.4], b: [8, 4.4], kind: 'low', h: 0.16 },
    ],
    spots: {
      base_rate: [-6.6, -4.35, 0.25],
      claude: [-4.2, -4.0, 0],
      strike_rate: [-5.6, -2.3, 0],
      brief: [-7.15, -2.0, 0.12],
      ladder: [-2.4, -2.6, 0],
      shadow: [0.9, -2.8, 0],
      risk: [0.3, -0.7, 0],
      policy: [-2.1, 0.8, 0],
      loop: [0.6, 1.5, 0],
      reconcile: [2.6, 0.7, -0.12],
      demo: [1.0, 3.25, 0],
      scanner: [-6.0, 3.2, 0],
      supervisor: [-5.0, 0.9, 0],
      cost: [6.0, 1.3, 0],
      board: [5.2, -5.5],
      locker: [5.0, -3.7],
      door: [3.4, -1.8],
      console: [-6.9, 0.55],
      tape: [1.85, -3.3, -0.35],
      labTable: [-3.8, -2.2],
    },
    pieces: [
      ['bookshelf', -7.15, -5.38, 0, { w: 1.6, h: 2.1 }],
      ['rug', -6.7, -4.2, 0, { w: 2.1, d: 1.7, color: '#7b4b3a' }],
      ['floorLamp', -7.7, -3.5],
      ['sideTable', -5.75, -4.75],
      ['plant', -4.95, -5.2, 0, { s: 1.35 }],
      ['desk', -4.1, -4.85, 0, { w: 1.6, d: 0.6, items: 'laptop' }],
      ['desk', -5.6, -3.0, 0, { w: 1.4, d: 0.55, items: 'ledgers' }],
      ['workbench', -2.2, -3.45, 0],
      ['labTable', -3.8, -2.2],
      ['plant', -1.5, -1.35, 0, { s: 0.9 }],
      ['plant', -1.55, -5.2, 0, { s: 1.15 }],
      ['coffee', -0.3, -5.25, 0, { w: 1.3 }],
      ['plant', 2.05, -5.2, 0, { s: 1.2 }],
      ['archive', 3.0, -5.3, 0, { w: 0.9 }],
      ['archive', 7.35, -5.3, 0, { w: 1.0 }],
      ['hazard', 3.4, -2.25, 0],
      ['pod', -2.1, 0.8, 0, { side: -1 }],
      ['pod', 0.6, 1.5, 0, { side: 1 }],
      ['pod', 2.6, 0.7, -0.12, { side: -1 }],
      ['decorPod', -2.9, 3.35, 0],
      ['decorPod', 3.3, 3.3, 0],
      ['rug', 0.4, 1.6, 0, { w: 6.4, d: 2.9, color: '#4c372b' }],
      ['plant', -3.85, -0.6, 0, { s: 1.0 }],
      ['plant', 4.05, 4.0, 0, { s: 1.0 }],
      ['rack', -7.55, 3.45],
      ['rack', -6.9, 3.45],
      ['plant', -4.6, 3.95, 0, { s: 1.0 }],
      ['plant', -7.65, -0.55, 0, { s: 0.9 }],
      ['desk', 6.0, 0.5, 0, { w: 1.7, d: 0.62, items: 'office' }],
      ['credenza', 6.85, -0.36, 0, { w: 1.6 }],
      ['armchair', 5.45, 2.95, Math.PI],
      ['armchair', 6.65, 2.95, Math.PI],
      ['rug', 6.05, 2.3, 0, { w: 2.9, d: 2.0, color: '#3d5a4d' }],
      ['floorLamp', 4.75, 0.15],
      ['plant', 7.6, 3.9, 0, { s: 1.25 }],
    ],
    pools: [
      [-7.7, -3.5, 1.5],
      [-5.75, -4.75, 1.0],
      [-4.1, -4.85, 0.9],
      [-5.6, -3.0, 0.9],
      [4.75, 0.15, 1.5],
      [6.0, 0.5, 1.0],
      [-0.3, -5.25, 0.9],
      [5.0, -3.2, 1.9, '#7fc8ff'],
    ],
    routes: {
      lab: [
        [-7.15, -1.45],
        [-3.8, -1.45],
        [-3.8, -1.75],
      ],
      ladder: [
        [-3.8, -1.75],
        [-3.8, -1.45],
        [-1.78, -1.45],
        [-1.78, -2.1],
      ],
      policy: [
        [-1.78, -2.1],
        [-1.78, -0.5],
        [-1.2, -0.5],
        [-1.2, 1.24],
      ],
      locker: [
        [-1.2, 1.24],
        [-1.2, -0.25, 0.74],
        [-0.44, -0.25, 0.74],
        [-0.44, -1.3, 0.74],
        [-0.44, -1.75],
        [3.4, -1.75],
        [3.4, -2.45],
      ],
    },
  },
  tall: {
    rect: { u0: -4.1, u1: 4.1, v0: -10.9, v1: 8.7, top: 2.9 },
    bounds: { u0: -3.8, u1: 3.8, v0: -10.6, v1: 8.4 },
    areas: [
      { name: 'Fill desk', floor: 'concrete', u0: -3.8, u1: -0.6, v0: -10.6, v1: -6.6, sign: true },
      { name: 'Data vault', floor: 'steel', u0: -0.6, u1: 3.8, v0: -10.6, v1: -7.0, sign: true },
      { name: '', floor: 'concrete', u0: -0.6, u1: 3.8, v0: -7.0, v1: -6.6 },
      { name: 'Trading desk', floor: 'polished', u0: -3.8, u1: 1.3, v0: -6.6, v1: -1.4 },
      { name: 'Treasurer', floor: 'carpet', u0: 1.3, u1: 3.8, v0: -6.6, v1: -1.4 },
      { name: 'Research lab', floor: 'wood', u0: -3.8, u1: 3.8, v0: -1.4, v1: 3.8 },
      { name: 'Operations', floor: 'tiles', u0: -3.8, u1: 3.8, v0: 3.8, v1: 8.4 },
    ],
    back: [
      { u0: -3.8, u1: -0.6, kind: 'windows' },
      { u0: -0.6, u1: 3.8, kind: 'concrete' },
    ],
    walls: [
      { a: [-3.8, -6.6], b: [-0.6, -6.6], kind: 'glass', h: 1.05, gaps: [[-2.54, -1.94]] },
      { a: [-0.6, -10.6], b: [-0.6, -7.0], kind: 'concrete', h: 2.8 },
      {
        a: [-0.6, -7.0],
        b: [3.8, -7.0],
        kind: 'steel',
        h: 0.9,
        gaps: [[-0.5, 0.5]],
        pocket: [0.5, 1.7],
      },
      { a: [1.3, -6.6], b: [3.8, -6.6], kind: 'glass', h: 1.1, gaps: [[1.5, 2.0]] },
      { a: [1.3, -6.6], b: [1.3, -1.4], kind: 'glass', h: 1.0, gaps: [[-3.6, -2.9]] },
      { a: [-3.8, -1.4], b: [3.8, -1.4], kind: 'glass', h: 1.2, gaps: [[0.7, 1.26]] },
      { a: [-3.8, 3.8], b: [3.8, 3.8], kind: 'glass', h: 0.9, gaps: [[2.0, 2.7]] },
      { a: [-3.8, -10.6], b: [-3.8, -6.6], kind: 'plaster', h: 2.8 },
      { a: [3.8, -10.6], b: [3.8, -7.0], kind: 'concrete', h: 2.8 },
      { a: [-3.8, -6.6], b: [-3.8, 8.4], kind: 'low', h: 0.4 },
      { a: [3.8, -7.0], b: [3.8, 8.4], kind: 'low', h: 0.4 },
      { a: [-3.8, 8.4], b: [3.8, 8.4], kind: 'low', h: 0.16 },
    ],
    spots: {
      shadow: [-2.1, -8.2, 0],
      risk: [-1.5, -6.3, 0],
      policy: [-2.6, -4.6, 0],
      loop: [-0.4, -5.3, 0],
      reconcile: [-0.5, -3.0, 0],
      demo: [-2.5, -2.45, 0],
      cost: [2.4, -4.6, 0],
      claude: [-0.6, -0.5, 0],
      base_rate: [-2.8, -0.4, 0.2],
      strike_rate: [-2.0, 2.0, 0],
      brief: [1.4, 2.6, 0],
      ladder: [2.5, 0.7, 0],
      scanner: [-1.5, 5.3, 0],
      supervisor: [2.4, 6.3, 0],
      board: [1.6, -10.5],
      locker: [1.6, -9.0],
      door: [0.0, -7.0],
      console: [0.7, 5.0],
      tape: [-1.15, -8.8, -0.35],
      labTable: [0.3, 1.3],
    },
    pieces: [
      ['coffee', -3.05, -10.25, 0, { w: 1.2 }],
      ['plant', -1.05, -10.2, 0, { s: 1.15 }],
      ['hazard', 0.0, -7.45, 0],
      ['archive', 3.4, -10.3, 0, { w: 0.7 }],
      ['pod', -2.6, -4.6, 0, { side: -1 }],
      ['pod', -0.4, -5.3, 0, { side: 1 }],
      ['pod', -0.5, -3.0, 0, { side: -1 }],
      ['rug', -1.3, -4.0, 0, { w: 4.6, d: 3.8, color: '#4c372b' }],
      ['plant', -3.5, -6.2, 0, { s: 0.95 }],
      ['plant', 0.95, -1.8, 0, { s: 0.9 }],
      ['desk', 2.5, -5.45, 0, { w: 1.5, d: 0.6, items: 'office' }],
      ['armchair', 2.0, -2.55, Math.PI],
      ['armchair', 3.1, -2.55, Math.PI],
      ['rug', 2.55, -3.4, 0, { w: 2.2, d: 2.4, color: '#3d5a4d' }],
      ['floorLamp', 3.5, -6.25],
      ['plant', 3.45, -1.8, 0, { s: 1.05 }],
      ['bookshelf', -3.15, -1.2, 0, { w: 1.1, h: 1.15 }],
      ['rug', -2.9, -0.2, 0, { w: 1.8, d: 1.4, color: '#7b4b3a' }],
      ['floorLamp', -3.55, 0.75],
      ['desk', -2.1, 1.35, 0, { w: 1.3, d: 0.5, items: 'ledgers' }],
      ['desk', -0.5, -1.08, 0, { w: 1.3, d: 0.48, items: 'laptop' }],
      ['workbench', 2.75, -0.05, 0],
      ['labTable', 0.3, 1.3],
      ['plant', 3.45, 3.4, 0, { s: 1.0 }],
      ['plant', -3.45, 3.4, 0, { s: 1.1 }],
      ['rack', -3.3, 4.45],
      ['rack', -2.65, 4.45],
      ['coffee', 2.85, 4.3, 0, { w: 1.3 }],
      ['decorPod', -0.2, 7.4, 0],
      ['plant', -3.45, 7.95, 0, { s: 1.0 }],
      ['plant', 3.45, 7.95, 0, { s: 1.0 }],
    ],
    pools: [
      [-3.55, 0.75, 1.4],
      [3.5, -6.25, 1.4],
      [2.5, -5.45, 1.0],
      [-2.1, 1.35, 0.9],
      [-0.5, -1.08, 0.9],
      [-3.05, -10.25, 0.9],
      [2.85, 4.3, 0.9],
      [1.6, -8.5, 1.9, '#7fc8ff'],
    ],
    routes: {
      lab: [
        [0.74, 3.15],
        [0.3, 3.15],
        [0.3, 1.75],
      ],
      ladder: [
        [0.3, 1.75],
        [3.12, 1.75],
        [3.12, 1.2],
      ],
      policy: [
        [3.12, 1.2],
        [0.98, 1.2],
        [0.98, -3.75],
        [-1.9, -3.75],
        [-1.9, -4.16],
      ],
      locker: [
        [-1.9, -4.16],
        [-1.9, -5.75, 0.74],
        [-2.24, -5.75, 0.74],
        [-2.24, -6.85, 0.74],
        [-2.24, -6.85],
        [0.0, -6.85],
        [0.0, -7.8],
      ],
    },
  },
};

// Textures.

/** The night city behind the windows: navy sky, towers, and warm lit windows. It repeats. */
let nightTex: Texture | null = null;
function night(): Texture {
  if (nightTex) return nightTex;
  const W = 1024;
  const H = 512;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const x = ctx2d(cv);
  const g = x.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0b1230');
  g.addColorStop(0.65, '#1c2a5a');
  g.addColorStop(1, '#3a3a6a');
  x.fillStyle = g;
  x.fillRect(0, 0, W, H);
  for (let i = 0; i < 70; i++) {
    x.fillStyle = `rgba(255,255,255,${0.25 + rnd() * 0.5})`;
    x.fillRect(rnd() * W, rnd() * H * 0.45, 2, 2);
  }
  x.fillStyle = '#f4ecd2';
  x.beginPath();
  x.arc(W * 0.72, H * 0.17, 26, 0, Math.PI * 2);
  x.fill();
  for (let layer = 0; layer < 2; layer++) {
    let px = -20;
    while (px < W) {
      const w = 50 + rnd() * 90;
      const h = (layer ? 120 : 200) + rnd() * (layer ? 160 : 180);
      x.fillStyle = layer ? '#0a0f24' : '#141c3c';
      x.fillRect(px, H - h, w, h);
      if (layer) {
        for (let wy = H - h + 12; wy < H - 8; wy += 16)
          for (let wx = px + 8; wx < px + w - 8; wx += 13)
            if (rnd() < 0.3) {
              x.fillStyle = rnd() < 0.8 ? 'rgba(255,214,140,0.85)' : 'rgba(190,220,255,0.8)';
              x.fillRect(wx, wy, 6, 8);
            }
      }
      px += w + 6 + rnd() * 20;
    }
  }
  const t = texture(cv);
  t.wrapS = RepeatWrapping;
  nightTex = t;
  return t;
}

/** Abstract charts in our own colors for the monitors. Decor only: no data, no numbers. */
const chartTexs: Texture[] = [];
const CHART_COLORS = ['#d97757', '#3f74c9', '#9aa1ab', '#2a9d8f', '#e8b923'] as const;
function chart(i: number): Texture {
  const cached = chartTexs[i];
  if (cached) return cached;
  const W = 256;
  const H = 160;
  const cv = document.createElement('canvas');
  cv.width = W;
  cv.height = H;
  const x = ctx2d(cv);
  x.fillStyle = '#0d1424';
  x.fillRect(0, 0, W, H);
  x.strokeStyle = 'rgba(120,150,200,0.14)';
  x.lineWidth = 1;
  for (let gx = 0; gx < W; gx += 32) x.strokeRect(gx, 0, 0, H);
  for (let gy = 0; gy < H; gy += 32) x.strokeRect(0, gy, W, 0);
  if (i % 3 === 2) {
    // Bars.
    for (let b = 0; b < 12; b++) {
      const h = 20 + rnd() * 100;
      x.fillStyle = CHART_COLORS[b % 2 ? 1 : 0];
      x.globalAlpha = 0.85;
      x.fillRect(14 + b * 19, H - 14 - h, 12, h);
    }
    x.globalAlpha = 1;
  } else {
    for (let l = 0; l < 3; l++) {
      x.strokeStyle = CHART_COLORS[(l + i) % CHART_COLORS.length] ?? CHART_COLORS[0];
      x.lineWidth = 3;
      x.beginPath();
      let y = 40 + rnd() * 80;
      for (let px = 8; px < W - 8; px += 12) {
        y = Math.max(16, Math.min(H - 16, y + (rnd() - 0.5) * 26));
        if (px === 8) x.moveTo(px, y);
        else x.lineTo(px, y);
      }
      x.stroke();
    }
  }
  const t = texture(cv);
  chartTexs[i] = t;
  return t;
}

/** A soft round light pool for the floor under a lamp. */
let poolTex: Texture | null = null;
function poolMap(): Texture {
  if (poolTex) return poolTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const x = ctx2d(cv);
  const g = x.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.45, 'rgba(255,255,255,0.45)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 128, 128);
  poolTex = texture(cv);
  return poolTex;
}
const poolMats = new Map<string, MeshBasicMaterial>();
function poolMat(color: string, opacity: number): MeshBasicMaterial {
  const key = color + opacity;
  let m = poolMats.get(key);
  if (!m) {
    m = new MeshBasicMaterial({
      map: poolMap(),
      color,
      transparent: true,
      opacity,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    poolMats.set(key, m);
  }
  return m;
}
/** A light pool mesh on the floor. The page also uses one under a gliding envelope. */
export function poolMesh(r: number, color = '#ffc98a', opacity = 0.32): Mesh {
  const m = new Mesh(new PlaneGeometry(2 * r, 2 * r), poolMat(color, opacity));
  m.rotation.x = -Math.PI / 2;
  m.renderOrder = 2;
  return m;
}

// Merging. Each piece merges its static meshes into one mesh for each material.
function mergeParts(parts: readonly (readonly [BufferGeometry, Matrix4])[]): BufferGeometry {
  let nv = 0;
  let ni = 0;
  for (const [geo] of parts) {
    const n = geo.getAttribute('position').count;
    nv += n;
    ni += geo.index ? geo.index.count : n;
  }
  const pos = new Float32Array(nv * 3);
  const nor = new Float32Array(nv * 3);
  const uv = new Float32Array(nv * 2);
  const idx = new Uint32Array(ni);
  const v = new Vector3();
  const nm = new Matrix3();
  let ov = 0;
  let oi = 0;
  for (const [geo, m] of parts) {
    nm.getNormalMatrix(m);
    const P = geo.getAttribute('position');
    const N = geo.getAttribute('normal');
    const U = geo.attributes.uv;
    for (let i = 0; i < P.count; i++) {
      v.fromBufferAttribute(P, i).applyMatrix4(m);
      pos[(ov + i) * 3] = v.x;
      pos[(ov + i) * 3 + 1] = v.y;
      pos[(ov + i) * 3 + 2] = v.z;
      v.fromBufferAttribute(N, i).applyMatrix3(nm).normalize();
      nor[(ov + i) * 3] = v.x;
      nor[(ov + i) * 3 + 1] = v.y;
      nor[(ov + i) * 3 + 2] = v.z;
      if (U) {
        uv[(ov + i) * 2] = U.getX(i);
        uv[(ov + i) * 2 + 1] = U.getY(i);
      }
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) idx[oi + i] = geo.index.getX(i) + ov;
    else for (let i = 0; i < P.count; i++) idx[oi + i] = ov + i;
    ov += P.count;
    oi += geo.index ? geo.index.count : P.count;
  }
  const out = new BufferGeometry();
  out.setAttribute('position', new BufferAttribute(pos, 3));
  out.setAttribute('normal', new BufferAttribute(nor, 3));
  out.setAttribute('uv', new BufferAttribute(uv, 2));
  out.setIndex(new BufferAttribute(idx, 1));
  out.computeBoundingSphere();
  return out;
}
/** Merges the meshes of group g (at its origin) into one mesh for each material. */
function bake(g: Group): Group {
  g.updateMatrixWorld(true);
  const inv = g.matrixWorld.clone().invert();
  const by = new Map<
    Material,
    { parts: [BufferGeometry, Matrix4][]; cast: boolean; order: number }
  >();
  g.traverse((o) => {
    if (!(o instanceof Mesh)) return;
    const mat: unknown = o.material;
    if (Array.isArray(mat) || !mat) return;
    const key = mat as Material;
    const m = inv.clone().multiply(o.matrixWorld);
    let e = by.get(key);
    if (!e) {
      e = { parts: [], cast: false, order: o.renderOrder };
      by.set(key, e);
    }
    e.parts.push([o.geometry as BufferGeometry, m]);
    e.cast ||= o.castShadow;
  });
  const out = new Group();
  for (const [mat, e] of by) {
    const mesh = new Mesh(mergeParts(e.parts), mat);
    const basic = mat instanceof MeshBasicMaterial;
    mesh.castShadow = e.cast && !(mat.transparent || basic);
    mesh.receiveShadow = !basic;
    mesh.renderOrder = e.order;
    out.add(mesh);
  }
  return out;
}

// Furniture. Each builder adds boxes to kit k around the origin of a piece. +z faces the viewer.

/** A lit screen plane with a texture. */
export function screenMesh(w: number, h: number, map: Texture): Mesh {
  return new Mesh(new PlaneGeometry(w, h), paint('*#ffffff', map));
}
/** A black monitor with a lit chart screen. */
export function monitor(k: Kit, p: Vec3, turn: number, chartI: number, w = 0.46, h = 0.28): void {
  const s = k.sub(p);
  s.rotation.y = turn;
  k.box([0.18, 0.02, 0.12], [0, 0.01, 0], PAL.black, null, s);
  k.box([0.04, 0.12, 0.04], [0, 0.07, -0.02], PAL.black, null, s);
  k.box([w + 0.04, h + 0.04, 0.03], [0, 0.13 + h / 2, 0], PAL.black, null, s);
  const sc = screenMesh(w, h, chart(chartI));
  sc.position.set(0, 0.13 + h / 2, 0.017);
  s.add(sc);
}
/** A desk at height h. modesty: the side of the front panel (+1 the viewer side, -1 the back). */
export function desk(
  k: Kit,
  w: number,
  d: number,
  {
    h = 0.55,
    modesty = 1,
    top = PAL.walnutTop,
    body = PAL.walnut,
  }: { h?: number; modesty?: number; top?: string; body?: string } = {},
): void {
  k.box([w, 0.05, d], [0, h - 0.025, 0], top);
  for (const s of [-1, 1])
    k.box([0.05, h - 0.05, d - 0.04], [s * (w / 2 - 0.03), (h - 0.05) / 2, 0], body);
  k.box([w - 0.1, h * 0.5, 0.03], [0, h * 0.55, modesty * (d / 2 - 0.04)], body);
}
function chair(k: Kit, p: Vec3, turn: number): void {
  const s = k.sub(p);
  s.rotation.y = turn;
  k.box([0.36, 0.06, 0.36], [0, 0.33, 0], '#2a2d33', null, s);
  k.box([0.36, 0.38, 0.05], [0, 0.6, -0.17], '#2a2d33', null, s);
  k.cyl(0.025, 0.28, [0, 0.17, 0], '#8a8f98', null, s);
  k.box([0.42, 0.03, 0.05], [0, 0.03, 0], '#3a3d44', null, s);
  k.box([0.05, 0.03, 0.42], [0, 0.03, 0], '#3a3d44', null, s);
}
const GREENS = ['#3f7d4a', '#56954f', '#2f6a42'] as const;
function plant(k: Kit, s = 1): void {
  k.cyl(0.15 * s, 0.3 * s, [0, 0.15 * s, 0], '#d8cfc2');
  k.cyl(0.13 * s, 0.02, [0, 0.3 * s, 0], '#4a3626');
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + rnd() * 0.4;
    const tall = (0.35 + rnd() * 0.3) * s;
    const lean = 0.35 + rnd() * 0.25;
    k.box(
      [0.06 * s, tall, 0.18 * s],
      [Math.cos(a) * 0.08 * s, 0.3 * s + tall / 2, Math.sin(a) * 0.08 * s],
      GREENS[i % 3] ?? GREENS[0],
      [Math.sin(a) * lean, -a, Math.cos(a) * lean],
    );
  }
}
function floorLamp(k: Kit): void {
  k.cyl(0.14, 0.03, [0, 0.015, 0], PAL.black);
  k.cyl(0.018, 1.32, [0, 0.68, 0], '#b08d57');
  k.cyl(0.17, 0.22, [0, 1.42, 0], PAL.lampGlow);
  k.cyl(0.18, 0.02, [0, 1.53, 0], '#b08d57');
}
function deskLamp(k: Kit, p: Vec3, turn = 0): void {
  const s = k.sub(p);
  s.rotation.y = turn;
  k.box([0.12, 0.02, 0.12], [0, 0.01, 0], PAL.black, null, s);
  k.beam([0, 0.01, 0], [0.04, 0.3, -0.02], 0.02, '#b08d57', s);
  k.box([0.14, 0.06, 0.1], [0.08, 0.3, 0.02], '#b08d57', [0, 0, -0.3], s);
  k.box([0.1, 0.012, 0.07], [0.09, 0.27, 0.02], PAL.lampGlow, [0, 0, -0.3], s);
}
const BOOKS = [
  '#8c3b2f',
  '#2f4f6f',
  '#c9a227',
  '#3f6f4f',
  '#d8cfc2',
  '#6b4a7a',
  '#a5562c',
  '#1f2a3a',
] as const;
function books(k: Kit, x0: number, x1: number, y: number, z: number, maxH = 0.3): void {
  let x = x0;
  while (x < x1 - 0.05) {
    const w = 0.04 + rnd() * 0.05;
    const h = maxH * (0.7 + rnd() * 0.3);
    if (x + w > x1) break;
    if (rnd() < 0.1) {
      x += w;
      continue;
    }
    const c = BOOKS[Math.floor(rnd() * BOOKS.length)] ?? BOOKS[0];
    k.box([w - 0.006, h, 0.2], [x + w / 2, y + h / 2, z], c);
    x += w;
  }
}
function bookshelf(k: Kit, w: number, h: number): void {
  const d = 0.32;
  k.box([w, h, 0.03], [0, h / 2, -d / 2 + 0.015], PAL.walnutDark);
  for (const s of [-1, 1]) k.box([0.04, h, d], [s * (w / 2 - 0.02), h / 2, 0], PAL.walnut);
  const n = Math.max(2, Math.round(h / 0.42));
  for (let i = 0; i <= n; i++) {
    const y = 0.02 + (i * (h - 0.04)) / n;
    k.box([w - 0.06, 0.03, d - 0.02], [0, y, 0], PAL.walnut);
    if (i < n) books(k, -w / 2 + 0.05, w / 2 - 0.05, y + 0.015, 0.01, (h - 0.1) / n - 0.06);
  }
}
const LEDGERS = ['#2f4f6f', '#8c3b2f', '#3f6f4f', '#2a2a2a'] as const;
function ledgers(k: Kit, x: number, y: number, z: number): void {
  LEDGERS.forEach((c, i) =>
    k.box([0.26, 0.05, 0.19], [x + (rnd() - 0.5) * 0.03, y + 0.025 + i * 0.05, z], c, [
      0,
      (rnd() - 0.5) * 0.3,
      0,
    ]),
  );
}
function laptop(k: Kit, x: number, y: number, z: number): void {
  k.box([0.32, 0.015, 0.22], [x, y + 0.008, z], '#9aa1ab');
  const s = k.sub([x, y + 0.015, z - 0.11]);
  s.rotation.x = -0.25;
  k.box([0.32, 0.21, 0.012], [0, 0.105, 0], '#9aa1ab', null, s);
  const sc = screenMesh(0.29, 0.18, chart(1));
  sc.position.set(0, 0.105, 0.007);
  s.add(sc);
}
function mug(k: Kit, x: number, y: number, z: number, c = '#f4f1ea'): void {
  k.cyl(0.035, 0.08, [x, y + 0.04, z], c);
}

const PIECES = {
  bookshelf(k: Kit, o: PieceOptions): void {
    bookshelf(k, o.w ?? 1, o.h ?? 1);
  },
  rug(k: Kit, o: PieceOptions): void {
    const w = o.w ?? 1;
    const d = o.d ?? 1;
    const color = o.color ?? '#7b4b3a';
    const r = k.box([w, 0.008, d], [0, 0.006, 0], color);
    r.castShadow = false;
    const edge = new Color(color).offsetHSL(0, 0, 0.05).getStyle();
    const e = k.box([w - 0.16, 0.009, d - 0.16], [0, 0.007, 0], edge);
    e.castShadow = false;
  },
  floorLamp(k: Kit): void {
    floorLamp(k);
  },
  sideTable(k: Kit): void {
    k.cyl(0.22, 0.04, [0, 0.5, 0], PAL.walnutTop);
    k.cyl(0.03, 0.48, [0, 0.25, 0], PAL.black);
    k.cyl(0.14, 0.02, [0, 0.01, 0], PAL.black);
    k.cyl(0.06, 0.18, [0.06, 0.61, -0.04], '#d8cfc2');
    k.cyl(0.13, 0.14, [0.06, 0.77, -0.04], PAL.lampGlow);
    mug(k, -0.1, 0.52, 0.06);
  },
  plant(k: Kit, o: PieceOptions): void {
    plant(k, o.s ?? 1);
  },
  desk(k: Kit, o: PieceOptions): void {
    const w = o.w ?? 1.4;
    desk(k, w, o.d ?? 0.6, { modesty: 1 });
    const y = 0.55;
    if (o.items === 'laptop') {
      laptop(k, -0.2, y, 0);
      deskLamp(k, [w / 2 - 0.18, y, -0.1], -0.4);
      mug(k, 0.15, y, 0.1, '#d97757');
    }
    if (o.items === 'ledgers') {
      ledgers(k, -0.35, y, -0.02);
      ledgers(k, -0.05, y, 0.04);
      deskLamp(k, [w / 2 - 0.18, y, -0.1], -0.4);
      k.box([0.22, 0.01, 0.16], [0.25, y + 0.005, 0.08], '#fbfaf6', [0, 0.2, 0]);
    }
    if (o.items === 'office') {
      monitor(k, [-0.35, y, -0.12], 0.15, 2, 0.42, 0.26);
      deskLamp(k, [w / 2 - 0.2, y, -0.12], -0.4);
      k.box([0.3, 0.02, 0.22], [0.15, y + 0.01, 0.08], '#e9e2d4', [0, -0.2, 0]);
      k.cyl(0.05, 0.1, [-0.7, y + 0.05, 0.1], '#3f7d4a');
    }
  },
  workbench(k: Kit): void {
    desk(k, 1.2, 0.55, { h: 0.6, top: '#8a6a48', body: '#4a4f57', modesty: -1 });
    // A pegboard with tool shapes behind the bench.
    k.box([1.1, 0.6, 0.03], [0, 1.05, -0.26], '#c8b496');
    const tools = ['#e08a1e', '#4a4f57', '#c0392b'] as const;
    for (let i = 0; i < 5; i++)
      k.box(
        [0.04, 0.22 + rnd() * 0.14, 0.02],
        [-0.42 + i * 0.2, 1.05, -0.24],
        tools[i % 3] ?? tools[0],
        [0, 0, (rnd() - 0.5) * 0.6],
      );
    k.box([0.24, 0.12, 0.16], [-0.3, 0.66, 0.02], '#c0392b');
    k.box([0.3, 0.06, 0.12], [0.25, 0.63, 0.05], '#7d858c');
  },
  labTable(k: Kit): void {
    k.box([1.1, 0.05, 0.62], [0, 0.62, 0], '#ece8e0');
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) k.box([0.04, 0.6, 0.04], [sx * 0.5, 0.3, sz * 0.26], '#9aa1ab');
    k.box([1.0, 0.03, 0.5], [0, 0.14, 0], '#9aa1ab');
    // Three small pucks in the colors of the three forecasters: decor, no data.
    ['#d97757', '#3f74c9', '#8a8f98'].forEach((c, i) =>
      k.cyl(0.05, 0.03, [-0.38 + i * 0.12, 0.66, 0.2], c),
    );
    k.label('FORECASTS', 0.5, 0.09, [0.2, 0.47, 0.316], PAL.sign, PAL.signBg);
  },
  coffee(k: Kit, o: PieceOptions): void {
    const w = o.w ?? 1.2;
    k.box([w, 0.8, 0.5], [0, 0.4, 0], PAL.walnut);
    k.box([w + 0.04, 0.04, 0.54], [0, 0.82, 0], '#e9e4dc');
    for (let i = 0; i < 3; i++)
      k.box([w / 3 - 0.04, 0.68, 0.01], [-w / 3 + (i * w) / 3, 0.42, 0.252], PAL.walnutTop);
    k.box([0.3, 0.4, 0.3], [-w / 2 + 0.28, 1.04, -0.05], PAL.black);
    k.box([0.22, 0.08, 0.1], [-w / 2 + 0.28, 1.0, 0.12], '#9aa1ab');
    k.box([0.05, 0.03, 0.01], [-w / 2 + 0.28, 1.17, 0.106], '*#7cf0c8');
    ['#f4f1ea', '#d97757', '#3f74c9'].forEach((c, i) => mug(k, 0.05 + i * 0.1, 0.84, 0.08, c));
    k.cyl(0.06, 0.2, [w / 2 - 0.16, 0.94, -0.05], '#b08d57');
    k.label('COFFEE', 0.5, 0.11, [0.2, 1.42, -0.2], PAL.sign, PAL.signBg);
  },
  archive(k: Kit, o: PieceOptions): void {
    const w = o.w ?? 1;
    const h = 1.7;
    k.box([w, h, 0.4], [0, h / 2, 0], '#3a4049');
    const n = Math.round(w / 0.3);
    const bw = w / n;
    for (let r = 0; r < 4; r++)
      for (let c = 0; c < n; c++) {
        k.box(
          [bw - 0.04, 0.32, 0.02],
          [-w / 2 + bw / 2 + c * bw, 0.25 + r * 0.4, 0.205],
          r % 2 ? '#5b636e' : '#525a64',
        );
        k.box([0.08, 0.04, 0.01], [-w / 2 + bw / 2 + c * bw, 0.3 + r * 0.4, 0.218], '#c9ced3');
      }
  },
  hazard(k: Kit): void {
    for (let i = 0; i < 6; i++) {
      const b = k.box(
        [0.16, 0.006, 0.34],
        [-0.45 + i * 0.18, 0.004, 0],
        i % 2 ? '#1b1d20' : '#e8b923',
        [0, 0.5, 0],
      );
      b.castShadow = false;
    }
  },
  pod(k: Kit, o: PieceOptions): void {
    // A walnut wing beside the station of a character, with two monitors turned in.
    const s = o.side ?? 1;
    const x = s * 0.9;
    k.box([0.55, 0.05, 0.6], [x, 0.525, 0.05], PAL.walnutTop);
    k.box([0.05, 0.5, 0.55], [x + s * 0.25, 0.25, 0.05], PAL.walnut);
    k.box([0.5, 0.26, 0.03], [x, 0.3, 0.33], PAL.walnut);
    monitor(k, [x, 0.55, -0.05], -s * 0.55, 0, 0.42, 0.26);
    monitor(k, [x - s * 0.02, 0.55, 0.3], -s * 1.1, 1, 0.36, 0.22);
    // A low glass screen at the back of the pod.
    k.box([1.6, 0.5, 0.02], [s * 0.45, 0.82, -0.45], PAL.glass);
    k.box([1.6, 0.03, 0.04], [s * 0.45, 1.07, -0.45], PAL.frame);
  },
  decorPod(k: Kit): void {
    // An empty desk with its screens to the viewer and its chair on the near side.
    desk(k, 1.4, 0.62, { modesty: -1 });
    monitor(k, [-0.26, 0.55, -0.16], 0.12, 2, 0.44, 0.27);
    monitor(k, [0.26, 0.55, -0.16], -0.12, 0, 0.44, 0.27);
    chair(k, [0.0, 0, 0.55], Math.PI);
    mug(k, 0.55, 0.55, 0.12);
  },
  rack(k: Kit): void {
    const h = 1.45;
    k.box([0.6, h, 0.6], [0, h / 2, 0], PAL.black);
    k.box([0.54, h - 0.08, 0.01], [0, h / 2, 0.301], '#22262d');
    const leds = ['*#58e0a0', '*#4fb3ff', '*#58e0a0', '*#ffb347'] as const;
    for (let i = 0; i < 9; i++) {
      const y = 0.14 + i * 0.145;
      k.box([0.46, 0.1, 0.01], [0, y, 0.307], '#2c3139');
      const led = leds[Math.floor(rnd() * 4)] ?? leds[0];
      k.box([0.03, 0.02, 0.01], [-0.19, y, 0.314], led);
      k.box([0.03, 0.02, 0.01], [-0.14, y, 0.314], '*#58e0a0');
    }
  },
  credenza(k: Kit, o: PieceOptions): void {
    const w = o.w ?? 1.6;
    k.box([w, 0.5, 0.36], [0, 0.27, 0], PAL.walnut);
    k.box([w + 0.02, 0.03, 0.38], [0, 0.53, 0], PAL.walnutTop);
    for (const s of [-1, 1])
      k.box([w / 2 - 0.04, 0.4, 0.01], [(s * w) / 4, 0.27, 0.182], PAL.walnutTop);
    k.cyl(0.08, 0.22, [-w / 2 + 0.2, 0.65, 0], '#d8cfc2');
    ledgers(k, w / 2 - 0.25, 0.545, 0);
  },
  armchair(k: Kit): void {
    const c = '#8a5a3c';
    k.box([0.62, 0.22, 0.6], [0, 0.2, 0], c);
    k.box([0.62, 0.42, 0.14], [0, 0.5, -0.24], c);
    for (const s of [-1, 1]) k.box([0.1, 0.22, 0.56], [s * 0.28, 0.4, 0], c);
    for (const sx of [-1, 1])
      for (const sz of [-1, 1]) k.box([0.04, 0.1, 0.04], [sx * 0.26, 0.05, sz * 0.24], PAL.black);
  },
};

// The floors.
function floor(k: Kit, a: Area): void {
  const w = a.u1 - a.u0;
  const d = a.v1 - a.v0;
  const cu = (a.u0 + a.u1) / 2;
  const cv = (a.v0 + a.v1) / 2;
  const slab = (c: string): Mesh => k.box([w, 0.06, d], [cu, -0.03, cv], c);
  const line = (sw: number, sd: number, x: number, z: number, c: string): Mesh =>
    k.box([sw, 0.004, sd], [x, 0.002, z], c);
  if (a.floor === 'wood') {
    slab(PAL.oak);
    for (let z = a.v0 + 0.25, i = 0; z < a.v1; z += 0.25, i++)
      if (i % 2) line(w, 0.25, cu, z, PAL.oak2);
  } else if (a.floor === 'concrete' || a.floor === 'polished') {
    const seam = a.floor === 'concrete' ? PAL.concreteSeam : PAL.polishedSeam;
    slab(a.floor === 'concrete' ? PAL.concrete : PAL.polished);
    for (let x = a.u0 + 1.6; x < a.u1 - 0.2; x += 1.6) line(0.02, d, x, cv, seam);
    for (let z = a.v0 + 1.6; z < a.v1 - 0.2; z += 1.6) line(w, 0.02, cu, z, seam);
  } else if (a.floor === 'tiles') {
    slab(PAL.slate);
    for (let x = a.u0 + 0.6; x < a.u1 - 0.05; x += 0.6) line(0.025, d, x, cv, PAL.slateLine);
    for (let z = a.v0 + 0.6; z < a.v1 - 0.05; z += 0.6) line(w, 0.025, cu, z, PAL.slateLine);
  } else if (a.floor === 'carpet') {
    slab(PAL.carpetEdge);
    line(w - 0.3, d - 0.3, cu, cv, PAL.carpet);
  } else {
    slab(PAL.steel);
    for (let x = a.u0 + 0.9; x < a.u1 - 0.1; x += 0.9) line(0.03, d, x, cv, PAL.steelLine);
    for (let z = a.v0 + 0.9; z < a.v1 - 0.1; z += 0.9) line(w, 0.03, cu, z, PAL.steelLine);
  }
}

// The walls.
const WALL_T = 0.12;
const WALL_COLOR: Record<WallKind, string> = {
  plaster: PAL.plaster,
  concrete: PAL.concreteWall,
  steel: '#5d6670',
  low: PAL.plasterDark,
  glass: PAL.plaster,
};
/** The pieces of [a, b] outside the gaps. */
function spans(
  a: number,
  b: number,
  gaps: readonly (readonly [number, number])[] = [],
): [number, number][] {
  const out: [number, number][] = [];
  let s = a;
  for (const [g0, g1] of [...gaps].sort((p, q) => p[0] - q[0])) {
    if (g0 > s) out.push([s, g0]);
    s = g1;
  }
  if (b > s) out.push([s, b]);
  return out;
}
function wall(k: Kit, w: Wall): void {
  const alongU = w.a[1] === w.b[1];
  const fixed = alongU ? w.a[1] : w.a[0];
  const lo = alongU ? Math.min(w.a[0], w.b[0]) : Math.min(w.a[1], w.b[1]);
  const hi = alongU ? Math.max(w.a[0], w.b[0]) : Math.max(w.a[1], w.b[1]);
  const put = (len: number, mid: number, h: number, y: number, c: string, t = WALL_T): Mesh =>
    k.box(alongU ? [len, h, t] : [t, h, len], alongU ? [mid, y, fixed] : [fixed, y, mid], c);
  for (const [s0, s1] of spans(lo, hi, w.gaps)) {
    const len = s1 - s0;
    const mid = (s0 + s1) / 2;
    if (w.kind === 'glass') {
      put(len, mid, w.h - 0.06, w.h / 2, PAL.glass, 0.02).castShadow = false;
      put(len, mid, 0.05, 0.025, PAL.frame, 0.06);
      put(len, mid, 0.04, w.h, PAL.frame, 0.06);
      const step = Math.max(0.6, len / Math.max(1, Math.round(len / 1.2)));
      for (let x = s0; x <= s1 + 1e-6; x += step) put(0.04, x, w.h, w.h / 2, PAL.frame, 0.06);
      put(0.04, s1, w.h, w.h / 2, PAL.frame, 0.06);
    } else {
      const pocket = w.pocket;
      if (pocket && s0 >= pocket[0] - 1e-6 && s0 < pocket[1]) {
        // The door pocket is a little higher, so the open door hides in it.
        const p1 = Math.min(s1, pocket[1]);
        put(p1 - s0, (s0 + p1) / 2, 1.12, 0.56, WALL_COLOR[w.kind], 0.22);
        if (s1 > p1) put(s1 - p1, (p1 + s1) / 2, w.h, w.h / 2, WALL_COLOR[w.kind]);
      } else put(len, mid, w.h, w.h / 2, WALL_COLOR[w.kind]);
      if (w.kind === 'steel') put(len, mid, 0.08, 0.05, '#e8b923', WALL_T + 0.01);
    }
  }
}
/** The high back wall: windows to the night, plaster, or concrete. */
function backWall(k: Kit, seg: BackSegment, v: number): void {
  const H = 2.9;
  const w = seg.u1 - seg.u0;
  const mid = (seg.u0 + seg.u1) / 2;
  const z = v - WALL_T / 2;
  if (seg.kind === 'windows') {
    k.box([w, 0.45, WALL_T], [mid, 0.225, z], PAL.plaster);
    k.box([w, 0.3, WALL_T], [mid, H - 0.15, z], PAL.plaster);
    const glassH = H - 0.75;
    const geo = new PlaneGeometry(w, glassH);
    const uv = geo.getAttribute('uv');
    for (let i = 0; i < uv.count; i++) uv.setX(i, (uv.getX(i) * w + seg.u0) / 5);
    const pane = new Mesh(geo, paint('*#ffffff', night()));
    pane.position.set(mid, 0.45 + glassH / 2, z);
    k.g.add(pane);
    const n = Math.max(1, Math.round(w / 1.1));
    for (let i = 0; i <= n; i++)
      k.box([0.06, glassH, 0.08], [seg.u0 + (i * w) / n, 0.45 + glassH / 2, z + 0.02], PAL.frame);
    k.box([w, 0.05, 0.1], [mid, 0.45, z + 0.03], PAL.frame);
    k.box([w, 0.05, 0.1], [mid, 1.95, z + 0.03], PAL.frame);
  } else if (seg.kind === 'concrete') {
    k.box([w, H, WALL_T], [mid, H / 2, z], PAL.concreteWall);
    for (let x = seg.u0 + 1.4; x < seg.u1 - 0.1; x += 1.4)
      k.box([0.02, H, 0.01], [x, H / 2, v + 0.001], '#60646b');
    k.box([w, 0.02, 0.01], [mid, 1.45, v + 0.001], '#60646b');
  } else {
    k.box([w, H, WALL_T], [mid, H / 2, z], PAL.plaster);
    k.box([w, 0.1, 0.03], [mid, 0.05, v + 0.015], PAL.walnutDark);
  }
}
/** A sign with the area name, on the back wall or on the floor at the front left. */
function areaSign(k: Kit, a: Area, backV: number): void {
  const text = a.name.toUpperCase();
  const wpx = Math.min(2.2, 0.16 * text.length + 0.3);
  if (a.v0 === backV) {
    const m = k.label(
      text,
      wpx,
      0.2,
      [a.u0 + wpx / 2 + 0.25, 2.62, backV + 0.01],
      PAL.sign,
      PAL.signBg,
    );
    m.castShadow = false;
  } else {
    const m = k.label(
      text,
      wpx,
      0.2,
      [a.u0 + wpx / 2 + 0.2, 0.01, a.v1 - 0.2],
      '#f6ead2',
      '#00000000',
    );
    m.rotation.x = -Math.PI / 2;
    const mat: unknown = m.material;
    if (!Array.isArray(mat)) (mat as Material).transparent = true;
    m.castShadow = false;
  }
}

/** A piece of furniture that can hide during a visit. */
export interface SetPiece {
  obj: Group;
  u: number;
  v: number;
}
export interface FirmSet {
  root: Group;
  pieces: SetPiece[];
  /** setFlash(k) lights the activity strip of the server racks (for a scanner cycle). */
  racks: { setFlash(f: number): void };
}

/** Builds the set of one floor plan. */
export function buildSet(L: Layout): FirmSet {
  seed = 7;
  const root = new Group();
  root.rotation.y = AZ;
  const B = L.bounds;
  const pieces: SetPiece[] = [];
  // The plinth: the firm floats in the night like a diorama.
  const pk = kit(paint, false);
  pk.box(
    [B.u1 - B.u0 + 0.5, 0.5, B.v1 - B.v0 + 0.5],
    [(B.u0 + B.u1) / 2, -0.31, (B.v0 + B.v1) / 2],
    PAL.plinth,
  );
  pk.box(
    [B.u1 - B.u0 + 0.56, 0.05, B.v1 - B.v0 + 0.56],
    [(B.u0 + B.u1) / 2, -0.085, (B.v0 + B.v1) / 2],
    PAL.plinthEdge,
  );
  root.add(bake(pk.g));
  // The floors, the walls, and the signs.
  const fk = kit(paint, false);
  for (const a of L.areas) floor(fk, a);
  root.add(bake(fk.g));
  const wk = kit(paint, true);
  for (const seg of L.back) backWall(wk, seg, B.v0);
  for (const w of L.walls) wall(wk, w);
  root.add(bake(wk.g));
  const sk = kit(paint, false);
  for (const a of L.areas) if (a.name) areaSign(sk, a, B.v0);
  root.add(bake(sk.g));
  // The light pools.
  const lk = new Group();
  for (const [u, v, r, c] of L.pools) {
    const m = poolMesh(r, c ?? '#ffc98a', c ? 0.22 : 0.3);
    m.position.set(u, 0.02, v);
    lk.add(m);
  }
  root.add(bake(lk));
  // The furniture.
  const racks: Mesh<BoxGeometry, MeshBasicMaterial>[] = [];
  for (const [type, u, v, turn = 0, o = {}] of L.pieces) {
    const k = kit(paint, true);
    PIECES[type](k, o);
    const obj = bake(k.g);
    obj.position.set(u, 0, v);
    obj.rotation.y = turn;
    root.add(obj);
    if (type === 'rack') {
      const strip = new Mesh(
        new BoxGeometry(0.06, 1.2, 0.01),
        new MeshBasicMaterial({ color: '#1d4a3a' }),
      );
      strip.position.set(0.2, 0.72, 0.31);
      obj.add(strip);
      racks.push(strip);
    }
    if (type !== 'rug' && type !== 'hazard') pieces.push({ obj, u, v });
  }
  const dim = new Color('#1d4a3a');
  const on = new Color('#7cf0c8');
  return {
    root,
    pieces,
    racks: {
      setFlash(f) {
        for (const s of racks) s.material.color.copy(dim).lerp(on, f);
      },
    },
  };
}

export interface Tracks {
  root: Group;
  /** Makes route `name` glow by k (0 to 1), while an envelope travels on it. */
  setGlow(name: string, k: number): void;
}

/**
 * The lit tracks in the floor along the polylines (room points [u, v]). One material for each
 * route, so a route can glow brighter while an envelope travels on it.
 */
export function buildTracks(routes: Readonly<Record<string, readonly RoutePoint[]>>): Tracks {
  const root = new Group();
  root.rotation.y = AZ;
  const mats = new Map<string, { core: MeshBasicMaterial; halo: MeshBasicMaterial }>();
  let i = 0;
  for (const [name, pts] of Object.entries(routes)) {
    const core = new MeshBasicMaterial({ color: '#3a93ab' });
    const halo = new MeshBasicMaterial({
      color: '#2a6f86',
      transparent: true,
      opacity: 0.35,
      blending: AdditiveBlending,
      depthWrite: false,
    });
    mats.set(name, { core, halo });
    const g = new Group();
    const y = 0.008 + i++ * 0.0015;
    for (let j = 1; j < pts.length; j++) {
      const a = pts[j - 1];
      const b = pts[j];
      if (!a || !b) continue;
      const [u0, v0] = a;
      const [u1, v1] = b;
      const len = Math.hypot(u1 - u0, v1 - v0);
      if (len < 1e-3) continue;
      const ang = Math.atan2(-(v1 - v0), u1 - u0);
      const c = new Mesh(new BoxGeometry(len + 0.05, 0.006, 0.05), core);
      c.position.set((u0 + u1) / 2, y, (v0 + v1) / 2);
      c.rotation.y = ang;
      const h = new Mesh(new PlaneGeometry(len + 0.2, 0.22), halo);
      h.rotation.set(-Math.PI / 2, 0, ang);
      h.position.set((u0 + u1) / 2, y + 0.002, (v0 + v1) / 2);
      h.renderOrder = 2;
      g.add(c, h);
    }
    const merged = bake(g);
    merged.traverse((o) => {
      if (o instanceof Mesh) o.receiveShadow = false;
    });
    root.add(merged);
  }
  const base = new Color('#3a93ab');
  const bright = new Color('#d8fbff');
  return {
    root,
    setGlow(name, k) {
      const m = mats.get(name);
      if (!m) return;
      m.core.color.copy(base).lerp(bright, k);
      m.halo.opacity = 0.35 + 0.45 * k;
    },
  };
}
