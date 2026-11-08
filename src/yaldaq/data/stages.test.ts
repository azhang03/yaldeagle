import { describe, expect, it, vi } from 'vitest';
import { ms } from './format';
import { buildModel, type Envelope } from './model';
import { cubbiesAt, LOCKER_KEEP_MS, stageAt, timesOf, type StageTimes } from './stages';
import { FIXTURE } from './test-fixture';

const model = buildModel(FIXTURE);
const A = 'env-0000aaaa';
const B = 'env-0000bbbb';

const envOf = (id: string): Envelope => {
  const e = model.envelopes.find((x) => x.id === id);
  if (!e) throw new Error(`no envelope ${id}`);
  return e;
};
const times = new Map([A, B].map((id) => [id, timesOf(model, envOf(id))]));
const timesA = times.get(A)!;
const timesB = times.get(B)!;

describe('stageAt', () => {
  it('moves envelope A through each stage at its events', () => {
    expect(stageAt(timesA, ms('2026-11-01T05:09:59Z'))).toBeNull();
    expect(stageAt(timesA, ms('2026-11-01T05:10:00Z'))).toBe('lab');
    expect(stageAt(timesA, ms('2026-11-01T05:10:12Z'))).toBe('ladder');
    expect(stageAt(timesA, ms('2026-11-01T05:15:00Z'))).toBe('policy');
    expect(stageAt(timesA, ms('2026-11-01T05:15:05Z'))).toBe('locker');
    expect(stageAt(timesA, ms('2026-11-02T04:59:00Z'))).toBe('open');
  });

  it('puts envelope B in the locker at its pass', () => {
    expect(stageAt(timesB, ms('2026-11-01T15:25:00Z'))).toBe('locker');
  });

  it('puts an envelope in the locker when its own events are not loaded', () => {
    const late = buildModel({
      ...FIXTURE,
      live: { ...FIXTURE.live, days: ['2026-11-02'] },
      days: FIXTURE.days.filter((d) => d.date === '2026-11-02'),
    });
    const env = late.envelopes.find((x) => x.id === B)!;
    expect(env.sealedAt).toBeLessThan(late.start);
    const x = timesOf(late, env);
    expect(x).toEqual({
      brief: env.sealedAt,
      callEnd: env.sealedAt,
      policyStart: env.sealedAt,
      policyEnd: env.sealedAt,
      unseal: env.opensAt,
    });
    expect(stageAt(x, late.start)).toBe('locker');
  });
});

describe('cubbiesAt', () => {
  it('gives each envelope its cubby and frees it after the keep time', () => {
    const now = cubbiesAt(times, ms('2026-11-02T08:00:00Z'), 12);
    expect(now.get(A)).toBe(0);
    expect(now.get(B)).toBe(1);
    const later = cubbiesAt(times, ms('2026-11-03T05:00:00Z'), 12);
    expect(later.has(A)).toBe(false);
    expect(later.get(B)).toBe(1);
  });

  const t0 = ms('2026-11-05T00:00:00Z');
  const sealed = (i: number, unseal = t0 + 10 * LOCKER_KEEP_MS): StageTimes => {
    const at = t0 + i * 60e3;
    return { brief: at, callEnd: at, policyStart: at, policyEnd: at, unseal };
  };

  it('shares cubby 0 when a thirteenth sealed envelope enters, and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const map = new Map(Array.from({ length: 13 }, (_, i) => [`e${i}`, sealed(i)]));
    const got = cubbiesAt(map, t0 + 20 * 60e3, 12);
    for (let i = 0; i < 12; i++) expect(got.get(`e${i}`)).toBe(i);
    expect(got.get('e12')).toBe(0);
    cubbiesAt(map, t0 + 20 * 60e3, 12);
    expect(warn).toHaveBeenCalledTimes(1);
    warn.mockRestore();
  });

  it('gives the thirteenth envelope the cubby of an open envelope', () => {
    const map = new Map(Array.from({ length: 13 }, (_, i) => [`e${i}`, sealed(i)]));
    map.set('e5', sealed(5, t0 + 6 * 60e3));
    const got = cubbiesAt(map, t0 + 20 * 60e3, 12);
    expect(got.has('e5')).toBe(false);
    expect(got.get('e12')).toBe(5);
  });
});
