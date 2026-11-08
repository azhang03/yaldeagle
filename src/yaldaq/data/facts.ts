// The facts of a visit badge: for one subject (a character, the vault, or the wall screen) at
// time t, the status, the key numbers, an activity bar of the last 24 hours, a log of its last
// events, and the details that only this subject has. No DOM.
//
// The sealed rule holds here too. Each number comes from the events (counts, times, spend,
// ladder sums), from an envelope that is open at t, or from the scores of settled markets.
// Forecasts of an envelope show only when t >= opensAt.
import type { Actor } from './contract';
import {
  JOBS,
  QUIET_AFTER_MS,
  REASONS,
  RECENT_MS,
  eventsBetween,
  indexAfter,
  stateAt,
  type EnvelopeState,
  type JobState,
  type Model,
  type State,
  type TimedEvent,
} from './model';
import { fmtClock } from './format';
import { boardAt, type Board } from './scores';
import { ROLE, eventText, jobStatus, mergeRuns, type JobTone } from './text';

/** The subjects of a visit, in the order of the market's path. */
export const SUBJECTS = [
  'scanner',
  'brief',
  'claude',
  'strike_rate',
  'base_rate',
  'ladder',
  'policy',
  'risk',
  'loop',
  'shadow',
  'demo',
  'reconcile',
  'cost',
  'supervisor',
  'vault',
  'board',
] as const;
export type Subject = (typeof SUBJECTS)[number];

/** The bars of the activity strip: 48 half hours. */
const BINS = 48;
/**
 * An actor "works now" for this long after its event. The events are single moments, and the
 * act in the room lasts a few seconds, so the badge says "Now" only that long.
 */
const NOW_MS = 10e3;
/** A pause of the trading loop longer than this is a gap. */
const LOOP_GAP_MS = 15 * 60e3;
/** A new run of network errors starts after this long with no error. */
const OUTAGE_SPLIT_MS = 30 * 60e3;
const NO_SCORES = 'No settled markets yet';

export type Tone = 'work' | 'ok' | 'quiet' | 'stale' | 'error' | 'idle';

export interface Stat {
  key: string;
  label: string;
  /** null: no data. */
  value: number | string | null;
  /** 'ms' is a time span. */
  unit?: 'ms' | 's' | 'usd';
  note?: string;
}

export interface Spark {
  t0: number;
  t: number;
  bins: { n: number; noData: boolean }[];
  max: number;
}

export interface LogLine {
  at: number;
  kind: TimedEvent['kind'];
  n: number;
  text: string;
}

export interface Gap {
  from: number;
  to: number;
}

export interface Outage {
  from: number;
  to: number;
  errors: number;
}

/** The parts that only some subjects have. */
export interface FactsDetail {
  series?: string[];
  lastCounts?: Record<string, number>;
  readsPerMin?: number;
  briefs?: {
    at: number;
    series: string | null;
    eventDay: string | null;
    markets: number;
    envelope: string | null;
    open: boolean;
  }[];
  running?: {
    at: number;
    end: number;
    markets: number;
    series: string | null;
    progress: number;
  } | null;
  calls?: {
    at: number;
    end: number;
    series: string | null;
    markets: number;
    done: boolean;
    searches: number | null;
    secs: number | null;
    cost: number | null;
    envelope: string | null;
  }[];
  /** The newest envelope that is open at t, with its reveal. */
  openEnvelope?: EnvelopeState | null;
  revealed?: {
    envelope: string;
    series: string;
    markets: { strike: string; p: number | null; claude: number | null }[];
  } | null;
  sealedEnvelopes?: { id: string; series: string; opensAt: number }[];
  repairs?: {
    at: number;
    series: string | null;
    shape: string | null;
    sumRaw: number | null;
    repairMax: number | null;
  }[];
  reasons?: { key: string; label: string; n: number }[];
  orders?: { at: number; series: string | null }[];
  gates?: { name: string; on: boolean }[];
  gaps?: Gap[];
  longestGap?: number;
  fills?: { at: number; exAt: number; lag: number; series: string | null }[];
  byKind?: Record<string, number>;
  checks?: { at: number; ok: boolean }[];
  today?: number;
  dailyCap?: number;
  month?: number;
  monthlyCap?: number;
  spends?: { at: number; cost: number }[];
  jobs?: { name: string; text: string; tone: JobTone }[];
  outages?: Outage[];
  envelopes?: EnvelopeState[];
  board?: Board | null;
}

export interface Facts {
  subject: Subject;
  name: string;
  status: { tone: Tone; text: string };
  /** 3 to 5 key numbers. */
  stats: Stat[];
  /** This subject's events, last 24 hours. */
  spark: Spark;
  /** Newest first. */
  log: LogLine[];
  detail: FactsDetail;
}

export type ActorIndex = Partial<Record<Actor, TimedEvent[]>>;

/** The actor whose events belong to a subject. The wall screen uses the vault's events. */
const actorOf = (subject: Subject): Actor => (subject === 'board' ? 'vault' : subject);

/** The events of each actor, in time order. The vault has the unseal events. */
export function indexByActor(model: Model): ActorIndex {
  const by: ActorIndex = {};
  for (const e of model.events) (by[e.actor] ??= []).push(e);
  return by;
}

const sum = <T>(xs: readonly T[], f: (x: T) => number): number => xs.reduce((s, x) => s + f(x), 0);

const stat = (
  key: string,
  label: string,
  value: Stat['value'],
  extra: Pick<Stat, 'unit' | 'note'> = {},
): Stat => ({ key, label, value, ...extra });

/** Events per half hour of the last 24 hours, and the bins with no data. */
function spark(model: Model, events: readonly TimedEvent[], t: number): Spark {
  const t0 = t - RECENT_MS;
  const w = RECENT_MS / BINS;
  const bins = Array.from({ length: BINS }, (_, i) => {
    const a = t0 + i * w;
    return { n: 0, noData: a + w <= model.start || a >= model.asOf };
  });
  for (const e of events) {
    if (e.at <= t0 || e.at > t) continue;
    const bin = bins[Math.min(BINS - 1, Math.floor((e.at - t0) / w))];
    if (bin) bin.n += 1;
  }
  return { t0, t, bins, max: Math.max(1, ...bins.map((b) => b.n)) };
}

/** The last events as plain lines, newest first, without the actor name. */
function logOf(model: Model, events: readonly TimedEvent[], t: number, size = 8): LogLine[] {
  const series = new Map(model.envelopes.map((x) => [x.id, x.series]));
  return mergeRuns(events.slice(-60))
    .slice(-size)
    .reverse()
    .map(({ ev, n }) => ({
      at: ev.at,
      kind: ev.kind,
      n,
      text: (
        eventText(ev, { n, t, series: ev.envelope ? series.get(ev.envelope) : null }) ?? ''
      ).replace(/^[^:]+:\s*/, ''),
    }))
    .filter((x) => x.text);
}

/** The status line of an actor from its last event: works now, or done and waiting. */
function activity(
  events: readonly TimedEvent[],
  t: number,
  workWord: string,
): { tone: Tone; text: string } {
  const last = events.at(-1);
  if (last && t - last.at <= NOW_MS) return { tone: 'work', text: workWord };
  if (!last) return { tone: 'idle', text: 'No events yet' };
  return {
    tone: t - last.at > QUIET_AFTER_MS ? 'quiet' : 'ok',
    text: `Done at ${fmtClock(last.at)} UTC, waiting for the next event`,
  };
}

/** The status of a loop job, in the words of jobStatus. */
function jobTone(job: JobState, t: number): { tone: Tone; text: string } {
  const s = jobStatus(job, t);
  return { tone: s.tone, text: s.text.charAt(0).toUpperCase() + s.text.slice(1) };
}

/**
 * Gaps longer than `min` between ticks of one job, in [t0, t]. The open gap from the last tick
 * to t counts too.
 */
function gaps(ticks: readonly TimedEvent[], t0: number, t: number, min: number): Gap[] {
  const out: Gap[] = [];
  for (let i = 1; i < ticks.length; i++) {
    const a = ticks[i - 1];
    const b = ticks[i];
    if (a && b && b.at > t0 && b.at - a.at > min) out.push({ from: a.at, to: b.at });
  }
  const last = ticks.at(-1);
  if (last && t - last.at > min) out.push({ from: last.at, to: t });
  return out;
}

/** Runs of network errors. */
function outages(errors: readonly TimedEvent[]): Outage[] {
  const out: Outage[] = [];
  for (const e of errors) {
    const last = out.at(-1);
    if (last && e.at - last.to <= OUTAGE_SPLIT_MS) {
      last.to = e.at;
      last.errors += 1;
    } else out.push({ from: e.at, to: e.at, errors: 1 });
  }
  return out;
}

/** The newest envelope that is open at t and has its reveal, or null. */
function latestOpen(state: State): EnvelopeState | null {
  let best: EnvelopeState | null = null;
  for (const e of state.envelopes) {
    if (e.open && e.reveal && (!best || e.opensAt > best.opensAt)) best = e;
  }
  return best;
}

/**
 * The facts of one subject at time t.
 * ctx.by: indexByActor(model) (pass it, so it is built once). ctx.state: stateAt(model, t).
 */
export function factsFor(
  subject: Subject,
  model: Model,
  t: number,
  ctx: { by?: ActorIndex; state?: State } = {},
): Facts {
  const by = ctx.by ?? indexByActor(model);
  const state = ctx.state ?? stateAt(model, t);
  const t24 = t - RECENT_MS;
  const all = by[actorOf(subject)] ?? [];
  const mine = all.slice(0, indexAfter(all, t));
  const day = mine.filter((e) => e.at > t24);
  const kind = (k: TimedEvent['kind']): TimedEvent[] => day.filter((e) => e.kind === k);
  const seriesOf = (id: string | null | undefined): string | null =>
    (id && model.envelopes.find((x) => x.id === id)?.series) || null;
  const out: Facts = {
    subject,
    name: subject === 'board' ? 'Wall screen' : ROLE[subject],
    status: activity(mine, t, 'Working'),
    stats: [],
    spark: spark(model, mine, t),
    log: logOf(model, mine, t),
    detail: {},
  };

  switch (subject) {
    case 'scanner': {
      const job = state.jobs.scanner;
      const c = job.counts ?? {};
      const due = job.last != null ? job.last + JOBS['forecast-new'].intervalS * 1000 - t : null;
      out.status = jobTone(job, t);
      out.stats = [
        stat('open', 'open markets', c.open ?? 0, { note: 'at the last cycle' }),
        stat('new', 'new at the last cycle', c.new ?? 0),
        stat('cycles', 'cycles, 24 h', kind('cycle').length),
        stat(
          'reads',
          'market reads, 24 h',
          sum(kind('requests'), (e) => e.n ?? 0),
        ),
        stat('due', 'next cycle due in', due != null && due > 0 ? due : null, { unit: 'ms' }),
      ];
      out.detail = { series: model.series, lastCounts: c, readsPerMin: state.readsPerMin };
      break;
    }
    case 'brief': {
      const briefs = mine.filter((e) => e.kind === 'brief');
      out.status = activity(mine, t, 'Building a brief');
      out.stats = [
        stat('briefs', 'briefs, 24 h', kind('brief').length),
        stat(
          'markets',
          'markets briefed, 24 h',
          sum(kind('brief'), (e) => e.markets ?? 0),
        ),
        stat('total', 'briefs in the loaded days', briefs.length),
      ];
      out.detail = {
        briefs: briefs
          .slice(-6)
          .reverse()
          .map((e) => ({
            at: e.at,
            series: e.series ?? null,
            eventDay: e.event_day ?? null,
            markets: e.markets ?? 0,
            envelope: e.envelope ?? null,
            open: !!state.envelopes.find((x) => x.id === e.envelope)?.open,
          })),
      };
      break;
    }
    case 'claude': {
      const endOf = (e: TimedEvent): number => e.end ?? e.at;
      const calls = mine.filter((e) => e.kind === 'call');
      const doneDay = calls.filter((e) => endOf(e) <= t && e.at > t24);
      const running = calls.find((e) => endOf(e) > t) ?? null;
      out.status = running
        ? { tone: 'work', text: `Working on ${running.markets ?? 0} markets` }
        : activity(mine, t, 'Working');
      out.stats = [
        stat('calls', 'calls, 24 h', kind('call').length),
        stat(
          'searches',
          'web searches, 24 h',
          sum(doneDay, (e) => e.searches ?? 0),
        ),
        stat(
          'secs',
          'mean call time',
          doneDay.length ? sum(doneDay, (e) => (endOf(e) - e.at) / 1000) / doneDay.length : null,
          { unit: 's' },
        ),
        stat(
          'spend',
          'spend, 24 h',
          sum(doneDay, (e) => e.cost_usd ?? 0),
          { unit: 'usd' },
        ),
      ];
      out.detail = {
        running: running
          ? {
              at: running.at,
              end: endOf(running),
              markets: running.markets ?? 0,
              series: seriesOf(running.envelope),
              progress: (t - running.at) / Math.max(1, endOf(running) - running.at),
            }
          : null,
        calls: calls
          .slice(-6)
          .reverse()
          .map((e) => {
            const fin = endOf(e) <= t;
            return {
              at: e.at,
              end: endOf(e),
              series: seriesOf(e.envelope),
              markets: e.markets ?? 0,
              done: fin,
              searches: fin ? (e.searches ?? 0) : null,
              secs: fin ? (endOf(e) - e.at) / 1000 : null,
              cost: fin ? (e.cost_usd ?? 0) : null,
              envelope: e.envelope ?? null,
            };
          }),
        // The notes of the newest open envelope. The reveal HTML shows them.
        openEnvelope: latestOpen(state),
      };
      break;
    }
    case 'strike_rate':
    case 'base_rate': {
      const board = boardAt(model.scores, t);
      const envs = new Set(kind('forecast').map((e) => e.envelope));
      out.status = activity(mine, t, 'Forecasting');
      out.stats = [
        stat('forecasts', 'sealed forecasts, 24 h', kind('forecast').length),
        stat('events', 'events forecast, 24 h', envs.size),
        stat('brier', 'Brier score', board?.brier[subject] ?? null, {
          note: board ? 'lower is better' : NO_SCORES,
        }),
      ];
      if (subject === 'strike_rate') {
        out.stats.push(
          stat(
            'duel',
            'markets closer than Claude',
            board ? board.duel.strike_rate : null,
            board ? {} : { note: NO_SCORES },
          ),
        );
      }
      const env = latestOpen(state);
      out.detail = {
        // Forecasts only from an envelope that is open at t.
        revealed:
          env && env.reveal
            ? {
                envelope: env.id,
                series: env.series,
                markets: env.reveal.markets.map((m) => ({
                  strike: m.strike,
                  p: m.forecasts[subject]?.p ?? null,
                  claude: m.forecasts.claude?.p ?? null,
                })),
              }
            : null,
        sealedEnvelopes: state.envelopes
          .filter((e) => !e.open)
          .map((e) => ({ id: e.id, series: e.series, opensAt: e.opensAt })),
      };
      break;
    }
    case 'ladder': {
      const reps = mine.filter((e) => e.kind === 'repair');
      const dayReps = kind('repair');
      out.status = activity(mine, t, 'Fixing the ladder');
      out.stats = [
        stat('repairs', 'events checked, 24 h', dayReps.length),
        stat('sum', 'last raw sum', reps.at(-1)?.sum_raw ?? null, {
          note: '1.00 is right for buckets',
        }),
        stat(
          'fix',
          'largest fix, 24 h',
          dayReps.length ? Math.max(...dayReps.map((e) => e.repair_max ?? 0)) : null,
        ),
      ];
      out.detail = {
        repairs: reps
          .slice(-6)
          .reverse()
          .map((e) => ({
            at: e.at,
            series: seriesOf(e.envelope),
            shape: e.shape ?? null,
            sumRaw: e.sum_raw ?? null,
            repairMax: e.repair_max ?? null,
          })),
      };
      break;
    }
    case 'policy': {
      const reasons: Record<string, number> = {};
      for (const e of kind('pass')) {
        for (const [k, v] of Object.entries(e.reasons ?? {})) reasons[k] = (reasons[k] ?? 0) + v;
      }
      const passed = sum(Object.values(reasons), (v) => v);
      const orders = kind('order').length;
      out.status = activity(mine, t, 'Pricing');
      out.stats = [
        stat('orders', 'orders placed, 24 h', orders, { note: 'side and price sealed' }),
        stat('passed', 'markets passed, 24 h', passed),
        // A fraction, not a percent: on these pages a percent means a forecast.
        stat(
          'rate',
          'markets with an order',
          orders + passed ? `${orders} of ${orders + passed}` : null,
        ),
      ];
      out.detail = {
        reasons: Object.entries(reasons)
          .map(([key, n]) => ({ key, label: REASONS[key] ?? key, n }))
          .sort((a, b) => b.n - a.n),
        orders: mine
          .filter((e) => e.kind === 'order')
          .slice(-6)
          .reverse()
          .map((e) => ({ at: e.at, series: seriesOf(e.envelope) })),
      };
      break;
    }
    case 'risk': {
      const r = model.risk;
      out.status = r.kill_switch
        ? { tone: 'error', text: 'Kill switch on' }
        : r.drawdown_flag
          ? { tone: 'stale', text: 'Drawdown flag up' }
          : { tone: 'ok', text: 'All gates open' };
      out.stats = [
        stat(
          'blocks',
          'orders blocked, 24 h',
          sum(kind('pass'), (e) => sum(Object.values(e.reasons ?? {}), (v) => v)),
        ),
        stat('kill', 'kill switch', r.kill_switch ? 'On' : 'Off', { note: 'at the export' }),
        stat('drawdown', 'drawdown flag ($50)', r.drawdown_flag ? 'Up' : 'Down', {
          note: 'at the export',
        }),
      ];
      out.detail = {
        gates: [
          { name: 'Kill switch', on: r.kill_switch },
          { name: 'Drawdown flag, $50', on: r.drawdown_flag },
        ],
      };
      break;
    }
    case 'loop': {
      const job = state.jobs.loop;
      const c = job.counts ?? {};
      const ticks = mine.filter((e) => e.kind === 'cycle');
      const gs = gaps(ticks, t24, t, LOOP_GAP_MS);
      const due = job.last != null ? job.last + JOBS['trade-demo'].intervalS * 1000 - t : null;
      out.status = jobTone(job, t);
      out.stats = [
        stat('ticks', 'ticks, 24 h', kind('cycle').length),
        stat('markets', 'open markets', c.open_markets ?? 0, { note: 'at the last tick' }),
        stat('orders', 'resting orders', c.open_orders ?? 0, { note: 'at the last tick' }),
        stat('due', 'next tick due in', due != null && due > 0 ? due : null, { unit: 'ms' }),
      ];
      out.detail = {
        lastCounts: c,
        gaps: gs,
        longestGap: gs.length ? Math.max(...gs.map((g) => g.to - g.from)) : 0,
      };
      break;
    }
    case 'shadow': {
      const lagOf = (e: TimedEvent): number => (e.at - (e.exAt ?? e.at)) / 1000;
      const lags = kind('fill').map(lagOf);
      out.status = activity(mine, t, 'Stamping a fill');
      out.stats = [
        stat('fills', 'paper fills, 24 h', kind('fill').length, { note: 'prices sealed' }),
        stat('watch', 'open markets watched', state.jobs.loop.counts?.open_markets ?? 0),
        stat(
          'lag',
          'mean time to see a fill',
          lags.length ? sum(lags, (x) => x) / lags.length : null,
          { unit: 's' },
        ),
      ];
      out.detail = {
        fills: mine
          .filter((e) => e.kind === 'fill')
          .slice(-6)
          .reverse()
          .map((e) => ({
            at: e.at,
            exAt: e.exAt ?? e.at,
            lag: lagOf(e),
            series: seriesOf(e.envelope),
          })),
      };
      break;
    }
    case 'demo': {
      const reads = kind('requests');
      const byKind: Record<string, number> = {};
      for (const e of reads) {
        for (const [k, v] of Object.entries(e.by_kind ?? {})) byKind[k] = (byKind[k] ?? 0) + v;
      }
      out.status = activity(mine, t, 'Reading the demo account');
      out.stats = [
        stat(
          'reads',
          'demo reads, 24 h',
          sum(reads, (e) => e.n ?? 0),
        ),
        stat(
          'errors',
          'read errors, 24 h',
          sum(reads, (e) => e.errors ?? 0),
        ),
        stat('batches', 'read batches, 24 h', reads.length),
      ];
      out.detail = { byKind };
      break;
    }
    case 'reconcile': {
      const checks = kind('reconcile');
      const last = mine.filter((e) => e.kind === 'reconcile').at(-1);
      out.status =
        last && !last.ok
          ? { tone: 'error', text: 'The last check did not agree' }
          : activity(mine, t, 'Checking the books');
      out.stats = [
        stat('checks', 'checks, 24 h', checks.length),
        stat('agree', 'agreed', checks.filter((e) => e.ok).length),
        stat('differ', 'did not agree', checks.filter((e) => !e.ok).length),
      ];
      out.detail = { checks: checks.slice(-24).map((e) => ({ at: e.at, ok: !!e.ok })) };
      break;
    }
    case 'cost': {
      const s = state.spend;
      out.status =
        s.today >= s.dailyCap
          ? { tone: 'error', text: 'Daily cap reached' }
          : activity(mine, t, 'Counting spend');
      out.stats = [
        stat('today', 'spend today (UTC)', s.today, { unit: 'usd', note: `cap $${s.dailyCap}` }),
        stat('month', 'spend this month', s.month, {
          unit: 'usd',
          note: 'as of the last export',
        }),
        stat('calls', 'paid calls, 24 h', kind('spend').length),
      ];
      out.detail = {
        today: s.today,
        dailyCap: s.dailyCap,
        month: s.month,
        monthlyCap: s.monthlyCap,
        spends: mine
          .filter((e) => e.kind === 'spend')
          .slice(-8)
          .reverse()
          .map((e) => ({ at: e.at, cost: e.cost_usd ?? 0 })),
      };
      break;
    }
    case 'supervisor': {
      const jobs = [state.jobs.scanner, state.jobs.loop].map((j) => ({
        name: j.name,
        ...jobStatus(j, t),
      }));
      const worst = jobs.find((j) => j.tone === 'error') ?? jobs.find((j) => j.tone === 'stale');
      out.status = worst
        ? { tone: worst.tone, text: `${worst.name}: ${worst.text}` }
        : { tone: 'ok', text: 'All jobs run' };
      out.stats = [
        stat('checks', 'stall checks, 24 h', kind('stall_check').length),
        stat('errors', 'network errors, 24 h', kind('error').length),
        stat('outages', 'error runs, 24 h', outages(kind('error')).length),
      ];
      out.detail = { jobs, outages: outages(kind('error')).reverse() };
      break;
    }
    case 'vault': {
      const sealed = state.envelopes.filter((e) => !e.open);
      let next: EnvelopeState | null = null;
      for (const e of sealed) if (!next || e.opensIn < next.opensIn) next = e;
      out.status = next
        ? { tone: 'ok', text: `${sealed.length} sealed` }
        : { tone: 'idle', text: 'Nothing sealed' };
      out.stats = [
        stat('sealed', 'sealed envelopes', sealed.length),
        stat('opened', 'opened', state.envelopes.length - sealed.length),
        stat('next', 'next opens in', next ? next.opensIn : null, { unit: 'ms' }),
      ];
      out.detail = { envelopes: state.envelopes, openEnvelope: latestOpen(state) };
      break;
    }
    case 'board': {
      const b = boardAt(model.scores, t);
      const none = { note: NO_SCORES };
      out.status = b
        ? { tone: 'ok', text: `${b.markets} settled markets` }
        : { tone: 'idle', text: NO_SCORES };
      out.stats = [
        stat('claude', 'Claude, Brier', b?.brier.claude ?? null, b ? {} : none),
        stat('strike_rate', 'Actuary, Brier', b?.brier.strike_rate ?? null, b ? {} : none),
        stat('markets', 'settled markets', b?.markets ?? 0),
      ];
      out.detail = { board: b };
      out.log = out.log.filter((x) => x.kind === 'unseal');
      break;
    }
  }
  return out;
}

/** The facts of every subject at t, built with one index. For the gallery page. */
export function allFacts(model: Model, t: number): Record<Subject, Facts> {
  const by = indexByActor(model);
  const state = stateAt(model, t);
  const out = {} as Record<Subject, Facts>;
  for (const s of SUBJECTS) out[s] = factsFor(s, model, t, { by, state });
  return out;
}

/** The events of one frame for a subject, so a badge can glow when its subject acts. */
export function subjectEvents(
  model: Model,
  subject: Subject,
  t0: number,
  t1: number,
): TimedEvent[] {
  const actor = actorOf(subject);
  return eventsBetween(model, t0, t1).filter((e) => e.actor === actor);
}
