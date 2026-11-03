// The eagle (design T2), built from boxes. The eagle faces +z. Its left side is +x. One unit is
// about the width of the eagle.
import { BoxGeometry, Group, Mesh, MeshLambertMaterial, Object3D } from 'three';
import { PALETTE, type PaletteColor } from './palette';

export type MountName = 'hat' | 'face' | 'neck' | 'chest' | 'back' | 'foot';

export interface Eagle {
  /**
   * On the ground, between the feet. The animator sets its position for hops, its rotation.y
   * for the facing, and its scale for squash and stretch.
   */
  readonly root: Group;
  /** Chest block, back block, collar, tail, wings, and head. Pivot at the hips (HIP above the ground). */
  readonly body: Group;
  /** The left leg and foot. Pivot at the hip. A positive rotation.x swings the foot back. */
  readonly legL: Group;
  /** The same as legL, on the right side. */
  readonly legR: Group;
  /** Pivot at the neck. rotation.y turns the head, z tilts it, and a negative x lifts the beak. */
  readonly head: Group;
  /** The lower beak. Pivot at the hinge. A positive rotation.x opens it. */
  readonly jaw: Group;
  /** Pivot at the top front corner of the wing. A positive rotation.z moves it out. */
  readonly wingL: Group;
  /** The same as wingL, on the right side. A negative rotation.z moves it out. */
  readonly wingR: Group;
  /** Empty objects where gear attaches. Gear is a child of a mount and moves with its part. */
  readonly mounts: Readonly<Record<MountName, Object3D>>;
}

type Vec3 = readonly [number, number, number];

// All eagles share one box geometry and one material for each color.
const unitBox = new BoxGeometry(1, 1, 1);
const materials = new Map<PaletteColor, MeshLambertMaterial>();

function material(color: PaletteColor): MeshLambertMaterial {
  let m = materials.get(color);
  if (!m) {
    m = new MeshLambertMaterial({ color: PALETTE[color] });
    materials.set(color, m);
  }
  return m;
}

function box(parent: Object3D, size: Vec3, position: Vec3, color: PaletteColor, tilt = 0): void {
  const mesh = new Mesh(unitBox, material(color));
  mesh.scale.set(...size);
  mesh.position.set(...position);
  mesh.rotation.x = tilt;
  mesh.castShadow = true;
  parent.add(mesh);
}

function group(parent: Object3D, name: string, position: Vec3): Group {
  const g = new Group();
  g.name = name;
  g.position.set(...position);
  parent.add(g);
  return g;
}

function mount(parent: Object3D, name: MountName, position: Vec3): Object3D {
  const m = new Object3D();
  m.name = `mount-${name}`;
  m.position.set(...position);
  parent.add(m);
  return m;
}

/** The height of the hip pivots of the body and the legs. */
export const HIP = 0.27;

export function buildEagle(): Eagle {
  const root = new Group();
  root.name = 'eagle';

  // Each leg turns at its hip: yellow feet with dark talons, a short leg, and brown feathers at
  // the top. The positions are relative to the hip.
  function leg(side: 1 | -1): Group {
    const hip = group(root, side === 1 ? 'legL' : 'legR', [side * 0.13, HIP, 0.04]);
    box(hip, [0.2, 0.05, 0.26], [0, 0.025 - HIP, 0.06], 'feet');
    for (const k of [-1, 0, 1]) {
      box(hip, [0.045, 0.04, 0.05], [k * 0.07, 0.02 - HIP, 0.205], 'talon');
    }
    box(hip, [0.08, 0.16, 0.08], [0, 0.08 - HIP, 0.02], 'feet');
    box(hip, [0.15, 0.15, 0.15], [0, 0.21 - HIP, 0], 'brown');
    return hip;
  }
  const legL = leg(1);
  const legR = leg(-1);

  // The body turns at the hips. `at` gives a body position from a position over the ground.
  const body = group(root, 'body', [0, HIP, 0]);
  const at = ([x, y, z]: Vec3): Vec3 => [x, y - HIP, z];

  // An upright chest block, and a lower, shorter block to the back.
  box(body, [0.56, 0.66, 0.5], at([0, 0.62, 0.08]), 'brown');
  box(body, [0.58, 0.16, 0.52], at([0, 0.88, 0.08]), 'white');
  box(body, [0.48, 0.42, 0.4], at([0, 0.45, -0.3]), 'brown');
  box(body, [0.34, 0.1, 0.34], at([0, 0.3, -0.62]), 'tail', -0.5);

  // Folded wings that reach past the body. The positions are relative to the shoulder.
  function wing(side: 1 | -1): Group {
    const shoulder = group(body, side === 1 ? 'wingL' : 'wingR', at([side * 0.31, 0.86, 0.25]));
    box(shoulder, [0.07, 0.56, 0.7], [0, -0.28, -0.35], 'wing');
    box(shoulder, [0.07, 0.22, 0.3], [side * -0.03, -0.56, -0.73], 'wing');
    return shoulder;
  }
  const wingL = wing(1);
  const wingR = wing(-1);

  // White head on a white neck, a hooked yellow beak, and one black eye on each side.
  const head = group(body, 'head', at([0, 0.9, 0.12]));
  // Turn first, then lift, then tilt. So a lift raises the beak also when the head is turned.
  head.rotation.order = 'YXZ';
  box(head, [0.46, 0.16, 0.46], [0, 0.02, -0.02], 'white');
  box(head, [0.48, 0.42, 0.52], [0, 0.28, 0.04], 'white');
  box(head, [0.18, 0.13, 0.28], [0, 0.25, 0.43], 'beak');
  box(head, [0.18, 0.18, 0.07], [0, 0.15, 0.58], 'hook');
  for (const side of [-1, 1]) {
    box(head, [0.02, 0.08, 0.08], [side * 0.245, 0.33, 0.16], 'eye');
  }
  const jaw = group(head, 'jaw', [0, 0.16, 0.3]);
  box(jaw, [0.14, 0.05, 0.22], [0, -0.025, 0.11], 'beak');

  const mounts: Record<MountName, Object3D> = {
    hat: mount(head, 'hat', [0, 0.49, 0.04]),
    face: mount(head, 'face', [0, 0.4, 0.3]),
    neck: mount(body, 'neck', at([0, 0.88, 0.34])),
    chest: mount(body, 'chest', at([0, 0.6, 0.33])),
    back: mount(body, 'back', at([0, 0.66, -0.3])),
    foot: mount(body, 'foot', at([0, 0, 0.1])),
  };

  return { root, body, legL, legR, head, jaw, wingL, wingR, mounts };
}
