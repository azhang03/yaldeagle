// The parts of the cast: the small objects that fly between characters, the figure rig,
// and the gear (hair, caps, glasses, and hand tools).
import { BufferAttribute, BufferGeometry, Mesh } from 'three';
import type { Group, Object3D } from 'three';
import { clamp01, kit } from '../kit';
import type { Kit } from '../kit';
import { KRAFT, PAINT, WAX } from './core';
import type { Rig } from './core';

type Point = readonly [number, number];

/**
 * A flat triangle a, b, c in the xy plane (counterclockwise seen from +z), d thick along +z.
 * It is the shape that ExtrudeGeometry makes, without the size of the shape code in the page.
 */
function triPrism(a: Point, b: Point, c: Point, d: number): BufferGeometry {
  const p = [a, b, c] as const;
  const out: number[] = [];
  const v = (q: Point, z: number): void => void out.push(q[0], q[1], z);
  // The front (z = d) and the back (z = 0).
  (v(a, d), v(b, d), v(c, d));
  (v(a, 0), v(c, 0), v(b, 0));
  // The three sides.
  for (let i = 0; i < 3; i++) {
    const q0 = p[i] ?? a;
    const q1 = p[(i + 1) % 3] ?? a;
    (v(q0, 0), v(q1, 0), v(q1, d));
    (v(q0, 0), v(q1, d), v(q0, d));
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(new Float32Array(out), 3));
  g.computeVertexNormals();
  return g;
}

// Small objects that fly between characters.

/** A manila folder, about 0.3 wide. It stands up and faces +z. */
export function buildFolder(): Group {
  const k = kit(PAINT);
  k.box([0.3, 0.22, 0.012], [0, 0, -0.01], '#d9b25f');
  k.box([0.11, 0.04, 0.012], [-0.08, 0.125, -0.01], '#d9b25f');
  k.box([0.27, 0.2, 0.006], [0.004, 0.012, 0], '#ffffff');
  k.box([0.3, 0.19, 0.012], [0, -0.015, 0.01], '#e8c77a');
  return k.g;
}

/** An envelope group. userData.open(t) opens the flap (t 0 to 1). */
export type EnvelopeObject = Group & { userData: { open(t: number): void } };

/**
 * A sealed envelope of kraft paper with a red wax seal, about 0.35 wide. It stands up and faces +z.
 * userData.open(t) opens the flap (t 0 to 1), and a card comes up out of it.
 */
export function buildEnvelope(): EnvelopeObject {
  const k = kit(PAINT);
  const W = 0.35;
  const H = 0.22;
  k.box([W, H, 0.014], [0, 0, 0], KRAFT);
  const card = k.box([W - 0.05, H - 0.04, 0.006], [0, 0, 0], '#fbf8f1');
  const flap = k.sub([0, H / 2, 0.008]);
  const tri = new Mesh(triPrism([-W / 2, 0], [0, -0.13], [W / 2, 0], 0.006), PAINT('#b8925a'));
  tri.castShadow = true;
  flap.add(tri);
  k.cyl(0.042, 0.012, [0, -0.112, 0.012], WAX, [Math.PI / 2, 0, 0], flap);
  k.cyl(0.026, 0.014, [0, -0.112, 0.014], '#8e1b15', [Math.PI / 2, 0, 0], flap);
  const open = (t: number): void => {
    t = clamp01(t);
    flap.rotation.x = -Math.PI * 0.92 * t;
    card.position.y = 0.1 * clamp01((t - 0.4) / 0.6);
  };
  return Object.assign(k.g, { userData: Object.assign(k.g.userData, { open }) });
}

/** A small gold coin. It faces +z. */
export function buildCoin(): Group {
  const k = kit(PAINT);
  k.cyl(0.075, 0.022, [0, 0, 0], '#e2ac2c', [Math.PI / 2, 0, 0]);
  k.cyl(0.056, 0.026, [0, 0, 0], '#f6d36b', [Math.PI / 2, 0, 0]);
  return k.g;
}

// The figure. All characters use the same rig: legs, a torso, two arms on shoulder joints,
// and a head on a neck joint. Sizes are near the eagle: about 0.6 wide and 1.2 to 1.4 tall.

export interface RigOptions {
  skin: string;
  shirt: string;
  pants: string;
  shoes?: string;
  sleeve?: string;
  hand?: string;
  legH?: number;
  torsoH?: number;
  w?: number;
  d?: number;
  headW?: number;
  headH?: number;
  noHead?: boolean;
  cheeks?: boolean;
}

export function rigPerson(F: Kit, o: RigOptions): Rig {
  const legH = o.legH ?? 0.3;
  const torsoH = o.torsoH ?? 0.44;
  const w = o.w ?? 0.46;
  const d = o.d ?? 0.3;
  const headW = o.headW ?? 0.44;
  const headH = o.headH ?? 0.44;
  const body = F.sub();
  for (const s of [-1, 1]) {
    F.box([0.15, legH - 0.06, 0.17], [s * 0.1, 0.06 + (legH - 0.06) / 2, 0], o.pants, null, body);
    F.box([0.16, 0.07, 0.22], [s * 0.1, 0.035, 0.025], o.shoes ?? '#3a3330', null, body);
  }
  F.box([w, torsoH, d], [0, legH + torsoH / 2, 0], o.shirt, null, body);
  const shoulderY = legH + torsoH - 0.06;
  const arm = (s: number): { p: Group; hand: Group } => {
    const p = F.sub([s * (w / 2 + 0.065), shoulderY, 0], body);
    F.box([0.12, 0.33, 0.14], [0, -0.135, 0], o.sleeve ?? o.shirt, null, p);
    F.box([0.12, 0.1, 0.13], [0, -0.35, 0], o.hand ?? o.skin, null, p);
    return { p, hand: F.sub([0, -0.4, 0.01], p) };
  };
  // The left arm is on +x: the figure faces +z, so its left is on the viewer's right.
  const L = arm(1);
  const R = arm(-1);
  const head = F.sub([0, legH + torsoH, 0], body);
  head.rotation.order = 'YXZ';
  let eyes: Mesh[] = [];
  if (!o.noHead) {
    F.box([headW, headH, 0.4], [0, headH / 2, 0.01], o.skin, null, head);
    eyes = [-1, 1].map((s) =>
      F.box([0.065, 0.09, 0.02], [s * 0.1, headH * 0.52, 0.215], '#1c1c1e', null, head),
    );
    if (o.cheeks !== false) {
      for (const s of [-1, 1]) {
        F.box([0.07, 0.04, 0.02], [s * 0.155, headH * 0.34, 0.212], '#f3a6a0', null, head);
      }
    }
  }
  return {
    body,
    head,
    armL: L.p,
    armR: R.p,
    handL: L.hand,
    handR: R.hand,
    eyes,
    legH,
    torsoH,
    shoulderY,
    headW,
    headH,
    w,
    d,
  };
}

export function hair(
  F: Kit,
  r: Rig,
  c: string,
  style: 'short' | 'sides' | 'part' | 'bun' = 'short',
): void {
  const { head, headW: W, headH: H } = r;
  if (style === 'sides') {
    for (const s of [-1, 1])
      F.box([0.05, 0.2, 0.32], [s * (W / 2 + 0.015), H * 0.56, -0.04], c, null, head);
    F.box([W + 0.03, 0.2, 0.06], [0, H * 0.5, -0.19], c, null, head);
    return;
  }
  F.box([W + 0.03, 0.09, 0.43], [0, H + 0.03, 0], c, null, head);
  F.box([W + 0.03, H * 0.55, 0.06], [0, H * 0.7, -0.19], c, null, head);
  for (const s of [-1, 1])
    F.box([0.04, H * 0.32, 0.3], [s * (W / 2 + 0.01), H * 0.8, -0.04], c, null, head);
  if (style === 'part') {
    F.box([W * 0.62, 0.07, 0.07], [W * 0.16, H - 0.01, 0.2], c, null, head);
  } else {
    F.box([W + 0.03, 0.06, 0.06], [0, H - 0.01, 0.2], c, null, head);
  }
  if (style === 'bun') F.box([0.17, 0.15, 0.15], [0, H + 0.1, -0.12], c, null, head);
}

export function cap(F: Kit, r: Rig, c: string, back = false): void {
  const { head, headW: W, headH: H } = r;
  F.box([W + 0.04, 0.12, 0.45], [0, H + 0.06, 0], c, null, head);
  F.box([W * 0.8, 0.03, 0.18], [0, H + 0.01, back ? -0.29 : 0.29], c, null, head);
}

export function glasses(F: Kit, r: Rig, frame: string, thick: boolean): void {
  const { head, headH: H } = r;
  const y = H * 0.52;
  const t = thick ? 0.03 : 0.018;
  for (const s of [-1, 1]) {
    const x = s * 0.1;
    F.box([0.14, t, 0.02], [x, y + 0.06, 0.226], frame, null, head);
    F.box([0.14, t, 0.02], [x, y - 0.06, 0.226], frame, null, head);
    F.box([t, 0.12, 0.02], [x - 0.07 + t / 2, y, 0.226], frame, null, head);
    F.box([t, 0.12, 0.02], [x + 0.07 - t / 2, y, 0.226], frame, null, head);
  }
  F.box([0.06, t, 0.02], [0, y + 0.03, 0.226], frame, null, head);
}

/** A rubber stamp. The hand holds the knob. */
export function stampTool(F: Kit, parent: Object3D, ink: string): Group {
  const g = F.sub([0, 0, 0], parent);
  F.cyl(0.035, 0.05, [0, 0.06, 0], '#8a5a35', null, g);
  F.box([0.03, 0.06, 0.03], [0, 0.015, 0], '#5a3a22', null, g);
  F.box([0.1, 0.035, 0.07], [0, -0.03, 0], '#3a3a3c', null, g);
  F.box([0.09, 0.012, 0.06], [0, -0.052, 0], ink, null, g);
  return g;
}

export function clipboard(F: Kit, parent: Object3D): Group {
  const g = F.sub([0, 0, 0], parent);
  F.box([0.22, 0.3, 0.015], [0, 0, 0], '#a0764c', null, g);
  F.box([0.19, 0.25, 0.006], [0, -0.01, 0.01], '#fbfaf6', null, g);
  F.box([0.08, 0.035, 0.025], [0, 0.14, 0.012], '#9aa3ab', null, g);
  for (const y of [0.06, 0, -0.06]) F.box([0.13, 0.014, 0.004], [0, y, 0.014], '#c9c4bb', null, g);
  return g;
}

/** An open book with the pages up. The reader idle shows it. */
export function book(F: Kit, parent: Object3D, cover: string): Group {
  const g = F.sub([0, 0, 0], parent);
  for (const s of [-1, 1]) {
    const h = F.sub([0, 0, 0], g);
    h.rotation.z = s * 0.14;
    F.box([0.15, 0.018, 0.2], [s * 0.076, 0, 0], cover, null, h);
    F.box([0.135, 0.022, 0.185], [s * 0.072, 0.018, 0], '#fbf8f1', null, h);
  }
  return g;
}
