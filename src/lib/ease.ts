// Easing curves. Each one maps 0 to 0 and 1 to 1. This file has no Three.js and no DOM.

/** Fast at the start, slow at the end. */
export function easeOutCubic(x: number): number {
  return 1 - (1 - x) ** 3;
}

/** Slow at both ends. Values outside 0 to 1 are clamped. */
export function smoothstep(x: number): number {
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}
