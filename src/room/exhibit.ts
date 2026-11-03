// One exhibit: the floor patch and ring, and a holder with the item model, which floats, turns, and
// bobs. The state look (earned, progress, locked), hover, focus, and hide.
import {
  Box3,
  BoxGeometry,
  CircleGeometry,
  Color,
  Group,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Plane,
  RingGeometry,
  Vector3,
} from 'three';
import { smoothstep } from '../lib/ease';
import { ROOM_AZIMUTH, roomPoint } from '../lib/room';
import { AREAS, type AreaId } from './areas';
import { PATCH_RADIUS, type ItemDef } from './items';
import { createKit, createPaint, type PaintMode } from './kit';
import { MODELS } from './models';

export interface Exhibit {
  readonly item: ItemDef;
  /** On the ground at the item place. It scales down when the exhibit is hidden. */
  readonly root: Group;
  /** An invisible box around the item, for the pointer. */
  readonly hit: Mesh;
  /** The pointer is over the item: it grows a little, rises, and glitches more often. */
  setHover(on: boolean): void;
  /** The close view of a visit: the item grows, rises toward the beak, and turns slower. */
  setFocus(on: boolean): void;
  /** The whole exhibit with its patch shrinks away, or comes back. */
  setHidden(on: boolean): void;
  isHidden(): boolean;
  /** A locked item glitches all the time for this many seconds. */
  glitchFor(seconds: number): void;
  update(dt: number): void;
}

/** The model scale in the room. */
const ROOM_SCALE = 1.25;
/** The height of the holder above the ground. */
const FLOAT_Y = 0.24;
/** The screen right of the overview, on the ground. The glitch moves along it. */
const SCREEN_RIGHT = new Vector3(Math.cos(ROOM_AZIMUTH), 0, -Math.sin(ROOM_AZIMUTH));
const UP = new Vector3(0, 1, 0);
const LOCKED_RING = '#b9b9b9';
const GHOSTS = ['#00d8ff', '#ff3bd4'] as const;

// All exhibits share the geometries, and the materials for each area and color.
const patchGeometry = new CircleGeometry(PATCH_RADIUS, 48);
const edgeGeometry = new RingGeometry(PATCH_RADIUS, PATCH_RADIUS + 0.06, 48);
const discGeometry = new CircleGeometry(0.36, 32);
const ringGeometry = new RingGeometry(0.36, 0.42, 32);
const hitGeometry = new BoxGeometry(1, 1, 1);
const patchMaterials = new Map<AreaId, { fill: MeshLambertMaterial; edge: MeshLambertMaterial }>();
const ringMaterials = new Map<string, { disc: MeshBasicMaterial; ring: MeshBasicMaterial }>();

function areaMaterials(id: AreaId): { fill: MeshLambertMaterial; edge: MeshLambertMaterial } {
  let m = patchMaterials.get(id);
  if (!m) {
    const { color, tint } = AREAS[id];
    m = {
      fill: new MeshLambertMaterial({ color: tint }),
      // The edge is the tint, 30% of the way to the area color.
      edge: new MeshLambertMaterial({ color: new Color(tint).lerp(new Color(color), 0.3) }),
    };
    patchMaterials.set(id, m);
  }
  return m;
}

function floorRingMaterials(color: string): { disc: MeshBasicMaterial; ring: MeshBasicMaterial } {
  let m = ringMaterials.get(color);
  if (!m) {
    const flat = { color, transparent: true, depthWrite: false };
    m = {
      disc: new MeshBasicMaterial({ ...flat, opacity: 0.12 }),
      ring: new MeshBasicMaterial({ ...flat, opacity: 0.75 }),
    };
    ringMaterials.set(color, m);
  }
  return m;
}

/** A flat mesh on the floor at height y. */
function floorMesh(
  geometry: CircleGeometry | RingGeometry,
  material: MeshBasicMaterial | MeshLambertMaterial,
  y: number,
): Mesh {
  const mesh = new Mesh(geometry, material);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = y;
  return mesh;
}

const between = (min: number, max: number): number => min + Math.random() * (max - min);
const approach = (value: number, target: number, rate: number, dt: number): number =>
  value + (target - value) * Math.min(1, dt * rate);

export function createExhibit(item: ItemDef): Exhibit {
  const area = AREAS[item.area];
  const root = new Group();
  root.name = `exhibit-${item.id}`;
  const p = roomPoint(item.u, item.v);
  root.position.set(p.x, 0, p.z);

  // The patch is part of the exhibit, so it shrinks away with the item.
  const { fill, edge } = areaMaterials(item.area);
  for (const [geometry, material] of [
    [patchGeometry, fill],
    [edgeGeometry, edge],
  ] as const) {
    const mesh = floorMesh(geometry, material, 0.01);
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  const { disc, ring } = floorRingMaterials(item.status === 'locked' ? LOCKED_RING : area.color);
  root.add(floorMesh(discGeometry, disc, 0.02), floorMesh(ringGeometry, ring, 0.02));

  const holder = new Group();
  root.add(holder);
  const copy = (mode: PaintMode, castShadow = true): Group => {
    const kit = createKit(createPaint(mode), castShadow);
    MODELS[item.id](kit);
    return kit.group;
  };

  // The state copies. The progress copies are cut by two planes at the fill level (in world
  // space). The locked copy has a cyan and a pink ghost for the glitch.
  let low: Plane | null = null;
  let high: Plane | null = null;
  let main: Group | null = null;
  let ghosts: Group[] = [];
  let first: Group;
  if (item.status === 'earned') {
    first = copy({});
    holder.add(first);
  } else if (item.status === 'progress') {
    low = new Plane(new Vector3(0, -1, 0), 0);
    high = new Plane(new Vector3(0, 1, 0), 0);
    first = copy({ planes: [low] });
    holder.add(first, copy({ grey: true, planes: [high] }));
  } else {
    main = copy({ grey: true });
    first = main;
    ghosts = GHOSTS.map((ghost) => copy({ ghost }, false));
    holder.add(main, ...ghosts);
  }
  const box = new Box3().setFromObject(first);
  const minY = box.min.y;
  const height = box.max.y - box.min.y;

  const hit = new Mesh(hitGeometry);
  hit.visible = false;
  hit.scale.set(0.85, height * ROOM_SCALE + 0.6, 0.85);
  hit.position.y = hit.scale.y / 2;
  root.add(hit);

  let hover = false;
  let focus = false;
  let hidden = false;
  /** Smooth values from 0 to 1 that follow hover, hidden, and focus. */
  let hoverK = 0;
  let sink = 0;
  let near = 0;
  let spin = Math.random() * 6;
  let clock = 0;
  const glitch = { next: between(0.3, 2), end: 0, step: 0, force: 0, jitter: 0 };
  const side = new Vector3();

  function update(dt: number): void {
    clock += dt;
    const t = clock;
    const hovered = hover || focus;
    hoverK = approach(hoverK, hovered ? 1 : 0, 10, dt);
    sink = approach(sink, hidden ? 1 : 0, 5, dt);
    near = approach(near, focus ? 1 : 0, 3, dt);
    const keep = Math.max(0.001, 1 - smoothstep(sink));
    root.scale.setScalar(keep);
    root.visible = keep > 0.01;
    spin += dt * (focus ? 0.35 : 0.8);
    const s = ROOM_SCALE * (1 + 0.08 * hoverK + 0.3 * near);
    holder.position.y = FLOAT_Y + 0.05 * Math.sin(t * 2 + item.u * 3) + 0.06 * hoverK + 0.3 * near;
    holder.rotation.y = ROOM_AZIMUTH + spin;
    holder.scale.setScalar(s);

    if (low && high) {
      // The color fills from the bottom in 2.6 s, again every 3.4 s. It shows "in progress", not
      // a score.
      const baseY = (holder.position.y + minY * s) * keep;
      const level = baseY + height * s * keep * Math.min(1, (t % 3.4) / 2.6);
      low.constant = level;
      high.constant = -level;
    } else if (main) {
      // Grey, and in bursts it jumps to the side with a cyan and a pink ghost.
      if (t > glitch.next) {
        glitch.end = t + between(0.07, 0.24);
        glitch.next = glitch.end + between(0.5, 2.2) * (hovered ? 0.3 : 1);
      }
      const on = t < glitch.end || t < glitch.force;
      if (on && t > glitch.step) {
        glitch.step = t + 0.045;
        glitch.jitter = between(-0.035, 0.035);
      }
      // The screen right in the holder frame, so the jump goes to the side on the screen.
      side.copy(SCREEN_RIGHT).applyAxisAngle(UP, -holder.rotation.y).divideScalar(s);
      main.position.copy(side).multiplyScalar(on ? glitch.jitter : 0);
      ghosts.forEach((ghost, i) => {
        ghost.visible = on;
        ghost.position.copy(side).multiplyScalar(glitch.jitter + (i ? -1 : 1) * 0.05);
      });
    }
  }

  update(0);
  return {
    item,
    root,
    hit,
    setHover: (on) => {
      hover = on;
    },
    setFocus: (on) => {
      focus = on;
    },
    setHidden: (on) => {
      hidden = on;
    },
    isHidden: () => hidden,
    glitchFor: (seconds) => {
      glitch.force = clock + seconds;
    },
    update,
  };
}
