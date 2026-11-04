import { describe, expect, it } from 'vitest';
import { ROOM_BOUNDS, roomCoords, roomPoint } from '../lib/room';
import { CLOSE } from '../lib/view';
import { ITEMS } from './items';
import { clampPlace, PLACE_LIMITS } from './place';
import { planVisit } from './plan';

describe('item places', () => {
  it('keeps a dragged center in the limits', () => {
    expect(clampPlace(20, -20)).toEqual({ u: PLACE_LIMITS.u1, v: PLACE_LIMITS.v0 });
    expect(clampPlace(-20, 20)).toEqual({ u: PLACE_LIMITS.u0, v: PLACE_LIMITS.v1 });
    expect(clampPlace(1, 2)).toEqual({ u: 1, v: 2 });
  });

  it('turns world points back into room points', () => {
    const p = roomPoint(2.5, -1.25);
    const back = roomCoords(p.x, p.z);
    expect(back.u).toBeCloseTo(2.5, 12);
    expect(back.v).toBeCloseTo(-1.25, 12);
  });

  it('gives a visit spot inside the room at each corner of the limits, with the other items', () => {
    const fe = ITEMS[0];
    if (!fe) throw new Error('No items.');
    for (const u of [PLACE_LIMITS.u0, PLACE_LIMITS.u1]) {
      for (const v of [PLACE_LIMITS.v0, PLACE_LIMITS.v1]) {
        const moved = { ...fe, u, v };
        const items = ITEMS.map((it) => (it.id === fe.id ? moved : it));
        for (const aspect of [1.6, 0.46]) {
          const plan = planVisit(moved, items, aspect, ROOM_BOUNDS);
          const { u: su, v: sv } = roomCoords(plan.spot.x, plan.spot.z);
          // The room bounds in room points, with a small tolerance for the rounding.
          expect(su, `${u}, ${v}`).toBeLessThanOrEqual(7.8 + 1e-9);
          expect(su).toBeGreaterThanOrEqual(-7 - 1e-9);
          expect(sv).toBeLessThanOrEqual(5.8 + 1e-9);
          expect(sv).toBeGreaterThanOrEqual(-7.2 - 1e-9);
        }
      }
    }
  });

  it('plans a visit to an item that overlaps another one', () => {
    const [fe, pe] = ITEMS;
    if (!fe || !pe) throw new Error('No items.');
    // fe on top of pe, a little to the side.
    const moved = { ...fe, u: pe.u + 0.3, v: pe.v };
    const items = ITEMS.map((it) => (it.id === fe.id ? moved : it));
    const plan = planVisit(moved, items, 1.6, ROOM_BOUNDS);
    const at = roomPoint(moved.u, moved.v);
    expect(Math.hypot(plan.spot.x - at.x, plan.spot.z - at.z)).toBeCloseTo(CLOSE.side, 9);
    // pe stands at the same depth as fe, so it shrinks away.
    expect(plan.hide).toContain('pe');
  });
});
