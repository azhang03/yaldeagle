// Room coordinates and the room bounds. This file has no Three.js and no DOM.
import type { Bounds } from './bounds';

/** The overview camera angle around y, in radians. The room axes turn with it. */
export const ROOM_AZIMUTH = Math.PI / 6;

const COS = Math.cos(ROOM_AZIMUTH);
const SIN = Math.sin(ROOM_AZIMUTH);

/**
 * Returns the world point (x, z) at the room point (u, v). u points to the screen right of the
 * overview, and v points toward the camera (screen down). These are the u and v axes of `Bounds`.
 */
export function roomPoint(u: number, v: number): { x: number; z: number } {
  return { x: COS * u + SIN * v, z: -SIN * u + COS * v };
}

const ROOM_CENTER = roomPoint(0.4, -0.7);

/** The fixed room rectangle: u from -7 to 7.8, v from -7.2 to 5.8. */
export const ROOM_BOUNDS: Bounds = {
  x: ROOM_CENTER.x,
  z: ROOM_CENTER.z,
  ux: COS,
  uz: -SIN,
  halfU: 7.4,
  halfV: 6.5,
};

/** Returns the room point (u, v) at the world point (x, z). The inverse of `roomPoint`. */
export function roomCoords(x: number, z: number): { u: number; v: number } {
  return { u: COS * x - SIN * z, v: SIN * x + COS * z };
}
