// One exhibit: the floor patch of an item.
import { CircleGeometry, Color, Group, Mesh, MeshLambertMaterial, RingGeometry } from 'three';
import { roomPoint } from '../lib/room';
import { AREAS, type AreaId } from './areas';
import { PATCH_RADIUS, type ItemDef } from './items';

export interface Exhibit {
  readonly item: ItemDef;
  /** On the ground at the item place. */
  readonly root: Group;
}

// All patches share two geometries and two materials for each area.
const patchGeometry = new CircleGeometry(PATCH_RADIUS, 48);
const edgeGeometry = new RingGeometry(PATCH_RADIUS, PATCH_RADIUS + 0.06, 48);
const patchMaterials = new Map<AreaId, { fill: MeshLambertMaterial; edge: MeshLambertMaterial }>();

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

export function createExhibit(item: ItemDef): Exhibit {
  const root = new Group();
  root.name = `exhibit-${item.id}`;
  const p = roomPoint(item.u, item.v);
  root.position.set(p.x, 0, p.z);

  const { fill, edge } = areaMaterials(item.area);
  for (const [geometry, material] of [
    [patchGeometry, fill],
    [edgeGeometry, edge],
  ] as const) {
    const mesh = new Mesh(geometry, material);
    mesh.rotation.x = -Math.PI / 2;
    // Slightly above the ground, so the ground does not hide the patch.
    mesh.position.y = 0.01;
    mesh.receiveShadow = true;
    root.add(mesh);
  }
  return { item, root };
}
