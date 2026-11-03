import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { boundsPoint } from './bounds';
import { ROOM_BOUNDS } from './room';
import { cameraPosition, nearFar, overview, type CameraView } from './view';

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
