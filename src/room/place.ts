// The limits of a dragged item place. This file has no Three.js and no DOM.
import { CLOSE } from '../lib/view';

/**
 * The item center stays inside the room bounds (u from -7 to 7.8, v from -7.2 to 5.8). It also
 * stays the eagle spot distance from the right edge, so the eagle spot of a visit in the overview
 * direction is always inside the room.
 */
export const PLACE_LIMITS = { u0: -7, u1: 7.8 - CLOSE.side, v0: -7.2, v1: 5.8 } as const;

/** The nearest allowed place to (u, v). */
export function clampPlace(u: number, v: number): { u: number; v: number } {
  return {
    u: Math.min(PLACE_LIMITS.u1, Math.max(PLACE_LIMITS.u0, u)),
    v: Math.min(PLACE_LIMITS.v1, Math.max(PLACE_LIMITS.v0, v)),
  };
}
