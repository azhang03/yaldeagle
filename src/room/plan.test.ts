import { PerspectiveCamera, Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { boundsContains, type Bounds } from '../lib/bounds';
import { ROOM_AZIMUTH, ROOM_BOUNDS, roomPoint } from '../lib/room';
import { cameraPosition, closeView, nearFar, type CameraView } from '../lib/view';
import { ITEMS, type ItemDef, type ItemId } from './items';
import { planVisit } from './plan';

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

describe('planVisit', () => {
  it.each([1.6, 0.46])(
    'gives each item a free spot and hides the items that block the view, at aspect %s',
    (aspect) => {
      for (const item of ITEMS) {
        const plan = planVisit(item, ITEMS, aspect, ROOM_BOUNDS);
        const others = ITEMS.filter((o) => o !== item);
        expect(boundsContains(ROOM_BOUNDS, plan.spot.x, plan.spot.z), item.id).toBe(true);
        for (const o of others) {
          const p = roomPoint(o.u, o.v);
          expect(
            Math.hypot(p.x - plan.spot.x, p.z - plan.spot.z),
            `${item.id} spot near ${o.id}`,
          ).toBeGreaterThanOrEqual(0.65);
        }

        // An item that shows in the part of the screen with the item and the eagle, in front of
        // the item or less than 1 unit behind it, must shrink away.
        const at = roomPoint(item.u, item.v);
        const camera = cameraAt(closeView(at, plan.azimuth, aspect), aspect);
        const depth = (x: number, z: number) =>
          new Vector3(x, 0.4, z).applyMatrix4(camera.matrixWorldInverse).z * -1;
        const itemDepth = depth(at.x, at.z);
        for (const o of others) {
          const p = roomPoint(o.u, o.v);
          const ndc = new Vector3(p.x, 0.4, p.z).project(camera);
          // The item and the eagle use the left half of a wide screen, and the top part of a
          // tall screen.
          const inScene =
            Math.abs(ndc.y) < 1 &&
            ndc.z < 1 &&
            (aspect >= 1 ? ndc.x > -1 && ndc.x < 0 : Math.abs(ndc.x) < 1 && ndc.y > 0);
          if (inScene && depth(p.x, p.z) < itemDepth + 1) {
            expect(plan.hide, `${item.id}: ${o.id} in the view`).toContain(o.id);
          }
        }
      }
    },
  );

  it('takes the first direction in the try order that no item blocks', () => {
    const base = ITEMS[0];
    if (!base) throw new Error('No items.');
    const make = (id: ItemId, u: number, v: number): ItemDef => ({ ...base, id, u, v });
    const big: Bounds = { ...ROOM_BOUNDS, halfU: 50, halfV: 50 };
    const item = make('fe', 0, 0);
    // An item 3 units straight toward the camera blocks 0° and ±15°. +30° comes before -30°.
    const blocker = make('pe', 0, 3);
    let plan = planVisit(item, [item, blocker], 1.6, big);
    expect(Math.round(((plan.azimuth - ROOM_AZIMUTH) * 180) / Math.PI)).toBe(30);
    expect(plan.hide).toEqual([]);
    // With no blocker, the overview direction wins.
    plan = planVisit(item, [item], 1.6, big);
    expect(plan.azimuth).toBe(ROOM_AZIMUTH);
  });
});
