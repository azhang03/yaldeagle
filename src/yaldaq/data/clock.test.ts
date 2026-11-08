import { describe, expect, it } from 'vitest';
import { createClock, readOptions } from './clock';
import { ms } from './format';

const bounds = (): { start: number; end: number } => ({
  start: ms('2026-11-01T04:55:00Z'),
  end: ms('2026-11-02T08:00:00Z'),
});
const NONE = { t: null, speed: null, paused: false };

describe('readOptions', () => {
  it('reads the time, the speed, and the pause from the URL', () => {
    expect(readOptions('?t=2026-11-01T05:00:00Z&speed=10&paused')).toEqual({
      t: ms('2026-11-01T05:00:00Z'),
      speed: 10,
      paused: true,
    });
  });

  it('ignores a bad time and a bad speed', () => {
    expect(readOptions('?t=soon&speed=7')).toEqual(NONE);
  });

  it('works with no location', () => {
    expect(readOptions()).toEqual(NONE);
  });
});

describe('createClock', () => {
  it('follows the wall clock 5 min behind in live mode and waits at the end', () => {
    let now = ms('2026-11-02T08:03:00Z');
    const clock = createClock(bounds, NONE, () => now);
    expect(clock.live).toBe(true);
    expect(clock.t).toBe(ms('2026-11-02T07:58:00Z'));
    clock.tick(0.016);
    now += 1000;
    const step = clock.tick(1);
    expect(step).toEqual({
      from: ms('2026-11-02T07:58:00Z'),
      to: ms('2026-11-02T07:58:01Z'),
      jumped: false,
    });
    now = ms('2026-11-02T09:00:00Z');
    clock.tick(1);
    expect(clock.t).toBe(ms('2026-11-02T08:00:00Z'));
  });

  it('gives a jump on the tick after a seek and ends live mode', () => {
    const clock = createClock(bounds, NONE, () => ms('2026-11-02T08:03:00Z'));
    clock.tick(0.016);
    clock.seek(ms('2026-11-01T06:00:00Z'));
    expect(clock.live).toBe(false);
    const step = clock.tick(1);
    expect(step.jumped).toBe(true);
    expect(step.to).toBe(ms('2026-11-01T06:00:00Z'));
    expect(clock.tick(1).jumped).toBe(false);
    expect(clock.t).toBe(ms('2026-11-01T06:00:01Z'));
  });

  it('moves 10 s for each wall second at 10x and stops at the end', () => {
    const end = bounds().end;
    const clock = createClock(bounds, { t: end - 15e3, speed: 10, paused: false }, () => 0);
    expect(clock.live).toBe(false);
    clock.tick(1);
    expect(clock.tick(1).to).toBe(end - 5e3);
    expect(clock.playing).toBe(true);
    clock.tick(1);
    expect(clock.t).toBe(end);
    expect(clock.playing).toBe(false);
  });

  it('goes back to live mode at 1x', () => {
    const clock = createClock(bounds, { t: bounds().start, speed: 60, paused: true }, () =>
      ms('2026-11-02T08:03:00Z'),
    );
    let changes = 0;
    clock.onChange(() => changes++);
    clock.goLive();
    expect(changes).toBe(1);
    expect([clock.live, clock.playing, clock.speed]).toEqual([true, true, 1]);
    expect(clock.t).toBe(ms('2026-11-02T07:58:00Z'));
  });
});
