// The box kit that the item models use, and the paint modes for each copy of a model.
import {
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  PlaneGeometry,
  SRGBColorSpace,
  Vector3,
  type BufferGeometry,
  type Material,
  type Plane,
  type Texture,
} from 'three';

export type Vec3 = readonly [number, number, number];

export interface PaintMode {
  /** The locked look: each color becomes a grey of the same brightness. */
  readonly grey?: boolean;
  /** One flat see-through color, for the glitch copies. */
  readonly ghost?: string;
  /** Planes that cut the copy, for the progress fill. */
  readonly planes?: Plane[];
}

/** Gives the material for a model color in one paint mode. */
export interface Paint {
  (color: string, map?: Texture): Material;
  /** The color that the mode shows for a model color. */
  tone(color: string): string;
}

/** A light grey with the same brightness order as the color. Locked items use it. */
export function greyOf(hex: string): string {
  const n = Number.parseInt(hex.slice(1), 16);
  const l = (0.299 * (n >> 16) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) / 255;
  const g = Math.round(150 + 80 * l)
    .toString(16)
    .padStart(2, '0');
  return `#${g}${g}${g}`;
}

/** Materials of the paints without planes. All exhibits and the gear share them. */
const sharedMaterials = new Map<string, Material>();

export function createPaint(mode: PaintMode = {}): Paint {
  const { grey = false, ghost, planes } = mode;
  // A paint with planes has its own planes, so it needs its own materials.
  const cache = planes ? new Map<string, Material>() : sharedMaterials;
  const prefix = ghost ? `ghost ${ghost}` : grey ? 'grey' : 'color';
  const tone = (color: string): string => ghost ?? (grey ? greyOf(color) : color);
  const paint = (color: string, map?: Texture): Material => {
    const key = `${prefix} ${color} ${map?.uuid ?? ''}`;
    let material = cache.get(key);
    if (!material) {
      const options = {
        color: tone(color),
        map: map ?? null,
        ...(planes ? { clippingPlanes: planes, clipShadows: true } : {}),
      };
      material = ghost
        ? new MeshBasicMaterial({ ...options, transparent: true, opacity: 0.4, depthWrite: false })
        : new MeshLambertMaterial(options);
      cache.set(key, material);
    }
    return material;
  };
  return Object.assign(paint, { tone });
}

export interface Kit {
  /** Holds all the parts. The model stands on y = 0 and faces +z. */
  readonly group: Group;
  box(size: Vec3, position: Vec3, color: string, rotation?: Vec3): Mesh;
  /** A cylinder with radius r and length h along y. A rotation turns it. */
  cyl(radius: number, height: number, position: Vec3, color: string, rotation?: Vec3): Mesh;
  /** A square beam with the thickness t from point a to point b. */
  beam(a: Vec3, b: Vec3, thickness: number, color: string): void;
  /** Bold text that fits the width, on a filled background, on a plane w by h. */
  label(text: string, w: number, h: number, position: Vec3, fg: string, bg: string): void;
}

// All kits share one unit box and one unit cylinder.
const unitBox = new BoxGeometry(1, 1, 1);
const unitCylinder = new CylinderGeometry(1, 1, 1, 12);
const UP = new Vector3(0, 1, 0);

export function createKit(paint: Paint, castShadow = true): Kit {
  const group = new Group();

  function add(
    geometry: BufferGeometry,
    scale: Vec3,
    position: Vec3,
    color: string,
    rotation?: Vec3,
  ): Mesh {
    const mesh = new Mesh(geometry, paint(color));
    mesh.scale.set(...scale);
    mesh.position.set(...position);
    if (rotation) mesh.rotation.set(...rotation);
    mesh.castShadow = castShadow;
    group.add(mesh);
    return mesh;
  }

  return {
    group,
    box: (size, position, color, rotation) => add(unitBox, size, position, color, rotation),
    cyl: (radius, height, position, color, rotation) =>
      add(unitCylinder, [radius, height, radius], position, color, rotation),
    beam(a, b, thickness, color) {
      const from = new Vector3(...a);
      const to = new Vector3(...b);
      const middle = from.clone().add(to).multiplyScalar(0.5);
      const mesh = add(
        unitBox,
        [thickness, from.distanceTo(to), thickness],
        [middle.x, middle.y, middle.z],
        color,
      );
      mesh.quaternion.setFromUnitVectors(UP, to.sub(from).normalize());
    },
    label(text, w, h, position, fg, bg) {
      const canvas = textCanvas(
        text,
        Math.round(256 * (w / h)),
        256,
        paint.tone(fg),
        paint.tone(bg),
      );
      const mesh = new Mesh(new PlaneGeometry(w, h), paint('#ffffff', texture(canvas)));
      mesh.position.set(...position);
      group.add(mesh);
    },
  };
}

function textCanvas(text: string, w: number, h: number, fg: string, bg: string): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const c = canvas.getContext('2d');
  if (!c) throw new Error('The browser gave no 2D canvas context.');
  c.fillStyle = bg;
  c.fillRect(0, 0, w, h);
  c.fillStyle = fg;
  let px = h * 0.62;
  c.font = `800 ${px}px system-ui, sans-serif`;
  const textWidth = c.measureText(text).width;
  if (textWidth > w * 0.9) {
    px *= (w * 0.9) / textWidth;
    c.font = `800 ${px}px system-ui, sans-serif`;
  }
  c.textBaseline = 'middle';
  c.textAlign = 'center';
  c.fillText(text, w / 2, h / 2);
  return canvas;
}

function texture(canvas: HTMLCanvasElement): CanvasTexture {
  const t = new CanvasTexture(canvas);
  t.colorSpace = SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}
