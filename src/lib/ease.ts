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

/** Slow at both ends, with cubic curves. */
export function easeInOutCubic(x: number): number {
  return x < 0.5 ? 4 * x ** 3 : 1 - (-2 * x + 2) ** 3 / 2;
}

/** Goes a little past 1 near the end, then comes back to 1. */
export function easeOutBack(x: number): number {
  const c1 = 1.70158;
  const c3 = c1 + 1;
  return 1 + c3 * (x - 1) ** 3 + c1 * (x - 1) ** 2;
}
