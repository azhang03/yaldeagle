// A rectangle on the ground and its math. This file has no Three.js and no DOM.

/**
 * A rectangle on the ground plane (y = 0). Its sides are parallel to the screen edges, so it
 * turns with the camera azimuth.
 *
 * The u axis points to the right of the screen. The v axis points to the bottom of the screen
 * (toward the camera). v is u turned 90° around y: (vx, vz) = (-uz, ux).
 */
export interface Bounds {
  /** Center of the rectangle. */
  readonly x: number;
  readonly z: number;
  /** Unit vector of the u axis. */
  readonly ux: number;
  readonly uz: number;
  /** Half size along u. */
  readonly halfU: number;
  /** Half size along v. */
  readonly halfV: number;
}

/** Returns the world point (x, z) at the local position (u, v) in the bounds. */
export function boundsPoint(bounds: Bounds, u: number, v: number): { x: number; z: number } {
  return {
    x: bounds.x + bounds.ux * u - bounds.uz * v,
    z: bounds.z + bounds.uz * u + bounds.ux * v,
  };
}

/** True if the world point (x, z) is inside the bounds or on the edge. */
export function boundsContains(bounds: Bounds, x: number, z: number): boolean {
  const dx = x - bounds.x;
  const dz = z - bounds.z;
  // The local position: the inverse of boundsPoint.
  const u = dx * bounds.ux + dz * bounds.uz;
  const v = -dx * bounds.uz + dz * bounds.ux;
  // The tolerance covers rounding errors, so a point on the edge counts as inside.
  const tolerance = 1e-9;
  return Math.abs(u) <= bounds.halfU + tolerance && Math.abs(v) <= bounds.halfV + tolerance;
}
