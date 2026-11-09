// Plain text for the events, the jobs, and the pilot. The lines hold no sealed numbers.
// The text is safe to put into HTML: esc() escapes the text that comes from the feed.
// No DOM.
import type { Actor } from './contract';
import { fmtClock, fmtDur, fmtUSD } from './format';
import { REASONS, type JobState, type State, type TimedEvent } from './model';

/** Escapes text for HTML. */
export const esc = (s: unknown): string =>
  String(s).replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c,
  );

/** Short names of the actors for the activity lines. Pages may pass their own names. */
export const ROLE: Readonly<Record<Actor, string>> = {
  scanner: 'Scanner',
  brief: 'Brief',
  claude: 'Claude',
  strike_rate: 'Actuary',
  base_rate: 'Grandpa',
  ladder: 'Ladder',
  policy: 'Policy',
  risk: 'Risk',
  loop: 'Trading loop',
  shadow: 'Shadow',
  demo: 'Demo twin',
  reconcile: 'Reconcile',
  cost: 'Cost',
  supervisor: 'Supervisor',
  vault: 'Vault',
};

const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

const jobWord = (ev: TimedEvent): string => (ev.job === 'trade-demo' ? 'trading loop' : 'scanner');

export interface EventTextOptions {
  /** A run of `n` same events (for example 8 forecasts at once). */
  n?: number;
  /** The series of the event's envelope. */
  series?: string | null;
  names?: Readonly<Partial<Record<Actor, string>>>;
  /** The time the line shows. */
  t?: number;
}

/**
 * One plain line for an event, with no sealed numbers. A Claude call that still runs at t says
 * only that it works; its searches, length, and cost show from its end. With no t, the line is
 * for the event time. Returns null for events that need no line.
 */
export function eventText(ev: TimedEvent, opts: EventTextOptions = {}): string | null {
  const { n = 1, series = null, names = ROLE, t = ev.at } = opts;
  const who = names[ev.actor] ?? ev.actor;
  const c = ev.counts ?? {};
  switch (`${ev.actor}.${ev.kind}`) {
    case 'scanner.cycle':
      return `${who}: ${c.open ?? 0} open markets, ${c.new ?? 0} new${c.skipped_late ? `, ${c.skipped_late} skipped as late` : ''}`;
    case 'scanner.requests':
      return `${who}: ${plural(ev.n ?? 0, 'read')} of the market list${ev.errors ? `, ${plural(ev.errors, 'error')}` : ''}`;
    case 'scanner.skip':
      return `${who}: skipped ${plural(ev.markets ?? 0, 'market')} (${esc(ev.reason ?? '')})`;
    case 'brief.brief':
      return `${who}: a new event, ${esc(ev.series ?? '')} (${plural(ev.markets ?? 0, 'market')})`;
    case 'strike_rate.forecast':
    case 'base_rate.forecast':
      return `${who}: ${plural(n, 'forecast')}, sealed`;
    case 'claude.call': {
      const end = ev.end ?? ev.at;
      if (t < end) return `${who}: working on ${plural(ev.markets ?? 0, 'market')}`;
      return `${who}: ${plural(ev.markets ?? 0, 'market')}, ${plural(ev.searches ?? 0, 'web search', 'web searches')}, ${((end - ev.at) / 1000).toFixed(0)} s, ${fmtUSD(ev.cost_usd ?? 0)}. Forecasts sealed.`;
    }
    case 'ladder.repair':
      return `${who}: the buckets add up to ${ev.sum_raw?.toFixed(2) ?? '?'}, largest fix ${ev.repair_max?.toFixed(2) ?? 'sealed'}`;
    case 'policy.order':
      return `${who}: ${plural(n, 'order')} placed, sealed`;
    case 'policy.pass':
    case 'risk.pass':
      return `${who}: passed on ${Object.entries(ev.reasons ?? {})
        .map(([k, v]) => `${v} (${esc(REASONS[k] ?? k).toLowerCase()})`)
        .join(', ')}`;
    case 'loop.cycle': {
      const watch = [
        c.open_markets ? plural(c.open_markets, 'open market') : '',
        c.open_orders ? plural(c.open_orders, 'resting order') : '',
      ].filter(Boolean);
      return `${who}: tick. ${watch.length ? `Watching ${watch.join(' and ')}` : 'Nothing open'}`;
    }
    case 'shadow.fill':
      // The print time comes only after the envelope opens.
      return `${who}: a paper fill, sealed.${ev.exAt != null ? ` The trade printed at ${fmtClock(ev.exAt)}.` : ''}`;
    case 'shadow.settle':
      return `${who}: a market settled`;
    case 'demo.requests':
      return `${who}: ${plural(ev.n ?? 0, 'demo read')}${ev.errors ? `, ${plural(ev.errors, 'error')}` : ''}`;
    case 'reconcile.reconcile':
      return `${who}: ${ev.ok ? 'the books agree' : 'the books do not agree'}`;
    case 'cost.spend':
      return `${who}: ${fmtUSD(ev.cost_usd ?? 0)} of Claude spend`;
    case 'supervisor.error':
      return `${who}: ${plural(n, 'network error')} in the ${jobWord(ev)}`;
    case 'supervisor.stall_check':
      return `${who}: checked the ${jobWord(ev)}`;
    case 'vault.unseal':
      return `${who}: opened the ${esc(series ?? 'event')} envelope`;
    default:
      return null;
  }
}

/** Merges runs of the same actor, kind, and envelope within 60 s. */
export function mergeRuns(events: readonly TimedEvent[]): { ev: TimedEvent; n: number }[] {
  const out: { ev: TimedEvent; n: number }[] = [];
  for (const ev of events) {
    const last = out.at(-1);
    if (
      last &&
      last.ev.actor === ev.actor &&
      last.ev.kind === ev.kind &&
      last.ev.envelope === ev.envelope &&
      ev.at - last.ev.at <= 60e3
    ) {
      last.n += 1;
    } else out.push({ ev, n: 1 });
  }
  return out;
}

export type JobTone = 'idle' | 'error' | 'stale' | 'ok';

/** One job line: the time since its last cycle and a state word. */
export function jobStatus(job: JobState, t: number): { text: string; tone: JobTone } {
  if (job.last == null) return { text: 'not started', tone: 'idle' };
  const ago = `${fmtDur(t - job.last)} ago`;
  if (job.error) return { text: `network error, last cycle ${ago}`, tone: 'error' };
  if (job.stale) return { text: `stale, last cycle ${ago}`, tone: 'stale' };
  return { text: `last cycle ${ago}`, tone: 'ok' };
}

/** The pilot line: "Pilot day 3 of 42", or the run that the feed names. */
export function pilotText(state: Pick<State, 'pilot' | 'label'>): string {
  const p = state.pilot;
  if (!p.started) return `Pilot not started. This is the ${esc(state.label)}.`;
  return `Pilot day ${p.day ?? '?'} of ${p.days_planned}`;
}
