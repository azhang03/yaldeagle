import { describe, expect, it } from 'vitest';
import { ms } from './format';
import {
  buildModel,
  eventsBetween,
  moments,
  nextOpening,
  recent,
  stateAt,
  type EnvelopeState,
} from './model';
import { FIXTURE } from './test-fixture';

const model = buildModel(FIXTURE);
const A = 'env-0000aaaa';
const B = 'env-0000bbbb';

const env = (id: string, t: string): EnvelopeState | undefined =>
  stateAt(model, ms(t)).envelopes.find((x) => x.id === id);

describe('buildModel', () => {
  it('takes each event once at the cut between the day files and live.json', () => {
    const day2 = model.events.filter((e) => e.t.startsWith('2026-11-02'));
    expect(day2).toHaveLength(10);
    const at0730 = model.events.filter(
      (e) => e.kind === 'cycle' && e.actor === 'loop' && e.t === '2026-11-02T07:30:00Z',
    );
    expect(at0730).toHaveLength(1);
  });

  it('keeps events at the same second', () => {
    const same = model.events.filter(
      (e) => e.actor === 'strike_rate' && e.kind === 'forecast' && e.t === '2026-11-01T05:10:00Z',
    );
    expect(same).toHaveLength(3);
  });

  it('makes one envelope for each sealed and opened entry, in seal order', () => {
    expect(model.envelopes.map((e) => e.id)).toEqual([A, B]);
    expect(model.envelopes[0]?.reveal?.envelope).toBe(A);
    expect(model.envelopes[1]?.reveal).toBeNull();
    expect(model.envelopes[0]?.opensAt).toBe(ms('2026-11-02T04:59:00Z'));
  });

  it('starts at the first event and ends at the export time', () => {
    expect(model.start).toBe(ms('2026-11-01T04:55:00Z'));
    expect(model.end).toBe(ms('2026-11-02T08:00:00Z'));
    expect(model.loadedDays).toEqual(['2026-11-01', '2026-11-02']);
  });
});

describe('stateAt', () => {
  it('counts the contents of an envelope at t from the contents at the export', () => {
    expect(env(A, '2026-11-01T05:10:05Z')?.counts).toEqual({ forecasts: 6, orders: 0, fills: 0 });
    expect(env(A, '2026-11-01T05:10:12Z')?.counts).toEqual({ forecasts: 9, orders: 0, fills: 0 });
    expect(env(A, '2026-11-02T08:00:00Z')?.counts).toEqual({ forecasts: 9, orders: 1, fills: 1 });
    expect(env(B, '2026-11-01T15:20:00Z')?.counts).toEqual({ forecasts: 4, orders: 0, fills: 0 });
  });

  it('leaves out an envelope before it is sealed', () => {
    expect(env(A, '2026-11-01T05:09:59Z')).toBeUndefined();
  });

  it('opens an envelope at its open time', () => {
    expect(env(A, '2026-11-02T04:58:59Z')?.open).toBe(false);
    expect(env(A, '2026-11-02T04:59:00Z')?.open).toBe(true);
  });

  it('counts the spend of the UTC day and takes the month from the export', () => {
    expect(stateAt(model, ms('2026-11-01T23:00:00Z')).spend.today).toBeCloseTo(0.14, 10);
    expect(stateAt(model, ms('2026-11-02T08:00:00Z')).spend.today).toBe(0);
    expect(stateAt(model, ms('2026-11-02T08:00:00Z')).spend.month).toBeCloseTo(0.14, 10);
  });

  it('marks a job stale after 3 intervals and shows network errors for 10 min', () => {
    expect(stateAt(model, ms('2026-11-01T05:20:00Z')).jobs.loop.stale).toBe(true);
    expect(stateAt(model, ms('2026-11-01T12:05:00Z')).jobs.loop.error).toBe(true);
    expect(stateAt(model, ms('2026-11-01T12:20:00Z')).jobs.loop.error).toBe(false);
  });

  it('runs a call from t to t_end', () => {
    expect(stateAt(model, ms('2026-11-01T05:10:05Z')).calls).toHaveLength(1);
    expect(stateAt(model, ms('2026-11-01T05:10:12Z')).calls).toHaveLength(0);
  });

  it('makes the room quiet only after 20 min with no work', () => {
    expect(stateAt(model, ms('2026-11-01T05:31:00Z')).quiet).toBe(false);
    expect(stateAt(model, ms('2026-11-01T05:36:00Z')).quiet).toBe(true);
  });
});

describe('nextOpening', () => {
  it('gives the next brief or the next opening of live.json', () => {
    expect(nextOpening(model, ms('2026-11-01T06:00:00Z'))).toEqual({
      series: 'Trump approval, daily',
      at: ms('2026-11-01T15:20:00Z'),
    });
    expect(nextOpening(model, ms('2026-11-02T08:00:00Z'))).toEqual({
      series: 'Trump approval, daily',
      at: ms('2026-11-02T15:00:00Z'),
    });
  });
});

describe('eventsBetween', () => {
  it('takes the events with t0 < at <= t1', () => {
    const evs = eventsBetween(model, ms('2026-11-01T05:10:00Z'), ms('2026-11-01T05:10:12Z'));
    expect(evs.map((e) => e.kind)).toEqual(['repair', 'spend']);
    const t = ms('2026-11-01T05:10:12Z');
    expect(eventsBetween(model, t, t)).toHaveLength(0);
  });
});

describe('recent', () => {
  it('counts the work of the last 24 hours', () => {
    const c = recent(model, ms('2026-11-02T04:00:00Z')).counts;
    expect(c.calls).toBe(2);
    expect(c.forecasts).toBe(15);
    expect(c.orders).toBe(1);
    expect(c.fills).toBe(1);
    expect(c.errors).toBe(3);
  });

  it('counts no forecasts of a call that still runs', () => {
    expect(recent(model, ms('2026-11-01T05:10:05Z')).counts.forecasts).toBe(6);
  });

  it('marks the bins after the export time as no data', () => {
    const bar = recent(model, ms('2026-11-02T09:00:00Z')).bar;
    expect(bar.slice(46).map((b) => b.noData)).toEqual([true, true]);
  });
});

describe('moments', () => {
  it('lists the calls, the fills, the error runs, the unseals, and the loop gaps', () => {
    const kinds = moments(model).map((m) => m.kind);
    const count = (k: string): number => kinds.filter((x) => x === k).length;
    expect(count('call')).toBe(2);
    expect(count('fill')).toBe(1);
    expect(count('error')).toBe(1);
    expect(count('unseal')).toBe(1);
    expect(count('gap')).toBe(1);
    expect(moments(model).find((m) => m.kind === 'fill')?.exAt).toBe(ms('2026-11-01T09:30:00Z'));
  });
});
