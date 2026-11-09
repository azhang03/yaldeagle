// A small made-up feed for the tests. It is not YALDAQ data and not the trials' sample.
// Two days (2026-11-01 and 2026-11-02), two envelopes: A opened with results, B still sealed.

import type { DayFile, FeedEvent, JobName, LiveFile, RevealFile, ScoresFile } from './contract';
import { FEED_PATH } from './feed-paths';

const A = 'env-0000aaaa';
const B = 'env-0000bbbb';
const SERIES_A = 'Truth Social posts, daily';
const SERIES_B = 'Trump approval, daily';

const d1 = (hms: string): string => `2026-11-01T${hms}Z`;
const d2 = (hms: string): string => `2026-11-02T${hms}Z`;

const loopCounts = (openMarkets: number): Record<string, number> => ({
  open_orders: 0,
  open_markets: openMarkets,
  fills: 0,
  orders: 0,
  rejections: 0,
  settlements: 0,
});

const scanCounts = (open: number): Record<string, number> => ({
  open,
  new: 0,
  events: 0,
  forecasts: 0,
  skipped_late: 0,
  skipped_cap: 0,
  failed: 0,
});

const tick = (t: string, openMarkets: number): FeedEvent => ({
  t,
  actor: 'loop',
  kind: 'cycle',
  job: 'trade-demo',
  counts: loopCounts(openMarkets),
});

const forecasts = (t: string, envelope: string, n: number): FeedEvent[] =>
  (['strike_rate', 'base_rate'] as const).flatMap((actor) =>
    Array.from({ length: n }, (): FeedEvent => ({ t, actor, kind: 'forecast', envelope })),
  );

const supervisor = (t: string, kind: 'error' | 'stall_check'): FeedEvent => {
  const job: JobName = 'trade-demo';
  return kind === 'error'
    ? { t, actor: 'supervisor', kind, job, error: 'network' }
    : { t, actor: 'supervisor', kind, job };
};

const day1: FeedEvent[] = [
  tick(d1('04:55:00'), 0),
  {
    t: d1('05:00:00'),
    actor: 'scanner',
    kind: 'cycle',
    job: 'forecast-new',
    counts: scanCounts(90),
  },
  {
    t: d1('05:00:00'),
    actor: 'scanner',
    kind: 'requests',
    env: 'prod',
    n: 9,
    by_kind: { markets: 9 },
    errors: 0,
  },
  {
    t: d1('05:10:00'),
    actor: 'brief',
    kind: 'brief',
    envelope: A,
    series: SERIES_A,
    event_day: '2026-11-01',
    markets: 3,
  },
  ...forecasts(d1('05:10:00'), A, 3),
  {
    t: d1('05:10:00'),
    t_end: d1('05:10:12'),
    actor: 'claude',
    kind: 'call',
    envelope: A,
    markets: 3,
    searches: 2,
    cost_usd: 0.08,
  },
  {
    t: d1('05:10:12'),
    actor: 'ladder',
    kind: 'repair',
    envelope: A,
    shape: 'partition',
    sum_raw: 0.98,
    repair_max: 0.02,
  },
  { t: d1('05:10:12'), actor: 'cost', kind: 'spend', cost_usd: 0.08, ok: true },
  {
    t: d1('05:15:00'),
    actor: 'policy',
    kind: 'pass',
    envelope: A,
    stage: 'policy',
    reasons: { edge: 2 },
  },
  { t: d1('05:15:05'), actor: 'policy', kind: 'order', envelope: A, venue: 'shadow' },
  {
    t: d1('09:30:40'),
    t_exchange: d1('09:30:00'),
    actor: 'shadow',
    kind: 'fill',
    envelope: A,
    venue: 'shadow',
  },
  supervisor(d1('12:00:00'), 'error'),
  supervisor(d1('12:00:10'), 'error'),
  supervisor(d1('12:00:30'), 'error'),
  supervisor(d1('12:05:00'), 'stall_check'),
  {
    t: d1('15:20:00'),
    actor: 'brief',
    kind: 'brief',
    envelope: B,
    series: SERIES_B,
    event_day: '2026-11-02',
    markets: 2,
  },
  ...forecasts(d1('15:20:00'), B, 2),
  {
    t: d1('15:20:00'),
    t_end: d1('15:20:15'),
    actor: 'claude',
    kind: 'call',
    envelope: B,
    markets: 2,
    searches: 1,
    cost_usd: 0.06,
  },
  {
    t: d1('15:20:15'),
    actor: 'ladder',
    kind: 'repair',
    envelope: B,
    shape: 'partition',
    sum_raw: 1,
    repair_max: null, // B is sealed, so the exporter leaves out the largest fix
  },
  { t: d1('15:20:15'), actor: 'cost', kind: 'spend', cost_usd: 0.06, ok: true },
  {
    t: d1('15:25:00'),
    actor: 'policy',
    kind: 'pass',
    envelope: B,
    stage: 'policy',
    reasons: { wide_spread: 2 },
  },
  { t: d1('16:00:00'), actor: 'reconcile', kind: 'reconcile', ok: true },
];

const day2: FeedEvent[] = [
  { t: d2('04:59:00'), actor: 'vault', kind: 'unseal', envelope: A },
  {
    t: d2('05:00:00'),
    actor: 'scanner',
    kind: 'cycle',
    job: 'forecast-new',
    counts: scanCounts(92),
  },
  { t: d2('07:00:00'), actor: 'shadow', kind: 'settle', envelope: A, realized_usd: 8 },
  ...['07:30', '07:35', '07:40', '07:45', '07:50', '07:55', '08:00'].map((hm) =>
    tick(d2(`${hm}:00`), 1),
  ),
];

const days: DayFile[] = [
  { schema: 2, date: '2026-11-01', complete: true, events: day1 },
  { schema: 2, date: '2026-11-02', complete: false, events: day2 },
];

const live: LiveFile = {
  schema: 2,
  label: 'fixture',
  exported_at: d2('08:00:00'),
  as_of: d2('08:00:00'),
  pilot: { started: null, day: null, days_planned: 42, day_28_read: null },
  jobs: [
    {
      job: 'forecast-new',
      state: 'running',
      interval_s: 900,
      started_at: d1('04:50:00'),
      last_cycle_at: d2('05:00:00'),
      cycles: 2,
      has_error: false,
      stale: false,
    },
    {
      job: 'trade-demo',
      state: 'running',
      interval_s: 300,
      started_at: d1('04:50:00'),
      last_cycle_at: d2('08:00:00'),
      cycles: 8,
      has_error: false,
      stale: false,
    },
  ],
  risk: { kill_switch: false, drawdown_flag: false },
  money: {
    start_nav_usd: 1000,
    realized_usd: 8,
    open_at_cost_usd: null,
    spend_today_usd: 0,
    daily_cap_usd: 10,
    spend_month_usd: 0.14,
    monthly_cap_usd: 50,
  },
  series: [
    'Trump approval, daily',
    'Truth Social posts, daily',
    'Jobless claims, weekly',
    'Trump actions, weekly',
    'Truth Social posts, weekly',
    'Top AI model, year end',
    'RCP approval, weekly',
    'Suez Canal traffic, weekly',
    'Senate nominations, weekly',
  ],
  next_openings: [
    { series: SERIES_B, at: d2('15:00:00') },
    { series: SERIES_A, at: '2026-11-03T05:00:00Z' },
  ],
  sealed: [
    {
      envelope: B,
      series: SERIES_B,
      event_day: '2026-11-02',
      markets: 2,
      sealed_at: d1('15:20:00'),
      opens_at: d2('17:59:00'),
      contents: { forecasts: 6, orders: 0, fills: 0 },
    },
  ],
  opened: [
    {
      envelope: A,
      series: SERIES_A,
      event_day: '2026-11-01',
      markets: 3,
      sealed_at: d1('05:10:00'),
      opened_at: d2('04:59:00'),
      contents: { forecasts: 9, orders: 1, fills: 1 },
      settled: 3,
    },
  ],
  days: ['2026-11-01', '2026-11-02'],
  events: day2.filter((e) => e.t >= d2('07:30:00')),
};

const revealA: RevealFile = {
  schema: 2,
  envelope: A,
  series: SERIES_A,
  event_day: '2026-11-01',
  opened_at: d2('04:59:00'),
  markets: [
    {
      strike: 'below 5',
      forecasts: {
        claude: { p: 0.2, p_raw: 0.21 },
        strike_rate: { p: 0.3 },
        base_rate: { p: 0.33 },
      },
      order: null,
      pass: ['edge'],
      fills: [],
      result: 'no',
    },
    {
      strike: '5 to 9',
      forecasts: {
        claude: { p: 0.5, p_raw: 0.48 },
        strike_rate: { p: 0.4 },
        base_rate: { p: 0.33 },
      },
      order: { side: 'yes', price: 0.2, contracts: 10, venue: 'shadow' },
      pass: [],
      fills: [{ t: d1('09:30:00'), contracts: 10, price: 0.2 }],
      result: 'yes',
    },
    {
      strike: '10 or more',
      forecasts: {
        claude: { p: 0.3, p_raw: 0.29 },
        strike_rate: { p: 0.3 },
        base_rate: { p: 0.34 },
      },
      order: null,
      pass: ['edge'],
      fills: [],
      result: 'no',
    },
  ],
  claude: {
    rationale: 'Made-up notes for the tests.',
    searches: [
      { query: 'made-up query one', results: 3 },
      { query: 'made-up query two', results: 5 },
    ],
    latency_ms: 12000,
    sum_raw: 0.98,
    repair_max: 0.02,
    saw_price: false,
  },
};

const brierA = { claude: 0.1133, strike_rate: 0.1633, base_rate: 0.2222 };

const scores: ScoresFile = {
  schema: 2,
  as_of: d2('08:00:00'),
  history: [
    {
      envelope: A,
      series: SERIES_A,
      event_day: '2026-11-01',
      settled_at: d2('07:00:00'),
      markets: 3,
      brier: brierA,
      total: {
        markets: 3,
        brier: brierA,
        duel: { claude: 2, strike_rate: 1, tie: 0 },
        realized_usd: 8,
      },
    },
  ],
};

export const FIXTURE: {
  live: LiveFile;
  days: DayFile[];
  reveals: RevealFile[];
  scores: ScoresFile;
} = { live, days, reveals: [revealA], scores };

/**
 * The fixture as an export from before A opened would send its fill: with no print time
 * (t_exchange). The rest is the same.
 */
export const FIXTURE_SEALED_FILL: typeof FIXTURE = {
  ...FIXTURE,
  days: days.map((d) => ({
    ...d,
    events: d.events.map((e) => {
      if (e.kind !== 'fill') return e;
      const sealed = { ...e };
      delete sealed.t_exchange;
      return sealed;
    }),
  })),
};

/** The fixture as store files, keyed by path. Tests copy it and change single files. */
export const FIXTURE_FILES: Record<string, unknown> = {
  'live.json': live,
  'scores.json': scores,
  'days/2026-11-01.json': days[0],
  'days/2026-11-02.json': days[1],
  [`reveals/${A}.json`]: revealA,
};

/**
 * A fake fetch for `<base><path>`. A set path gives 200 and its JSON. A feed path that is not
 * set gives 204 with no body, as the store does. Any other path gives 404.
 */
export function fixtureFetch(files: Record<string, unknown | undefined>): typeof fetch {
  const fake = async (input: RequestInfo | URL): Promise<Response> => {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const path = url.replace(/^.*?\/v1\//, '');
    const data = files[path];
    if (data !== undefined) {
      return new Response(JSON.stringify(data), {
        status: 200,
        headers: { 'content-type': 'application/json; charset=utf-8' },
      });
    }
    if (FEED_PATH.test(path)) return new Response(null, { status: 204 });
    return new Response(JSON.stringify({ error: 'not-found' }), { status: 404 });
  };
  return fake as typeof fetch;
}
