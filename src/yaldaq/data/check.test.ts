import { describe, expect, it } from 'vitest';
import { checkUpload } from './check';
import { cacheSeconds } from './feed-paths';
import { FIXTURE, FIXTURE_FILES } from './test-fixture';

const NOW = Date.parse('2026-11-02T08:00:00Z');
const copy = <T>(v: T): T => structuredClone(v);

describe('checkUpload', () => {
  it('accepts every fixture file', () => {
    for (const [path, data] of Object.entries(FIXTURE_FILES)) {
      expect(checkUpload(path, data, NOW), path).toEqual({ ok: true });
    }
  });

  it('refuses a path outside the feed', () => {
    expect(checkUpload('../live.json', copy(FIXTURE.live), NOW)).toEqual({
      ok: false,
      rule: 'path',
    });
  });

  it('refuses schema 1', () => {
    const live = { ...copy(FIXTURE.live), schema: 1 };
    expect(checkUpload('live.json', live, NOW)).toEqual({ ok: false, rule: 'schema' });
  });

  it('refuses a Kalshi key inside a reveal market', () => {
    const reveal = copy(FIXTURE.reveals[0]!);
    Object.assign(reveal.markets[0]!, { ticker: 'X' });
    expect(checkUpload('reveals/env-0000aaaa.json', reveal, NOW)).toEqual({
      ok: false,
      rule: 'kalshi-key:ticker',
    });
  });

  it('refuses a price key inside a live event', () => {
    const live = copy(FIXTURE.live);
    Object.assign(live.events[0]!, { price: 0.2 });
    expect(checkUpload('live.json', live, NOW)).toEqual({ ok: false, rule: 'sealed-key:price' });
  });

  it('refuses a strike key in a day file', () => {
    const day = copy(FIXTURE.days[0]!);
    Object.assign(day.events[0]!, { strike: '5 to 9' });
    expect(checkUpload('days/2026-11-01.json', day, NOW)).toEqual({
      ok: false,
      rule: 'sealed-key:strike',
    });
  });

  it('refuses a list of searches in a live event', () => {
    const live = copy(FIXTURE.live);
    Object.assign(live.events[0]!, { searches: [] });
    expect(checkUpload('live.json', live, NOW)).toEqual({ ok: false, rule: 'searches-list' });
  });

  it('refuses a day file whose date differs from its path', () => {
    const day = { ...copy(FIXTURE.days[0]!), date: '2026-11-02' };
    expect(checkUpload('days/2026-11-01.json', day, NOW)).toEqual({
      ok: false,
      rule: 'day-date',
    });
  });

  it('refuses a reveal file that holds another envelope', () => {
    const reveal = { ...copy(FIXTURE.reveals[0]!), envelope: 'env-0000bbbb' };
    expect(checkUpload('reveals/env-0000aaaa.json', reveal, NOW)).toEqual({
      ok: false,
      rule: 'envelope-id',
    });
  });

  it('refuses a reveal file before its envelope opens', () => {
    const reveal = { ...copy(FIXTURE.reveals[0]!), opened_at: '2026-11-02T08:10:00Z' };
    expect(checkUpload('reveals/env-0000aaaa.json', reveal, NOW)).toEqual({
      ok: false,
      rule: 'early-reveal',
    });
  });
});

describe('cacheSeconds', () => {
  it('gives the cache time of each file kind', () => {
    expect(cacheSeconds('live.json', NOW)).toBe(20);
    expect(cacheSeconds('scores.json', NOW)).toBe(120);
    expect(cacheSeconds('reveals/env-0000aaaa.json', NOW)).toBe(300);
    expect(cacheSeconds('days/2026-10-30.json', NOW)).toBe(86400);
    expect(cacheSeconds('days/2026-11-01.json', NOW)).toBe(60);
  });
});
