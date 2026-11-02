// Easing curves. Each one maps 0 to 0 and 1 to 1. This file has no Three.js and no DOM.

/** Fast at the start, slow at the end. */
export function easeOutCubic(x: number): number {
  return 1 - (1 - x) ** 3;
}
