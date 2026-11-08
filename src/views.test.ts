import { describe, expect, it } from 'vitest';
import { LIFT, liftFrame, pathFor, slabHeight, viewFromPath } from './views';

describe('viewFromPath', () => {
  it('gives the firm for /yaldaq with or without the last slash', () => {
    expect(viewFromPath('/yaldaq')).toBe('yaldaq');
    expect(viewFromPath('/yaldaq/')).toBe('yaldaq');
  });

  it("gives Nick's room for every other path", () => {
    for (const p of ['/', '', '/YALDAQ', '/yaldaq/x', '/yaldaqs', '/index.html']) {
      expect(viewFromPath(p)).toBe('nick');
    }
  });

  it('gives back the path of each view', () => {
    expect(viewFromPath(pathFor('yaldaq'))).toBe('yaldaq');
    expect(viewFromPath(pathFor('nick'))).toBe('nick');
  });
});

describe('liftFrame', () => {
  const settleMid = 1 + (0.5 * LIFT.settleS) / LIFT.durationS;

  it('keeps the slab between its limits', () => {
    expect(slabHeight(800)).toBe(56);
    expect(slabHeight(200)).toBe(28);
    expect(slabHeight(2000)).toBe(64);
  });

  it('moves both floors and the slab down one screen and one slab', () => {
    expect(liftFrame(0, 'down', 800)).toEqual({ from: 0, slab: 800, to: 856 });
    expect(liftFrame(0.5, 'down', 800)).toEqual({ from: -428, slab: 372, to: 428 });
    expect(liftFrame(1, 'down', 800)).toEqual({ from: -856, slab: -56, to: 0 });
  });

  it('mirrors the move on the way up', () => {
    expect(liftFrame(0, 'up', 800)).toEqual({ from: 0, slab: -56, to: -856 });
    expect(liftFrame(0.5, 'up', 800)).toEqual({ from: 428, slab: 372, to: -428 });
    expect(liftFrame(1, 'up', 800)).toEqual({ from: 856, slab: 800, to: 0 });
  });

  it('bounces 12 px at the middle of the settle, then comes to rest', () => {
    const down = liftFrame(settleMid, 'down', 800);
    expect(down.from).toBeCloseTo(-868);
    expect(down.slab).toBeCloseTo(-68);
    expect(down.to).toBeCloseTo(-12);
    const up = liftFrame(settleMid, 'up', 800);
    expect(up.from).toBeCloseTo(868);
    expect(up.slab).toBeCloseTo(812);
    expect(up.to).toBeCloseTo(12);
    const end = liftFrame(1 + LIFT.settleS / LIFT.durationS, 'down', 800);
    expect(end.to).toBeCloseTo(0);
  });
});
