import { describe, expect, it } from 'vitest';
import { createGestures } from './gestures';

/** Gestures that record their output. */
function record() {
  const taps: [number, number][] = [];
  const pan = { x: 0, y: 0 };
  let zoom = 1;
  const gestures = createGestures({
    pan: (dx, dy) => {
      pan.x += dx;
      pan.y += dy;
    },
    zoom: (_x, _y, factor) => {
      zoom *= factor;
    },
    tap: (x, y) => taps.push([x, y]),
  });
  return { gestures, taps, pan, zoom: () => zoom };
}

describe('gestures', () => {
  it('gives one tap for a still touch', () => {
    const r = record();
    r.gestures.down(1, 100, 200);
    r.gestures.move(1, 102, 201);
    r.gestures.up(1, 102, 201);
    expect(r.taps).toEqual([[102, 201]]);
  });

  it('pans with a drag and gives no tap', () => {
    const r = record();
    r.gestures.down(1, 100, 200);
    for (let i = 1; i <= 10; i++) r.gestures.move(1, 100 + 3 * i, 200);
    r.gestures.up(1, 130, 200);
    expect(r.taps).toEqual([]);
    expect(r.pan).toEqual({ x: 30, y: 0 });
  });

  it('zooms with two fingers apart and back, and gives no tap', () => {
    const r = record();
    r.gestures.down(1, 100, 300);
    r.gestures.down(2, 200, 300);
    // Apart: from 100 px to 250 px. The factors d0 / d1 multiply to 100 / 250, a zoom in.
    for (let i = 1; i <= 10; i++) r.gestures.move(2, 200 + 10 * i, 300);
    for (let i = 1; i <= 10; i++) r.gestures.move(1, 100 - 5 * i, 300);
    expect(r.zoom()).toBeCloseTo(100 / 250, 9);
    // Back to the start distance.
    for (let i = 1; i <= 10; i++) r.gestures.move(1, 50 + 5 * i, 300);
    for (let i = 1; i <= 10; i++) r.gestures.move(2, 300 - 10 * i, 300);
    expect(r.zoom()).toBeCloseTo(1, 9);
    r.gestures.up(2, 200, 300);
    r.gestures.up(1, 100, 300);
    expect(r.taps).toEqual([]);
  });

  it('gives no tap after a cancel', () => {
    const r = record();
    r.gestures.down(1, 100, 200);
    r.gestures.cancel(1);
    r.gestures.up(1, 100, 200);
    expect(r.taps).toEqual([]);
  });

  it('gives a tap again after a pinch ends', () => {
    const r = record();
    r.gestures.down(1, 100, 300);
    r.gestures.down(2, 200, 300);
    r.gestures.up(1, 100, 300);
    r.gestures.up(2, 200, 300);
    r.gestures.down(3, 50, 50);
    r.gestures.up(3, 50, 50);
    expect(r.taps).toEqual([[50, 50]]);
  });
});
