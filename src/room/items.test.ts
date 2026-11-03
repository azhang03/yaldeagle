import { describe, expect, it } from 'vitest';
import { boundsPoint } from '../lib/bounds';
import { ROOM_BOUNDS, roomPoint } from '../lib/room';
import { ITEMS, PATCH_RADIUS } from './items';

describe('items', () => {
  it('have patches that do not touch, edge rings included', () => {
    const min = 2 * (PATCH_RADIUS + 0.06);
    for (const [i, a] of ITEMS.entries()) {
      for (const b of ITEMS.slice(i + 1)) {
        const pa = roomPoint(a.u, a.v);
        const pb = roomPoint(b.u, b.v);
        expect(Math.hypot(pa.x - pb.x, pa.z - pb.z), `${a.id} and ${b.id}`).toBeGreaterThanOrEqual(
          min,
        );
      }
    }
  });

  it('use the same u and v axes as the room bounds', () => {
    for (const item of ITEMS) {
      const p = roomPoint(item.u, item.v);
      // The bounds center is at room point (0.4, -0.7).
      const q = boundsPoint(ROOM_BOUNDS, item.u - 0.4, item.v + 0.7);
      expect(p.x).toBeCloseTo(q.x, 9);
      expect(p.z).toBeCloseTo(q.z, 9);
    }
  });
});
