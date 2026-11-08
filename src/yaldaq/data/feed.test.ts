import { describe, expect, it } from 'vitest';
import type { FeedEvent, LiveFile } from './contract';
import { createFeed, type Feed } from './feed';
import { FIXTURE, FIXTURE_FILES, fixtureFetch } from './test-fixture';

const BASE = 'https://feed.test/v1/';

/** A fetch on a set of files that counts the requests of each path. */
function counted(files: Record<string, unknown>): {
  fetch: typeof fetch;
  calls: Map<string, number>;
  files: Record<string, unknown>;
  fail: { on: boolean };
} {
  const calls = new Map<string, number>();
  const fail = { on: false };
  const inner = fixtureFetch(files);
  const wrapped = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const path = url.slice(BASE.length);
    calls.set(path, (calls.get(path) ?? 0) + 1);
    if (fail.on) throw new Error('offline');
    return inner(input, init);
  };
  return { fetch: wrapped as typeof fetch, calls, files, fail };
}

/** Runs one poll through start() and waits for the change. */
async function pollOnce(feed: Feed): Promise<void> {
  const changed = new Promise<void>((resolve) => {
    const off = feed.onChange(() => {
      off();
      resolve();
    });
  });
  feed.start();
  await changed;
  feed.stop();
}

/** A tick of the trading loop at 2026-11-02 hh:mm. */
const tick = (hm: string): FeedEvent => ({
  t: `2026-11-02T${hm}:00Z`,
  actor: 'loop',
  kind: 'cycle',
  job: 'trade-demo',
  counts: { open_orders: 0, open_markets: 1, fills: 0, orders: 0, rejections: 0, settlements: 0 },
});

const liveAt = (asOf: string, events: FeedEvent[]): LiveFile => ({
  ...FIXTURE.live,
  as_of: asOf,
  exported_at: asOf,
  events,
});

const HOUR = 3600e3;
const loopTicksOnDay2 = (feed: Feed): number =>
  feed.model?.events.filter(
    (e) => e.actor === 'loop' && e.kind === 'cycle' && e.t.startsWith('2026-11-02'),
  ).length ?? -1;

describe('createFeed', () => {
  it('shows an empty feed when live.json is not there', async () => {
    const feed = createFeed(BASE, { fetch: fixtureFetch({}), pollMs: HOUR });
    expect(feed.status).toBe('connecting');
    await pollOnce(feed);
    expect(feed.status).toBe('empty');
    expect(feed.model).toBeNull();
  });

  it('loads the live file, the days, the reveal, and the scores', async () => {
    const f = counted({ ...FIXTURE_FILES });
    const feed = createFeed(BASE, { fetch: f.fetch, pollMs: HOUR });
    await pollOnce(feed);
    expect(feed.status).toBe('live');
    expect(feed.model?.envelopes).toHaveLength(2);
    expect(feed.model?.envelopes.find((e) => e.id === 'env-0000aaaa')?.reveal).not.toBeNull();
    expect(feed.model?.scores?.history).toHaveLength(1);
    expect(f.calls.get('days/2026-11-01.json')).toBe(1);
    expect(f.calls.get('days/2026-11-02.json')).toBe(1);
  });

  it('merges a new live file with no double events', async () => {
    const f = counted({ ...FIXTURE_FILES });
    const feed = createFeed(BASE, { fetch: f.fetch, pollMs: HOUR });
    await pollOnce(feed);
    f.files['live.json'] = liveAt(
      '2026-11-02T08:05:00Z',
      ['07:35', '07:40', '07:45', '07:50', '07:55', '08:00', '08:05'].map(tick),
    );
    await pollOnce(feed);
    expect(feed.model?.asOf).toBe(Date.parse('2026-11-02T08:05:00Z'));
    expect(loopTicksOnDay2(feed)).toBe(8);
    const same = feed.model?.events.filter(
      (e) => e.actor === 'strike_rate' && e.kind === 'forecast' && e.t === '2026-11-01T05:10:00Z',
    );
    expect(same).toHaveLength(3);
    expect(f.calls.get('days/2026-11-02.json')).toBe(1);
    expect(f.calls.get('scores.json')).toBe(1);
    expect(f.calls.get('reveals/env-0000aaaa.json')).toBe(1);
  });

  it('keeps every event over many polls', async () => {
    const f = counted({ ...FIXTURE_FILES });
    const feed = createFeed(BASE, { fetch: f.fetch, pollMs: HOUR });
    await pollOnce(feed);
    // The live file moves on in steps of 5 min up to 09:00. The day file stays as it was.
    const all = ['07:30', '07:35', '07:40', '07:45', '07:50', '07:55', '08:00'];
    for (const hm of ['08:05', '08:10', '08:15', '08:20', '08:25', '08:30', '08:35', '08:40']) {
      all.push(hm);
      const asOf = Date.parse(`2026-11-02T${hm}:00Z`);
      const events = all.map(tick).filter((e) => Date.parse(e.t) >= asOf - 30 * 60e3);
      f.files['live.json'] = liveAt(`2026-11-02T${hm}:00Z`, events);
      await pollOnce(feed);
    }
    expect(loopTicksOnDay2(feed)).toBe(all.length);
    expect(f.calls.get('days/2026-11-02.json')).toBe(1);
  });

  it('gets the last days again after a gap', async () => {
    const f = counted({ ...FIXTURE_FILES });
    const feed = createFeed(BASE, { fetch: f.fetch, pollMs: HOUR });
    await pollOnce(feed);
    f.files['live.json'] = liveAt('2026-11-02T09:00:00Z', [tick('08:30'), tick('09:00')]);
    await pollOnce(feed);
    expect(f.calls.get('days/2026-11-02.json')).toBe(2);
    expect(feed.model?.asOf).toBe(Date.parse('2026-11-02T09:00:00Z'));
  });

  it('keeps the events of the old live file after a gap at the start of a day', async () => {
    const at = (iso: string): FeedEvent => ({ ...tick('00:00'), t: iso });
    const day = (date: string, times: string[]) => ({
      schema: 2,
      date,
      complete: false,
      events: times.map((hm) => at(`${date}T${hm}:00Z`)),
    });
    const days = ['2026-11-01', '2026-11-02'];
    const f = counted({
      'live.json': {
        ...liveAt(
          '2026-11-02T00:10:00Z',
          ['23:45', '23:55'].map((hm) => at(`2026-11-01T${hm}:00Z`)),
        ),
        days,
      },
      'days/2026-11-01.json': day('2026-11-01', ['23:00', '23:45', '23:55']),
      'days/2026-11-02.json': day('2026-11-02', ['00:05']),
    });
    const feed = createFeed(BASE, { fetch: f.fetch, pollMs: HOUR });
    await pollOnce(feed);
    // No gap: the 23:55 event is now only in the live file.
    f.files['live.json'] = {
      ...liveAt('2026-11-02T00:20:00Z', [
        at('2026-11-01T23:55:00Z'),
        at('2026-11-02T00:05:00Z'),
        at('2026-11-02T00:15:00Z'),
      ]),
      days,
    };
    await pollOnce(feed);
    // A gap: the next poll comes a day later. The day 2026-11-01 stays loaded.
    f.files['days/2026-11-02.json'] = day('2026-11-02', ['00:05', '00:15', '12:00']);
    f.files['days/2026-11-03.json'] = day('2026-11-03', ['07:35']);
    f.files['live.json'] = {
      ...liveAt('2026-11-03T08:00:00Z', [at('2026-11-03T07:35:00Z')]),
      days: [...days, '2026-11-03'],
    };
    await pollOnce(feed);
    const ticks = feed.model?.events.filter((e) => e.actor === 'loop').map((e) => e.t.slice(5, 16));
    expect(ticks).toEqual([
      '11-01T23:00',
      '11-01T23:45',
      '11-01T23:55',
      '11-02T00:05',
      '11-02T00:15',
      '11-02T12:00',
      '11-03T07:35',
    ]);
  });

  it('keeps the model and the status when a poll fails', async () => {
    const f = counted({ ...FIXTURE_FILES });
    const feed = createFeed(BASE, { fetch: f.fetch, pollMs: HOUR });
    await pollOnce(feed);
    const model = feed.model;
    f.fail.on = true;
    const before = f.calls.get('live.json') ?? 0;
    feed.start();
    // Work runs in order, so this call ends after the failed poll.
    await feed.loadDay('2026-11-02');
    expect(f.calls.get('live.json')).toBe(before + 1);
    feed.stop();
    expect(feed.status).toBe('live');
    expect(feed.model).toBe(model);
  });

  it('goes offline when the first poll fails', async () => {
    const f = counted({ ...FIXTURE_FILES });
    f.fail.on = true;
    const feed = createFeed(BASE, { fetch: f.fetch, pollMs: HOUR });
    await pollOnce(feed);
    expect(feed.status).toBe('offline');
    expect(feed.model).toBeNull();
  });

  it('loads an earlier day on request', async () => {
    const live = { ...FIXTURE.live, days: ['2026-10-30', '2026-10-31', ...FIXTURE.live.days] };
    const f = counted({
      ...FIXTURE_FILES,
      'live.json': live,
      'days/2026-10-30.json': { schema: 2, date: '2026-10-30', complete: true, events: [] },
      'days/2026-10-31.json': { schema: 2, date: '2026-10-31', complete: true, events: [] },
    });
    const feed = createFeed(BASE, { fetch: f.fetch, pollMs: HOUR });
    await pollOnce(feed);
    expect(feed.model?.loadedDays).toEqual(['2026-11-01', '2026-11-02']);
    await feed.loadDay('2026-10-31');
    expect(feed.model?.loadedDays).toEqual([
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
      '2026-11-02',
    ]);
  });
});
