// The part of the ground that the eagle can use. This file has no Three.js and no DOM.

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

/** A fixed orthographic view of the ground. */
export interface View {
  /** The ground point at the center of the screen. */
  readonly x: number;
  readonly z: number;
  /** Camera angle around y, in radians. At 0 the camera is on +z and looks toward -z. */
  readonly azimuth: number;
  /** Camera angle above the ground, in radians. Must be more than 0. */
  readonly elevation: number;
  /** Half the screen width and half the screen height, in world units. */
  readonly halfWidth: number;
  readonly halfHeight: number;
}

/** Space to keep clear at each screen edge, in world units on the screen. */
export interface Margin {
  readonly side: number;
  readonly top: number;
  readonly bottom: number;
}

/**
 * Returns the ground rectangle that the view shows, minus the margin. If the margin is larger
 * than the view, the rectangle has a half size of 0 on that axis.
 */
export function viewBounds(view: View, margin: Margin): Bounds {
  const ux = Math.cos(view.azimuth);
  const uz = -Math.sin(view.azimuth);
  // A ground point at distance v from the screen center shows v * sin(elevation) lower on the
  // screen. A ground point at distance u shows u to the right.
  const sin = Math.sin(view.elevation);
  const nearEdge = (view.halfHeight - margin.bottom) / sin;
  const farEdge = (view.halfHeight - margin.top) / sin;
  const centerV = (nearEdge - farEdge) / 2;
  return {
    x: view.x - uz * centerV,
    z: view.z + ux * centerV,
    ux,
    uz,
    halfU: Math.max(0, view.halfWidth - margin.side),
    halfV: Math.max(0, (nearEdge + farEdge) / 2),
  };
}

/** Returns the world point (x, z) at the local position (u, v) in the bounds. */
export function boundsPoint(bounds: Bounds, u: number, v: number): { x: number; z: number } {
  return {
    x: bounds.x + bounds.ux * u - bounds.uz * v,
    z: bounds.z + bounds.uz * u + bounds.ux * v,
  };
}
