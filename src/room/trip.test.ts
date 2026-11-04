import { describe, expect, it } from 'vitest';
import { boundsContains } from '../lib/bounds';
import { ROOM_BOUNDS, roomPoint } from '../lib/room';
import { planTrip } from './trip';

const circle = (u: number, v: number) => ({ ...roomPoint(u, v), radius: 0.75 });

describe('planTrip', () => {
  const from = roomPoint(0, 0);

  it('runs straight to a free point', () => {
    const target = roomPoint(3, 1);
    const trip = planTrip(from, target, ROOM_BOUNDS, [circle(-3, 0)]);
    expect(trip?.jump).toBe(false);
    expect(trip?.to.x).toBeCloseTo(target.x, 9);
    expect(trip?.to.z).toBeCloseTo(target.z, 9);
  });

  it('jumps when an item stands on the path', () => {
    const trip = planTrip(from, roomPoint(4, 0), ROOM_BOUNDS, [circle(2, 0.3)]);
    expect(trip?.jump).toBe(true);
  });

  it('moves a point outside the room to the room edge', () => {
    const trip = planTrip(from, roomPoint(20, 0), ROOM_BOUNDS, []);
    expect(trip).not.toBeNull();
    if (!trip) return;
    expect(boundsContains(ROOM_BOUNDS, trip.to.x, trip.to.z)).toBe(true);
    // u = 7.8 is the room edge.
    const edge = roomPoint(7.8, 0);
    expect(trip.to.x).toBeCloseTo(edge.x, 9);
    expect(trip.to.z).toBeCloseTo(edge.z, 9);
  });

  it('stops at the edge of an item circle, out of every overlapping circle', () => {
    const items = [circle(3, 0), circle(3.6, 0)];
    for (const target of [roomPoint(3, 0), roomPoint(3.3, 0.1), roomPoint(3.6, -0.2)]) {
      const trip = planTrip(from, target, ROOM_BOUNDS, items);
      expect(trip).not.toBeNull();
      for (const o of items) {
        expect(Math.hypot(trip!.to.x - o.x, trip!.to.z - o.z)).toBeGreaterThanOrEqual(o.radius);
      }
    }
  });

  it('gives no trip for a point at the eagle', () => {
    expect(planTrip(from, roomPoint(0.02, 0), ROOM_BOUNDS, [])).toBeNull();
  });

  it('lets the eagle leave a circle that holds it without a jump', () => {
    const trip = planTrip(roomPoint(0.2, 0), roomPoint(-3, 0), ROOM_BOUNDS, [circle(0, 0)]);
    expect(trip?.jump).toBe(false);
  });
});
