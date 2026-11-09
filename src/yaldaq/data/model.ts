// The model of the YALDAQ feed: the files merged into one event list, the envelopes, and the
// state at any time. No DOM and no Three.js.
//
// Public rules (docs/trials/yaldaq/BRIEF.md): the files already obey them. This module adds no
// data from anywhere else. It only counts and orders what the files hold.
import type {
  DayFile,
  EventKind,
  FeedEvent,
  Job,
  JobName,
  LiveFile,
  RevealFile,
  ScoresFile,
} from './contract';
import { DAY_MS, dayOf, dayStart, fmtDur, ms } from './format';

/** The live page runs this far behind real time. */
export const LIVE_DELAY_MS = 5 * 60e3;
/** After this long with no work event, the room is quiet. */
export const QUIET_AFTER_MS = 20 * 60e3;
/** A network error marks its job for this long. */
export const ERROR_SHOWS_MS = 10 * 60e3;
/** A job is stale when its last cycle is older than this many intervals (the exporter's rule). */
export const STALE_INTERVALS = 3;
/** The feed is stale when its export time is older than this. */
export const STALE_FEED_MS = 20 * 60e3;
/** live.json holds the events of this last span. The day files hold the older ones. */
export const LIVE_TAIL_MS = 30 * 60e3;
/** The span of the "last 24 hours" strip. */
export const RECENT_MS = 24 * 3600e3;

/** The event kinds that mean real work on a market. Ticks, requests, and checks are not work. */
export const WORK_KINDS: ReadonlySet<EventKind> = new Set<EventKind>([
  'brief',
  'forecast',
  'call',
  'repair',
  'order',
  'pass',
  'fill',
  'settle',
  'spend',
  'unseal',
]);

/** The event kinds that draw a mark on the activity bar. The rest is the heartbeat. */
export type MarkKind = 'brief' | 'call' | 'order' | 'fill' | 'error' | 'unseal';
export const MARK_KINDS: ReadonlySet<EventKind> = new Set<MarkKind>([
  'brief',
  'call',
  'order',
  'fill',
  'error',
  'unseal',
]);

/** Plain words for the pass reasons of the policy. */
export const REASONS: Readonly<Record<string, string>> = {
  edge: 'Not enough edge',
  wide_spread: 'Spread too wide',
  p_extreme: 'Forecast too close to 0 or 1',
};

/** The actors that tick for the two loop jobs. */
export type JobActor = 'scanner' | 'loop';

/** The two loop jobs and the actors that tick for them. */
export const JOBS: Readonly<Record<JobName, { actor: JobActor; name: string; intervalS: number }>> =
  {
    'forecast-new': { actor: 'scanner', name: 'Scanner', intervalS: 900 },
    'trade-demo': { actor: 'loop', name: 'Trading loop', intervalS: 300 },
  };

/** An event with its times in ms: `end` for a Claude call, `exAt` for a fill. */
export interface TimedEvent extends FeedEvent {
  at: number;
  end?: number;
  exAt?: number;
}

export interface Envelope {
  id: string;
  series: string;
  eventDay: string | null;
  markets: number;
  sealedAt: number;
  opensAt: number;
  /** The contents at the export time. */
  final: { forecasts: number; orders: number; fills: number };
  settled: number;
  reveal: RevealFile | null;
}

export interface FeedFiles {
  live: LiveFile;
  days: DayFile[];
  reveals: RevealFile[];
  scores: ScoresFile | null;
}

export interface Model {
  label: string;
  asOf: number;
  exportedAt: number;
  /** The first event, or the start of the first loaded day. */
  start: number;
  /** The last time the replay can show: the export time. */
  end: number;
  /** Every date that has a day file in the store. */
  days: string[];
  /** The dates of the day files that the model holds, ascending. */
  loadedDays: string[];
  events: TimedEvent[];
  envelopes: Envelope[];
  openings: { series: string; at: number }[];
  series: string[];
  jobs: Job[];
  pilot: LiveFile['pilot'];
  risk: LiveFile['risk'];
  money: LiveFile['money'];
  scores: ScoresFile | null;
}

function timed(e: FeedEvent): TimedEvent {
  const o: TimedEvent = { ...e, at: ms(e.t) };
  if (e.t_end) o.end = ms(e.t_end);
  if (e.t_exchange) o.exAt = ms(e.t_exchange);
  return o;
}

/**
 * Builds the model from the parsed files. The day files give the events before the cut
 * (as_of - LIVE_TAIL_MS); live.json gives the events from the cut on.
 */
export function buildModel(files: FeedFiles): Model {
  const { live } = files;
  const asOf = ms(live.as_of);
  const cut = asOf - LIVE_TAIL_MS;
  const days = files.days.slice().sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const events = [
    ...days.flatMap((d) => d.events.map(timed).filter((e) => e.at < cut)),
    ...live.events.map(timed).filter((e) => e.at >= cut),
  ];
  // A stable sort keeps the file order of events at the same time.
  events.sort((a, b) => a.at - b.at);

  const reveals = new Map(files.reveals.map((r) => [r.envelope, r]));
  const envelopes: Envelope[] = [
    ...live.sealed.map((s) => ({
      id: s.envelope,
      series: s.series,
      eventDay: s.event_day,
      markets: s.markets,
      sealedAt: ms(s.sealed_at),
      opensAt: ms(s.opens_at),
      final: { ...s.contents },
      settled: 0,
      reveal: reveals.get(s.envelope) ?? null,
    })),
    ...live.opened.map((o) => ({
      id: o.envelope,
      series: o.series,
      eventDay: o.event_day,
      markets: o.markets,
      sealedAt: ms(o.sealed_at),
      opensAt: ms(o.opened_at),
      final: { ...o.contents },
      settled: o.settled,
      reveal: reveals.get(o.envelope) ?? null,
    })),
  ].sort((a, b) => a.sealedAt - b.sealedAt);

  const loadedDays = days.map((d) => d.date);
  const first = events[0];
  const firstDay = loadedDays[0];
  const start = first ? first.at : firstDay ? dayStart(firstDay) : asOf;

  return {
    label: live.label,
    asOf,
    exportedAt: ms(live.exported_at),
    start,
    end: asOf,
    days: live.days.slice(),
    loadedDays,
    events,
    envelopes,
    openings: live.next_openings.map((o) => ({ series: o.series, at: ms(o.at) })),
    series: live.series,
    jobs: live.jobs,
    pilot: live.pilot,
    risk: live.risk,
    money: live.money,
    scores: files.scores,
  };
}

/** The index of the first event with at > t (binary search). */
export function indexAfter(events: readonly { at: number }[], t: number): number {
  let lo = 0;
  let hi = events.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if ((events[mid]?.at ?? Infinity) <= t) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** The events with t0 < at <= t1, in order. Use it for the motion of one frame. */
export function eventsBetween(model: Model, t0: number, t1: number): TimedEvent[] {
  if (t1 <= t0) return [];
  return model.events.slice(indexAfter(model.events, t0), indexAfter(model.events, t1));
}

/**
 * The next opening after t: the next new event that YALDAQ saw (a brief), or a coming opening
 * of live.json, whichever is first.
 */
export function nextOpening(model: Model, t: number): { series: string; at: number } | null {
  let best: { series: string; at: number } | null = null;
  for (let i = indexAfter(model.events, t); i < model.events.length; i++) {
    const e = model.events[i];
    if (e && e.kind === 'brief' && e.series) {
      best = { series: e.series, at: e.at };
      break;
    }
  }
  for (const o of model.openings) {
    if (o.at > t && (!best || o.at < best.at)) best = { series: o.series, at: o.at };
  }
  return best;
}

export interface JobState {
  job: JobName;
  name: string;
  intervalS: number;
  /** The time of the last cycle, or null. */
  last: number | null;
  counts: Record<string, number> | null;
  stale: boolean;
  error: boolean;
}

export interface EnvelopeState extends Envelope {
  open: boolean;
  opensIn: number;
  /** The contents at t. */
  counts: { forecasts: number; orders: number; fills: number };
}

export interface State {
  t: number;
  jobs: Record<JobActor, JobState>;
  /** Market reads in the last scanner request batch of the last 2 min. */
  readsPerMin: number;
  spend: { today: number; month: number; dailyCap: number; monthlyCap: number };
  /** The envelopes with sealedAt <= t, newest first. */
  envelopes: EnvelopeState[];
  nextOpening: { series: string; at: number } | null;
  /** The Claude calls that run at t. */
  calls: TimedEvent[];
  /** The last work event at or before t. */
  lastWork: TimedEvent | null;
  /** No work in the last QUIET_AFTER_MS and no call runs. */
  quiet: boolean;
  pilot: LiveFile['pilot'];
  risk: LiveFile['risk'];
  money: LiveFile['money'];
  label: string;
}

function jobAt(upto: readonly TimedEvent[], job: JobName, t: number, asOf: number): JobState {
  const j = JOBS[job];
  let last: number | null = null;
  let counts: Record<string, number> | null = null;
  let lastError: number | null = null;
  for (let i = upto.length - 1; i >= 0 && (last == null || lastError == null); i--) {
    const e = upto[i];
    if (!e) continue;
    if (last != null && t - e.at > ERROR_SHOWS_MS) break;
    if (e.job !== job) continue;
    if (last == null && e.kind === 'cycle') {
      last = e.at;
      counts = e.counts ?? null;
    }
    if (lastError == null && e.kind === 'error') lastError = e.at;
  }
  // After the export time the files say nothing about the jobs. Judge them at the export.
  const at = Math.min(t, asOf);
  return {
    job,
    name: j.name,
    intervalS: j.intervalS,
    last,
    counts,
    stale: last != null && at - last > STALE_INTERVALS * j.intervalS * 1000,
    error: lastError != null && at - lastError <= ERROR_SHOWS_MS,
  };
}

/** The state at time t, from the events up to t and the contents at the export. */
export function stateAt(model: Model, t: number): State {
  const n = indexAfter(model.events, t);
  const upto = model.events.slice(0, n);

  let readsPerMin = 0;
  for (let i = upto.length - 1; i >= 0; i--) {
    const e = upto[i];
    if (!e || t - e.at > 120e3) break;
    if (e.actor === 'scanner' && e.kind === 'requests') {
      readsPerMin = e.n ?? 0;
      break;
    }
  }

  const day = dayOf(t);
  const dayFrom = indexAfter(model.events, dayStart(day) - 1);
  let today = 0;
  for (let i = dayFrom; i < n; i++) {
    const e = model.events[i];
    if (e?.kind === 'spend') today += e.cost_usd ?? 0;
  }

  // The contents at t: the contents at the export, less what came after t.
  const counts = new Map(model.envelopes.map((x) => [x.id, { ...x.final }]));
  for (let i = n; i < model.events.length; i++) {
    const e = model.events[i];
    if (!e || e.at > model.asOf) break;
    const c = e.envelope ? counts.get(e.envelope) : undefined;
    if (!c) continue;
    if (e.kind === 'forecast') c.forecasts -= 1;
    if (e.kind === 'order') c.orders -= 1;
    if (e.kind === 'fill') c.fills -= 1;
  }
  // Claude's forecasts exist when the call ends, so a call counts by its end time.
  for (const e of model.events) {
    if (e.kind !== 'call' || !e.envelope) continue;
    const end = e.end ?? e.at;
    const c = counts.get(e.envelope);
    if (c && end > t && end <= model.asOf) c.forecasts -= e.markets ?? 0;
  }
  const envelopes: EnvelopeState[] = model.envelopes
    .filter((x) => x.sealedAt <= t)
    .map((x) => {
      const c = counts.get(x.id) ?? x.final;
      return {
        ...x,
        open: t >= x.opensAt,
        opensIn: Math.max(0, x.opensAt - t),
        counts: {
          forecasts: Math.max(0, c.forecasts),
          orders: Math.max(0, c.orders),
          fills: Math.max(0, c.fills),
        },
      };
    })
    .reverse();

  const calls = upto.filter((e) => e.kind === 'call' && (e.end ?? e.at) > t);
  let lastWork: TimedEvent | null = null;
  for (let i = upto.length - 1; i >= 0; i--) {
    const e = upto[i];
    if (e && WORK_KINDS.has(e.kind)) {
      lastWork = e;
      break;
    }
  }
  return {
    t,
    jobs: {
      scanner: jobAt(upto, 'forecast-new', t, model.asOf),
      loop: jobAt(upto, 'trade-demo', t, model.asOf),
    },
    readsPerMin,
    spend: {
      today,
      month: model.money.spend_month_usd,
      dailyCap: model.money.daily_cap_usd,
      monthlyCap: model.money.monthly_cap_usd,
    },
    envelopes,
    nextOpening: nextOpening(model, t),
    calls,
    lastWork,
    quiet: !calls.length && (!lastWork || t - lastWork.at > QUIET_AFTER_MS),
    pilot: model.pilot,
    risk: model.risk,
    money: model.money,
    label: model.label,
  };
}

export interface RecentCounts {
  ticks: number;
  scans: number;
  reads: number;
  demoReads: number;
  reconciles: number;
  checks: number;
  briefs: number;
  calls: number;
  searches: number;
  forecasts: number;
  passes: number;
  orders: number;
  fills: number;
  errors: number;
  spend: number;
}

export interface RecentBin {
  t0: number;
  t1: number;
  /** The heartbeat events in the bin. */
  beat: number;
  marks: MarkKind[];
  /** The bin is fully before the first event or after the export time. */
  noData: boolean;
}

export interface RecentResult {
  t0: number;
  t: number;
  span: number;
  bins: number;
  counts: RecentCounts;
  bar: RecentBin[];
}

const sumValues = (r: Record<string, number> | undefined): number =>
  Object.values(r ?? {}).reduce((s, v) => s + v, 0);

/**
 * What happened in the span up to t (default: the last 24 hours), from the events only.
 * A Claude call counts its searches and forecasts only when it ended by t.
 */
export function recent(
  model: Model,
  t: number,
  { span = RECENT_MS, bins = 48 }: { span?: number; bins?: number } = {},
): RecentResult {
  const t0 = t - span;
  const w = span / bins;
  const counts: RecentCounts = {
    ticks: 0,
    scans: 0,
    reads: 0,
    demoReads: 0,
    reconciles: 0,
    checks: 0,
    briefs: 0,
    calls: 0,
    searches: 0,
    forecasts: 0,
    passes: 0,
    orders: 0,
    fills: 0,
    errors: 0,
    spend: 0,
  };
  const bar: RecentBin[] = Array.from({ length: bins }, (_, i) => {
    const a = t0 + i * w;
    const b = a + w;
    return { t0: a, t1: b, beat: 0, marks: [], noData: b <= model.start || a >= model.asOf };
  });
  for (const e of eventsBetween(model, t0, t)) {
    const done = (e.end ?? e.at) <= t;
    switch (`${e.actor}.${e.kind}`) {
      case 'loop.cycle':
        counts.ticks += 1;
        break;
      case 'scanner.cycle':
        counts.scans += 1;
        break;
      case 'scanner.requests':
        counts.reads += e.n ?? 0;
        break;
      case 'demo.requests':
        counts.demoReads += e.n ?? 0;
        break;
      case 'reconcile.reconcile':
        counts.reconciles += 1;
        break;
      case 'supervisor.stall_check':
        counts.checks += 1;
        break;
      case 'supervisor.error':
        counts.errors += 1;
        break;
      case 'brief.brief':
        counts.briefs += 1;
        break;
      case 'claude.call':
        counts.calls += 1;
        if (done) {
          counts.searches += e.searches ?? 0;
          counts.forecasts += e.markets ?? 0;
        }
        break;
      case 'strike_rate.forecast':
      case 'base_rate.forecast':
        counts.forecasts += 1;
        break;
      case 'policy.pass':
      case 'risk.pass':
        counts.passes += sumValues(e.reasons);
        break;
      case 'policy.order':
        counts.orders += 1;
        break;
      case 'shadow.fill':
        counts.fills += 1;
        break;
      case 'cost.spend':
        counts.spend += e.cost_usd ?? 0;
        break;
    }
    const slot = bar[Math.min(bins - 1, Math.floor((e.at - t0) / w))];
    if (!slot) continue;
    if (MARK_KINDS.has(e.kind)) {
      const k = e.kind as MarkKind;
      if (!slot.marks.includes(k)) slot.marks.push(k);
    } else if (!WORK_KINDS.has(e.kind)) slot.beat += 1;
  }
  return { t0, t, span, bins, counts, bar };
}

export interface Moment {
  at: number;
  kind: 'call' | 'fill' | 'unseal' | 'error' | 'gap';
  label: string;
  /** A fill: when the trade printed. Only after the envelope opens. */
  exAt?: number;
}

/**
 * Good moments for the replay buttons, from the events: each Claude call, each fill, the start
 * of each run of network errors, each unseal, and each long gap in the trading loop. In time
 * order.
 */
export function moments(model: Model): Moment[] {
  const out: Moment[] = [];
  const series = new Map(model.envelopes.map((x) => [x.id, x.series]));
  const seriesOf = (e: TimedEvent): string | undefined =>
    e.envelope ? series.get(e.envelope) : undefined;
  let lastError = -Infinity;
  for (const e of model.events) {
    if (e.kind === 'call') {
      out.push({ at: e.at, kind: 'call', label: `Claude call: ${seriesOf(e) ?? 'event'}` });
    }
    if (e.kind === 'fill') {
      const m: Moment = { at: e.at, kind: 'fill', label: 'Paper fill' };
      if (e.exAt != null) m.exAt = e.exAt;
      out.push(m);
    }
    if (e.kind === 'unseal') {
      out.push({ at: e.at, kind: 'unseal', label: `Unseal: ${seriesOf(e) ?? 'envelope'}` });
    }
    if (e.kind === 'error') {
      if (e.at - lastError > 30 * 60e3)
        out.push({ at: e.at, kind: 'error', label: 'Network errors' });
      lastError = e.at;
    }
  }
  const loops = model.events.filter((e) => e.actor === 'loop' && e.kind === 'cycle');
  for (let i = 1; i < loops.length; i++) {
    const a = loops[i - 1];
    const b = loops[i];
    if (!a || !b) continue;
    const gap = b.at - a.at;
    if (gap > 30 * 60e3) out.push({ at: a.at, kind: 'gap', label: `No ticks for ${fmtDur(gap)}` });
  }
  return out.sort((a, b) => a.at - b.at);
}

/** A YYYY-MM-DD day moved by `n` days. */
export const addDays = (day: string, n: number): string => dayOf(dayStart(day) + n * DAY_MS);
