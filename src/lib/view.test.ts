import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { boundsPoint } from './bounds';
import { easeInOutCubic } from './ease';
import { ROOM_AZIMUTH, ROOM_BOUNDS } from './room';
import {
  cameraPosition,
  CLOSE,
  closeView,
  flight,
  nearFar,
  overview,
  type CameraView,
} from './view';

/** A three camera at the view, the same way as the stage places it. */
function cameraAt(view: CameraView, aspect: number): PerspectiveCamera {
  const { near, far } = nearFar(view);
  const camera = new PerspectiveCamera(view.fov, aspect, near, far);
  const p = cameraPosition(view);
  camera.position.set(p.x, p.y, p.z);
  camera.lookAt(view.target.x, view.target.y, view.target.z);
  camera.updateMatrixWorld();
  return camera;
}

describe('overview', () => {
  it.each([1.6, 0.46])('shows the four room corners at aspect %s', (aspect) => {
    const camera = cameraAt(overview(aspect, { u: 0.5, v: -0.5, zoom: 1 }), aspect);
    for (const [su, sv] of [
      [-1, -1],
      [1, -1],
      [1, 1],
      [-1, 1],
    ] as const) {
      const p = boundsPoint(ROOM_BOUNDS, su * ROOM_BOUNDS.halfU, sv * ROOM_BOUNDS.halfV);
      const ndc = new Vector3(p.x, 0, p.z).project(camera);
      expect(Math.abs(ndc.x), `corner ${su}, ${sv}`).toBeLessThan(1);
      expect(Math.abs(ndc.y), `corner ${su}, ${sv}`).toBeLessThan(1);
      // Between the near and the far plane.
      expect(Math.abs(ndc.z), `corner ${su}, ${sv}`).toBeLessThan(1);
    }
  });
});

describe('closeView', () => {
  const item = { x: 1.3, z: -2.1 };
  const azimuth = ROOM_AZIMUTH + 0.4;
  // G: the middle of the item and the eagle spot, at the gaze height.
  const g = new Vector3(
    item.x + Math.cos(azimuth) * (CLOSE.side / 2),
    CLOSE.gazeY,
    item.z - Math.sin(azimuth) * (CLOSE.side / 2),
  );

  it('puts G at the middle of the left half on a wide screen', () => {
    const ndc = g.clone().project(cameraAt(closeView(item, azimuth, 1.6), 1.6));
    expect(ndc.x).toBeCloseTo(-0.5, 9);
    expect(ndc.y).toBeCloseTo(0, 9);
  });

  it('puts G above the screen center on a tall screen', () => {
    const ndc = g.clone().project(cameraAt(closeView(item, azimuth, 0.46), 0.46));
    expect(ndc.x).toBeCloseTo(0, 9);
    // The target drops straight down, not along the screen up, so G is only near 0.38.
    expect(ndc.y).toBeCloseTo(0.38, 2);
  });
});

describe('flight', () => {
  const from = overview(1.6, { u: 0.5, v: -0.5, zoom: 1 });
  // An azimuth more than half a turn away: the flight turns the short way.
  const to = closeView({ x: 2, z: 1 }, ROOM_AZIMUTH - 1.8 + 2 * Math.PI, 1.6);

  it.each([true, false])('starts at the first view and ends at the second (down %s)', (down) => {
    const start = flight(from, to, 0, down);
    const end = flight(from, to, 1, down);
    for (const [view, expected] of [
      [start, from],
      [end, to],
    ] as const) {
      expect(view.target.x).toBeCloseTo(expected.target.x, 9);
      expect(view.target.y).toBeCloseTo(expected.target.y, 9);
      expect(view.target.z).toBeCloseTo(expected.target.z, 9);
      expect(view.elevation).toBeCloseTo(expected.elevation, 9);
      expect(view.fov).toBeCloseTo(expected.fov, 9);
      expect(view.halfHeight).toBeCloseTo(expected.halfHeight, 9);
      const turn = view.azimuth - expected.azimuth;
      expect(Math.cos(turn)).toBeCloseTo(1, 9);
    }
    // On the way down, the elevation starts late. The half height moves on a log scale.
    const early = flight(from, to, 0.2, down);
    const k = easeInOutCubic(0.2);
    expect(early.elevation).toBeCloseTo(
      down ? from.elevation : from.elevation + (to.elevation - from.elevation) * k,
      9,
    );
    expect(flight(from, to, 0.5, down).halfHeight).toBeCloseTo(
      Math.sqrt(from.halfHeight * to.halfHeight),
      9,
    );
    // The short way: the middle of the flight is within 0.9 rad of the start azimuth.
    expect(Math.abs(flight(from, to, 0.5, down).azimuth - from.azimuth)).toBeLessThan(0.91);
  });
});
