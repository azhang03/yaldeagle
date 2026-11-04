import { describe, expect, it } from 'vitest';
import { runAction, TUNING } from './actions';

describe('runAction', () => {
  it.each([0.1, 0.3, 0.7, 5])(
    'never goes past the full speed, and has a start and a stop, for %s units',
    (distance) => {
      const run = runAction({ x: 0, z: 0 }, { x: distance, z: 0 });
      expect(run.start).toBeGreaterThan(0);
      expect(run.stop).toBeGreaterThan(0);
      // The start and the stop move at half the top speed on average.
      const top = distance / (run.duration - (run.start + run.stop) / 2);
      expect(top).toBeLessThanOrEqual(TUNING.run.speed + 1e-9);
      // The time with the top speed is not below 0.
      expect(run.duration - run.start - run.stop).toBeGreaterThanOrEqual(-1e-9);
    },
  );

  it('keeps the full start and stop for a long run', () => {
    const run = runAction({ x: 0, z: 0 }, { x: 3, z: 4 });
    expect(run.start).toBe(TUNING.run.start);
    expect(run.stop).toBe(TUNING.run.stop);
    expect(run.duration).toBeCloseTo(5 / TUNING.run.speed + (run.start + run.stop) / 2, 12);
  });
});
