import { describe, expect, it } from 'vitest';
import { SUBJECTS, allFacts, factsFor, type Stat, type Subject } from './facts';
import { ms } from './format';
import { buildModel } from './model';
import { FIXTURE } from './test-fixture';

const model = buildModel(FIXTURE);
const A = 'env-0000aaaa';

const statOf = (subject: Subject, key: string, t: string): Stat | undefined =>
  factsFor(subject, model, ms(t)).stats.find((s) => s.key === key);

describe('factsFor', () => {
  it('shows the forecasts of a control only from an envelope that is open at t', () => {
    const before = factsFor('strike_rate', model, ms('2026-11-02T04:58:59Z'));
    expect(before.detail.revealed).toBeNull();
    expect(before.detail.sealedEnvelopes).toHaveLength(2);
    const after = factsFor('strike_rate', model, ms('2026-11-02T04:59:00Z'));
    expect(after.detail.revealed?.envelope).toBe(A);
    expect(after.detail.revealed?.markets).toHaveLength(3);
  });

  it('shows no Brier score before a market settles', () => {
    const brier = statOf('strike_rate', 'brier', '2026-11-02T04:59:00Z');
    expect(brier?.value).toBeNull();
    expect(brier?.note).toBe('No settled markets yet');
    expect(statOf('strike_rate', 'brier', '2026-11-02T07:00:00Z')?.value).toBe(0.1633);
  });

  it('shows no searches, time, or cost of a Claude call until it ends', () => {
    const mid = factsFor('claude', model, ms('2026-11-01T05:10:05Z'));
    expect(mid.status.tone).toBe('work');
    expect(mid.detail.calls?.[0]).toMatchObject({
      done: false,
      searches: null,
      secs: null,
      cost: null,
    });
    expect(mid.detail.openEnvelope).toBeNull();
    const end = factsFor('claude', model, ms('2026-11-01T05:10:12Z'));
    expect(end.detail.calls?.[0]?.searches).toBe(2);
  });

  it('sums the pass reasons of the last 24 hours and shows no side or price of an order', () => {
    const f = factsFor('policy', model, ms('2026-11-02T08:00:00Z'));
    expect(Object.fromEntries((f.detail.reasons ?? []).map((r) => [r.key, r.n]))).toEqual({
      wide_spread: 2,
    });
    expect(Object.keys(f.detail.orders?.[0] ?? {}).sort()).toEqual(['at', 'series']);
  });

  it('shows the wall screen empty before a market settles', () => {
    const before = factsFor('board', model, ms('2026-11-02T06:59:00Z'));
    expect(before.status).toEqual({ tone: 'idle', text: 'No settled markets yet' });
    expect(before.detail.board).toBeNull();
    const after = factsFor('board', model, ms('2026-11-02T07:00:00Z'));
    expect(after.status).toEqual({ tone: 'ok', text: '3 settled markets' });
    expect(after.stats.find((s) => s.key === 'claude')?.value).toBe(0.1133);
  });

  it('lists the open gap of the trading loop up to t', () => {
    const gaps = factsFor('loop', model, ms('2026-11-01T06:00:00Z')).detail.gaps;
    expect(gaps).toEqual([{ from: ms('2026-11-01T04:55:00Z'), to: ms('2026-11-01T06:00:00Z') }]);
  });
});

describe('allFacts', () => {
  it('gives every subject 48 spark bins', () => {
    for (const t of [ms('2026-11-02T08:00:00Z'), ms('2026-11-01T12:00:00Z')]) {
      const all = allFacts(model, t);
      expect(Object.keys(all)).toEqual([...SUBJECTS]);
      for (const f of Object.values(all)) expect(f.spark.bins).toHaveLength(48);
    }
  });
});
