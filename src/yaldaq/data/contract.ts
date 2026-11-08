// The public files of the YALDAQ feed, schema 2. YALDAQ's exporter writes them and uploads them
// to the store. The page only reads them. This file is the contract between the two.
//
// Files under the store root: live.json, scores.json, days/<YYYY-MM-DD>.json,
// reveals/<envelope>.json. A file that is not there yet answers 204 with no body.
//
// Public rules: no file holds Kalshi data. live.json and the day files hold no sealed number
// (no forecast, price, side, size, notes, query, or strike). Those come only in the reveal file
// of an envelope, which the exporter writes at opened_at.

export const SCHEMA = 2;

export const ACTORS = [
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
] as const;
export type Actor = (typeof ACTORS)[number];

export const FORECASTERS = ['claude', 'strike_rate', 'base_rate'] as const;
export type Forecaster = (typeof FORECASTERS)[number];

export type JobName = 'forecast-new' | 'trade-demo';

export type EventKind =
  | 'cycle'
  | 'requests'
  | 'skip'
  | 'brief'
  | 'forecast'
  | 'forecast_failed'
  | 'call'
  | 'repair'
  | 'spend'
  | 'pass'
  | 'order'
  | 'fill'
  | 'settle'
  | 'reconcile'
  | 'error'
  | 'stall_check'
  | 'unseal';

/** One event. `t` is ISO UTC ("2026-11-07T05:09:09Z"). Optional fields depend on actor and kind, as in the trials' sample. */
export interface FeedEvent {
  t: string;
  actor: Actor;
  kind: EventKind;
  envelope?: string | null; // "env-" + 8 hex
  t_end?: string; // claude.call
  t_exchange?: string; // shadow.fill: when the trade printed
  job?: JobName; // cycle, error, stall_check
  counts?: Record<string, number>; // scanner.cycle, loop.cycle
  env?: 'prod' | 'demo'; // requests
  n?: number; // requests
  by_kind?: Record<string, number>; // requests
  errors?: number; // requests
  reason?: string; // skip
  markets?: number; // skip, brief, call
  series?: string; // brief
  event_day?: string | null; // brief
  searches?: number; // call: a count, never a list
  cost_usd?: number; // call, spend
  shape?: string; // ladder.repair
  sum_raw?: number | null; // ladder.repair
  repair_max?: number | null; // ladder.repair
  ok?: boolean; // spend, reconcile
  stage?: string; // pass
  reasons?: Record<string, number>; // pass
  venue?: string; // order, fill
  realized_usd?: number; // settle
  error?: string; // error
}

export interface Job {
  job: JobName;
  state: string;
  interval_s: number;
  started_at: string;
  last_cycle_at: string;
  cycles: number;
  has_error: boolean;
  stale: boolean;
}

export interface SealedEnvelope {
  envelope: string;
  series: string;
  event_day: string | null;
  markets: number;
  sealed_at: string;
  opens_at: string;
  contents: { forecasts: number; orders: number; fills: number };
}

export interface OpenedEnvelope {
  envelope: string;
  series: string;
  event_day: string | null;
  markets: number;
  sealed_at: string;
  opened_at: string;
  contents: { forecasts: number; orders: number; fills: number };
  settled: number;
}

export interface LiveFile {
  schema: 2;
  label: string;
  exported_at: string;
  as_of: string;
  pilot: {
    started: string | null;
    day: number | null;
    days_planned: number;
    day_28_read: string | null;
  };
  jobs: Job[];
  risk: { kill_switch: boolean; drawdown_flag: boolean };
  money: {
    start_nav_usd: number;
    realized_usd: number;
    open_at_cost_usd: number | null;
    spend_today_usd: number;
    daily_cap_usd: number;
    spend_month_usd: number;
    monthly_cap_usd: number;
  };
  series: string[];
  next_openings: { series: string; at: string }[];
  sealed: SealedEnvelope[];
  opened: OpenedEnvelope[];
  days: string[]; // every date that has a day file, ascending
  events: FeedEvent[]; // the events with t >= as_of - 30 min
}

export interface DayFile {
  schema: 2;
  date: string;
  complete: boolean;
  events: FeedEvent[];
}

export interface RevealMarket {
  strike: string;
  forecasts: Partial<Record<Forecaster, { p: number; p_raw?: number | null }>>;
  order: { side: 'yes' | 'no'; price: number; contracts: number; venue: string } | null;
  pass: string[];
  fills: { t: string; contracts: number; price: number }[];
  result: 'yes' | 'no' | null;
}

export interface RevealFile {
  schema: 2;
  envelope: string;
  series: string;
  event_day: string | null;
  opened_at: string;
  markets: RevealMarket[];
  claude: {
    rationale: string;
    searches: { query: string; results: number }[];
    latency_ms: number;
    sum_raw: number | null;
    repair_max: number | null;
    saw_price: boolean;
  } | null;
}

export interface ScoreTotals {
  markets: number;
  brier: Record<Forecaster, number | null>;
  duel: { claude: number; strike_rate: number; tie: number };
  realized_usd: number;
}

/** One event whose markets all settled. `total` is the running total up to and with this event. */
export interface ScoreEntry {
  envelope: string;
  series: string;
  event_day: string | null;
  settled_at: string;
  markets: number;
  brier: Record<Forecaster, number | null>;
  total: ScoreTotals;
}

/** `history` is sorted by settled_at. It is [] until a market settles. */
export interface ScoresFile {
  schema: 2;
  as_of: string;
  history: ScoreEntry[];
}
