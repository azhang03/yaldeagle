// Touch gestures from pointer events: one finger pans, two fingers pinch to zoom, and a short
// touch with one finger is a tap. This file has no Three.js and no DOM.

export interface GestureOutput {
  /** Move the view by (dx, dy) screen pixels. */
  pan(dx: number, dy: number): void;
  /** Zoom by the factor about the screen point (x, y). A factor above 1 zooms out. */
  zoom(x: number, y: number, factor: number): void;
  tap(x: number, y: number): void;
}

export interface Gestures {
  down(id: number, x: number, y: number): void;
  move(id: number, x: number, y: number): void;
  up(id: number, x: number, y: number): void;
  cancel(id: number): void;
}

/** A touch that moves further than this (pixels) from where it started is not a tap. */
const TAP_SLOP = 6;
/** No zoom while the two fingers are nearer than this (pixels). */
const MIN_PINCH = 10;

interface Point {
  readonly x: number;
  readonly y: number;
}

export function createGestures(out: GestureOutput): Gestures {
  /** The fingers on the screen, at their last places. */
  const touches = new Map<number, Point>();
  /** Where each finger came down. */
  const starts = new Map<number, Point>();
  /** True when a second finger came during the gesture. Then no tap. */
  let pinched = false;

  function lift(id: number): void {
    touches.delete(id);
    starts.delete(id);
    if (touches.size === 0) pinched = false;
  }

  return {
    down(id, x, y) {
      touches.set(id, { x, y });
      starts.set(id, { x, y });
      if (touches.size > 1) pinched = true;
    },
    move(id, x, y) {
      const prev = touches.get(id);
      if (!prev) return;
      const now = { x, y };
      if (touches.size === 1) {
        out.pan(now.x - prev.x, now.y - prev.y);
      } else if (touches.size === 2) {
        let other: Point | undefined;
        for (const [key, p] of touches) if (key !== id) other = p;
        if (other) {
          const mid0 = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 };
          const mid1 = { x: (now.x + other.x) / 2, y: (now.y + other.y) / 2 };
          const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
          const d1 = Math.hypot(now.x - other.x, now.y - other.y);
          if (d1 > MIN_PINCH) out.zoom(mid1.x, mid1.y, d0 / d1);
          out.pan(mid1.x - mid0.x, mid1.y - mid0.y);
        }
      }
      touches.set(id, now);
    },
    up(id, x, y) {
      const start = starts.get(id);
      const single = touches.size === 1 && touches.has(id) && !pinched;
      lift(id);
      if (single && start && Math.hypot(x - start.x, y - start.y) <= TAP_SLOP) out.tap(x, y);
    },
    cancel(id) {
      lift(id);
    },
  };
}
