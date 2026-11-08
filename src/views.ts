// The two views of the site, their addresses, and the motion of the elevator lift between them.
// No DOM and no Three.js, so Vitest tests it.
import { easeInOutCubic } from './lib/ease';

export type ViewName = 'nick' | 'yaldaq';

/** The view of an address: `/yaldaq` (with or without the last slash) is the firm. */
export function viewFromPath(pathname: string): ViewName {
  return pathname === '/yaldaq' || pathname === '/yaldaq/' ? 'yaldaq' : 'nick';
}

export function pathFor(view: ViewName): string {
  return view === 'yaldaq' ? '/yaldaq' : '/';
}

/**
 * The lift. The firm is the floor below Nick's room. Both floors and the slab between them move
 * together for `durationS`, then settle with a small bounce for `settleS`. The slab height is
 * `slabFrac` of the screen height, between `slabMin` and `slabMax` px.
 */
export const LIFT = {
  durationS: 1.6,
  settleS: 0.35,
  settleAmp: 0.015,
  slabFrac: 0.07,
  slabMin: 28,
  slabMax: 64,
} as const;

export function slabHeight(h: number): number {
  return Math.min(LIFT.slabMax, Math.max(LIFT.slabMin, Math.round(LIFT.slabFrac * h)));
}

/**
 * The CSS translateY (px) of the outgoing view, the slab, and the incoming view at the lift
 * progress u (1 at the end of the move; above 1 during the settle). Down goes from Nick's room
 * to the firm; up goes back. h is the screen height.
 */
export function liftFrame(
  u: number,
  dir: 'down' | 'up',
  h: number,
): { from: number; slab: number; to: number } {
  const S = slabHeight(h);
  const D = h + S;
  const p = easeInOutCubic(Math.min(1, Math.max(0, u)));
  const s = u > 1 ? Math.min(1, (u - 1) / (LIFT.settleS / LIFT.durationS)) : 0;
  const e = LIFT.settleAmp * h * Math.sin(Math.PI * s);
  // "+ 0" turns -0 into 0.
  return dir === 'down'
    ? { from: -p * D - e + 0, slab: h - p * D - e + 0, to: D - p * D - e + 0 }
    : { from: p * D + e + 0, slab: -S + p * D + e + 0, to: -D + p * D + e + 0 };
}
