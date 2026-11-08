// The box kit of the firm: room directions, small helpers, materials, text labels, and the
// box, cylinder, and beam tools. A port of the trial's shared/scene.js (lines 1-164). It uses the
// look of Nick's room: the same camera angle, light, and box kit.
import {
  BoxGeometry,
  CanvasTexture,
  CircleGeometry,
  Color,
  CylinderGeometry,
  Group,
  type BufferGeometry,
  type Material,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  type Object3D,
  PlaneGeometry,
  RingGeometry,
  SRGBColorSpace,
  type Texture,
  Vector3,
} from 'three';

export type Vec3 = readonly [number, number, number];

export const deg = MathUtils.degToRad;
/** The camera direction of the overview. The same values as Nick's room. */
export const AZ = deg(30);
export const EL = deg(38);
/** Floor directions: u goes to the screen right, v comes toward the viewer. */
export const RIGHT = new Vector3(Math.cos(AZ), 0, -Math.sin(AZ));
export const TOWARD = new Vector3(Math.sin(AZ), 0, Math.cos(AZ));
export const UP = new Vector3(0, 1, 0);

/** A floor point from room coordinates. */
export function at(u: number, v: number, y = 0): Vector3 {
  return new Vector3().addScaledVector(RIGHT, u).addScaledVector(TOWARD, v).setY(y);
}

/** The room coordinates of a point. */
export function uvOf(p: Vector3): { u: number; v: number } {
  return { u: p.dot(RIGHT), v: p.dot(TOWARD) };
}

/** The turn about y that makes a model (it faces +z) face the viewer of the overview. */
export const FACE_VIEWER = AZ;

// Small helpers.
export const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));
export const clamp01 = (x: number): number => clamp(x, 0, 1);
/** Ease out (cubic). */
export const ease = (x: number): number => 1 - (1 - clamp01(x)) ** 3;
/** Smoothstep on 0 to 1. */
export function smooth(x: number): number {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
}
export const rand = (a: number, b: number): number => a + Math.random() * (b - a);
/** Turns from angle a toward angle b by the fraction t, the short way. */
export const lerpAngle = (a: number, b: number, t: number): number =>
  a + Math.atan2(Math.sin(b - a), Math.cos(b - a)) * t;

export const unitBox = new BoxGeometry(1, 1, 1);
export const unitCyl = new CylinderGeometry(1, 1, 1, 12);

/** A light grey with the same brightness order as the color. */
export function greyOf(hex: string): string {
  const n = parseInt(hex.slice(1), 16);
  const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  const g = Math.round(150 + 80 * l)
    .toString(16)
    .padStart(2, '0');
  return `#${g}${g}${g}`;
}

export type Paint = ((c: string, map?: Texture | null) => Material) & { tone(c: string): string };

/**
 * Makes the materials for one model. `grey` is a muted look. `ghost` is a flat see-through
 * color. One painter shares one material for each color.
 */
export function painter({
  grey = false,
  ghost = null,
}: { grey?: boolean; ghost?: string | null } = {}): Paint {
  const cache = new Map<string, Material>();
  const tone = (c: string): string => (ghost ? ghost : grey ? greyOf(c) : c);
  const paint = (c: string, map?: Texture | null): Material => {
    const key = c + (map ? map.uuid : '');
    let m = cache.get(key);
    if (!m) {
      const o = { color: tone(c), map: map ?? null };
      m = ghost
        ? new MeshBasicMaterial({ ...o, transparent: true, opacity: 0.4, depthWrite: false })
        : new MeshLambertMaterial(o);
      cache.set(key, m);
    }
    return m;
  };
  return Object.assign(paint, { tone });
}

/** Bold text that fits the width, on a filled background. */
export function textCanvas(
  text: string,
  w: number,
  h: number,
  fg: string,
  bg: string,
): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const x = c.getContext('2d');
  if (!x) return c;
  x.fillStyle = bg;
  x.fillRect(0, 0, w, h);
  x.fillStyle = fg;
  let px = h * 0.62;
  x.font = `800 ${px}px system-ui, sans-serif`;
  const mw = x.measureText(text).width;
  if (mw > w * 0.9) {
    px *= (w * 0.9) / mw;
    x.font = `800 ${px}px system-ui, sans-serif`;
  }
  x.textBaseline = 'middle';
  x.textAlign = 'center';
  x.fillText(text, w / 2, h / 2);
  return c;
}

export function texture(canvas: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

export interface Kit {
  g: Group;
  paint: Paint;
  /** Size s, center p, color c, turn r. The last argument puts the box in another group. */
  box(s: Vec3, p: Vec3, c: string, r?: Vec3 | null, parent?: Object3D): Mesh;
  /** Radius r, length h along y (turn it with rot). */
  cyl(r: number, h: number, p: Vec3, c: string, rot?: Vec3 | null, parent?: Object3D): Mesh;
  /** A box of thickness t from point a to point b. */
  beam(a: Vec3, b: Vec3, t: number, c: string, parent?: Object3D): Mesh;
  /** A flat text label of size w by h at p. */
  label(
    text: string,
    w: number,
    h: number,
    p: Vec3,
    fg: string,
    bg: string,
    parent?: Object3D,
  ): Mesh;
  /** A child group at p, for parts that turn. */
  sub(p?: Vec3, parent?: Object3D): Group;
}

/** The tools that a model uses: boxes, cylinders, beams, and text labels. Models stand on y = 0 and face +z. */
export function kit(paint: Paint = painter(), shadow = true): Kit {
  const g = new Group();
  function add(
    geo: BufferGeometry,
    s: Vec3,
    p: Vec3,
    c: string,
    r?: Vec3 | null,
    parent: Object3D = g,
  ): Mesh {
    const m = new Mesh(geo, paint(c));
    m.scale.set(...s);
    m.position.set(...p);
    if (r) m.rotation.set(...r);
    m.castShadow = shadow;
    parent.add(m);
    return m;
  }
  return {
    g,
    paint,
    box: (s, p, c, r, parent) => add(unitBox, s, p, c, r, parent),
    cyl: (r, h, p, c, rot, parent) => add(unitCyl, [r, h, r], p, c, rot, parent),
    beam(a, b, t, c, parent) {
      const A = new Vector3(...a);
      const B = new Vector3(...b);
      const mid = A.clone().add(B).multiplyScalar(0.5);
      const m = add(unitBox, [t, A.distanceTo(B), t], [mid.x, mid.y, mid.z], c, null, parent);
      m.quaternion.setFromUnitVectors(UP, B.clone().sub(A).normalize());
      return m;
    },
    label(text, w, h, p, fg, bg, parent = g) {
      const map = texture(
        textCanvas(text, Math.round(256 * (w / h)), 256, paint.tone(fg), paint.tone(bg)),
      );
      const m = new Mesh(new PlaneGeometry(w, h), paint('#ffffff', map));
      m.position.set(...p);
      parent.add(m);
      return m;
    },
    sub(p = [0, 0, 0], parent = g) {
      const s = new Group();
      s.position.set(...p);
      parent.add(s);
      return s;
    },
  };
}

/** A flat round patch on the floor with an edge ring, like the patches of Nick's room. */
export function patch(radius: number, tint: string, color: string): Group {
  const g = new Group();
  const fill = new Mesh(new CircleGeometry(radius, 48), new MeshLambertMaterial({ color: tint }));
  const edgeColor = new Color(tint).lerp(new Color(color), 0.3);
  const edge = new Mesh(
    new RingGeometry(radius, radius + 0.06, 48),
    new MeshLambertMaterial({ color: edgeColor }),
  );
  for (const m of [fill, edge]) {
    m.rotation.x = -Math.PI / 2;
    m.position.y = 0.01;
    m.receiveShadow = true;
    g.add(m);
  }
  return g;
}

/** A flat rectangle on the floor (u by v), for paths, rugs, and zones. */
export function floorRect(
  w: number,
  d: number,
  color: string,
  { y = 0.008, opacity = 1 }: { y?: number; opacity?: number } = {},
): Mesh {
  const mat = new MeshLambertMaterial({
    color,
    transparent: opacity < 1,
    opacity,
    depthWrite: opacity >= 1,
  });
  const m = new Mesh(new PlaneGeometry(w, d), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.y = y;
  m.receiveShadow = true;
  return m;
}
