// The visit planner: the camera direction, the eagle spot, and the items to hide. This file has no
// Three.js and no DOM.
import { boundsContains, type Bounds } from '../lib/bounds';
import { ROOM_AZIMUTH, roomPoint } from '../lib/room';
import { CLOSE, closeView } from '../lib/view';
import type { ItemDef, ItemId } from './items';

export interface VisitPlan {
  /** The camera azimuth of the close view, in radians. */
  azimuth: number;
  /** Where the eagle stands: at the camera right of the item. */
  spot: { x: number; z: number };
  /** The items that shrink away during the visit. */
  hide: ItemId[];
}

/** The azimuth offsets from the overview azimuth to try, in degrees, in this order. */
const OFFSETS = [0, 15, -15, 30, -30, 45, -45, 60, -60, 75, -75, 90, -90] as const;
/** The eagle spot must be at least this far from each other item. */
const SPOT_CLEAR = 0.65;

/**
 * Tries camera directions near the overview direction. It takes the first with a clear view and a
 * free spot for the eagle at the right of the item, else the one with the lowest score. Other
 * items in the view shrink away during the visit.
 */
export function planVisit(
  item: ItemDef,
  items: readonly ItemDef[],
  aspect: number,
  bounds: Bounds,
): VisitPlan {
  const p = roomPoint(item.u, item.v);
  const others = items.filter((o) => o !== item).map((o) => ({ id: o.id, ...roomPoint(o.u, o.v) }));
  let best: (VisitPlan & { score: number }) | null = null;
  for (const offset of OFFSETS) {
    const azimuth = ROOM_AZIMUTH + (offset * Math.PI) / 180;
    // Toward the camera, and the camera right, on the ground.
    const tx = Math.sin(azimuth);
    const tz = Math.cos(azimuth);
    const rx = Math.cos(azimuth);
    const rz = -Math.sin(azimuth);
    const spot = { x: p.x + rx * CLOSE.side, z: p.z + rz * CLOSE.side };
    // G: the middle of the item and the eagle.
    const gx = p.x + rx * (CLOSE.side / 2);
    const gz = p.z + rz * (CLOSE.side / 2);
    const view = closeView(p, azimuth, aspect);
    const distance = view.halfHeight / Math.tan(((CLOSE.fov / 2) * Math.PI) / 180);

    const free =
      boundsContains(bounds, spot.x, spot.z) &&
      others.every((o) => Math.hypot(o.x - spot.x, o.z - spot.z) >= SPOT_CLEAR);
    let score = free ? 0 : 100;
    const hide: ItemId[] = [];
    for (const o of others) {
      const along = (o.x - gx) * tx + (o.z - gz) * tz;
      const side = (o.x - gx) * rx + (o.z - gz) * rz;
      // In front of the item and the eagle, or at about the same distance from the camera and
      // inside the view. These count against the direction.
      const front = along > 0.45 && along < distance + 0.6 && side > -1.6 && side < 2.4;
      const sameDepth = Math.abs(along) <= 1.8 && side > -2.4 && side < 2.4;
      // Near and to the right: above or below the panel. These only shrink away.
      const byPanel = along > -1.8 && along < distance + 0.6 && side >= 2.4 && side < 5;
      if (front || sameDepth) score += 10;
      if (front || sameDepth || byPanel) hide.push(o.id);
    }
    score += Math.abs(offset) / 90;
    if (!best || score < best.score) best = { azimuth, spot, hide, score };
    if (score < 1) break;
  }
  // OFFSETS is not empty, so the loop always sets best.
  if (!best) throw new Error('The planner tried no direction.');
  const { azimuth, spot, hide } = best;
  return { azimuth, spot, hide };
}
