// A trip of the eagle to a point that the person clicks on the floor: where it ends, and whether
// the eagle runs or jumps. This file has no Three.js and no DOM.
import type { Obstacle } from '../eagle/brain';
import { boundsClamp, type Bounds } from '../lib/bounds';

export interface Trip {
  /** The end point. */
  readonly to: { x: number; z: number };
  /** True if an item stands on the straight path. Then the eagle jumps over it in place of a run. */
  readonly jump: boolean;
}

/** A trip shorter than this is not worth a move. */
const MIN_TRIP = 0.1;
/** The end point stays this much outside an item circle. */
const EDGE = 0.01;

/**
 * Plans a trip from the eagle to the clicked point. A point outside the bounds moves to the
 * nearest point inside. A point in an item circle moves out to the edge of the circle. Null if
 * the trip is too short.
 */
export function planTrip(
  from: { readonly x: number; readonly z: number },
  target: { readonly x: number; readonly z: number },
  bounds: Bounds,
  obstacles: readonly Obstacle[],
): Trip | null {
  let to = boundsClamp(bounds, target.x, target.z);
  // Circles can overlap, so a point pushed out of one circle can be in the next. A few tries are
  // enough. After them, the point stays where it is.
  for (let i = 0; i < 4; i++) {
    const o = obstacles.find((c) => Math.hypot(to.x - c.x, to.z - c.z) < c.radius);
    if (!o) break;
    let dx = to.x - o.x;
    let dz = to.z - o.z;
    let length = Math.hypot(dx, dz);
    if (length < 1e-6) {
      // At the center: go out toward the eagle.
      dx = from.x - o.x;
      dz = from.z - o.z;
      length = Math.hypot(dx, dz);
      if (length < 1e-6) [dx, dz, length] = [1, 0, 1];
    }
    const r = o.radius + EDGE;
    to = boundsClamp(bounds, o.x + (dx / length) * r, o.z + (dz / length) * r);
  }
  if (Math.hypot(to.x - from.x, to.z - from.z) < MIN_TRIP) return null;
  // An item is in the way if the path goes into its circle. A circle that holds the start does not
  // count, so the eagle can always leave it.
  const jump = obstacles.some(
    (o) =>
      Math.hypot(from.x - o.x, from.z - o.z) >= o.radius && segmentDistance(from, to, o) < o.radius,
  );
  return { to, jump };
}

/** The distance from point p to the segment from a to b. */
function segmentDistance(
  a: { readonly x: number; readonly z: number },
  b: { readonly x: number; readonly z: number },
  p: { readonly x: number; readonly z: number },
): number {
  const dx = b.x - a.x;
  const dz = b.z - a.z;
  const length2 = dx * dx + dz * dz;
  const t =
    length2 > 0 ? Math.min(1, Math.max(0, ((p.x - a.x) * dx + (p.z - a.z) * dz) / length2)) : 0;
  return Math.hypot(a.x + t * dx - p.x, a.z + t * dz - p.z);
}
