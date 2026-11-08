// HTML text for the panels: the envelopes, the reveal, the scores, the next opening, the spend,
// and the "last 24 hours" strip. Strings only, no DOM.
//
// The sealed rule lives here: revealHTML() shows the numbers only when the envelope is open at t.
import { FORECASTERS, type Forecaster, type RevealMarket } from '../data/contract';
import { fmtClock, fmtCountdown, fmtDay, fmtP, fmtUSD, fmtWhen } from '../data/format';
import {
  REASONS,
  type Envelope,
  type EnvelopeState,
  type MarkKind,
  type RecentResult,
  type State,
} from '../data/model';
import type { Board } from '../data/scores';
import { esc } from '../data/text';

/** The colors of the marks on the activity bar. */
const MARK_COLOR: Record<MarkKind, string> = {
  brief: '#8e5bb5',
  call: '#d97757',
  order: '#c2548a',
  fill: '#2f8f8a',
  error: '#d0352f',
  unseal: '#b3261e',
};
const MARK_WORD: Record<MarkKind, string> = {
  brief: 'new event',
  call: 'Claude call',
  order: 'order',
  fill: 'fill',
  error: 'network error',
  unseal: 'unseal',
};

/** The forecasters in the panels. The colors match the cast. */
export const WHO: Readonly<Record<Forecaster, { name: string; note: string; color: string }>> = {
  claude: { name: 'Claude', note: 'with web search', color: '#d97757' },
  strike_rate: { name: 'Actuary', note: 'strike rate, the control', color: '#3f74c9' },
  base_rate: { name: 'Grandpa', note: 'base rate, the second control', color: '#8a939b' },
};

const eventDayText = (day: string | null): string =>
  day ? `Event day ${fmtDay(Date.parse(day))}` : 'No event day';

/** One envelope: the series, the counts inside, and the countdown. No numbers. */
export function envelopeHTML(env: EnvelopeState, opts: { compact?: boolean } = {}): string {
  const compact = opts.compact ?? false;
  const c = env.counts;
  const inside = `${c.forecasts} forecasts, ${c.orders} ${c.orders === 1 ? 'order' : 'orders'}, ${c.fills} ${c.fills === 1 ? 'fill' : 'fills'}`;
  const id = esc(env.id);
  if (env.open) {
    return `<div class="yq-env yq-open" data-envelope="${id}">
      <div class="yq-env-head"><span class="yq-env-flap"></span><b>${esc(env.series)}</b></div>
      <div class="yq-env-sub">${eventDayText(env.eventDay)}, ${env.markets} markets</div>
      <div class="yq-env-time">Opened ${fmtClock(env.opensAt)} UTC</div>
      ${compact ? '' : `<div class="yq-env-in">${inside}</div>`}
    </div>`;
  }
  return `<div class="yq-env yq-sealed" data-envelope="${id}">
    <div class="yq-env-head"><span class="yq-seal"></span><b>${esc(env.series)}</b></div>
    <div class="yq-env-sub">${eventDayText(env.eventDay)}, ${env.markets} markets</div>
    <div class="yq-env-time">Opens in <b class="yq-count">${fmtCountdown(env.opensIn)}</b> <span class="yq-muted">(${fmtClock(env.opensAt)} UTC)</span></div>
    ${compact ? '' : `<div class="yq-env-in">Sealed inside: ${inside}</div>`}
  </div>`;
}

/** The order of the strike labels: "below X" first, "above X" and "X or more" last, the rest by number. */
function strikeKey(s: string): [number, number] {
  const n = parseFloat(s.match(/-?\d+(\.\d+)?/)?.[0] ?? '0');
  if (/^below|under|less/i.test(s)) return [0, n];
  if (/^above|more$|or more|over/i.test(s)) return [2, n];
  return [1, n];
}

export function sortStrikes<M extends { strike: string }>(markets: readonly M[]): M[] {
  return markets.slice().sort((a, b) => {
    const [ga, na] = strikeKey(a.strike);
    const [gb, nb] = strikeKey(b.strike);
    return ga - gb || na - nb;
  });
}

function bars(p: Record<Forecaster, number | null>, scale: number): string {
  return FORECASTERS.map((f) => {
    const v = p[f];
    const w = v == null ? 0 : Math.max(1.5, (v / scale) * 100);
    return `<div class="yq-bar"><span class="yq-bar-fill" style="width:${w.toFixed(1)}%;background:${WHO[f].color}"></span><span class="yq-bar-v">${v == null ? '-' : fmtP(v)}</span></div>`;
  }).join('');
}

function marketHTML(m: RevealMarket, scale: number): string {
  const p = Object.fromEntries(FORECASTERS.map((f) => [f, m.forecasts[f]?.p ?? null])) as Record<
    Forecaster,
    number | null
  >;
  const raw = m.forecasts.claude?.p_raw;
  const fixed =
    raw != null && p.claude != null && Math.abs(raw - p.claude) > 1e-6
      ? `<div class="yq-note">Claude's raw number was ${fmtP(raw)}; the ladder fixed it.</div>`
      : '';
  let action = '';
  if (m.order) {
    const filled = m.fills.reduce((s, f) => s + f.contracts, 0);
    const times = m.fills.length
      ? ` (${m.fills.map((f) => fmtClock(Date.parse(f.t))).join(', ')})`
      : '';
    action = `<div class="yq-order">Order: <b>${esc(m.order.side.toUpperCase())}</b> at ${Math.round(m.order.price * 100)}¢, ${m.order.contracts} contracts. Filled ${filled} in ${m.fills.length} ${m.fills.length === 1 ? 'fill' : 'fills'}${times}.</div>`;
  } else if (m.pass.length) {
    action = `<div class="yq-pass">Pass: ${m.pass.map((x) => esc(REASONS[x] ?? x)).join(', ')}</div>`;
  }
  const result =
    m.result == null
      ? '<span class="yq-muted">not settled</span>'
      : `<b>${esc(m.result.toUpperCase())}</b>`;
  return `<div class="yq-mkt"><div class="yq-mkt-head"><b>${esc(m.strike)}</b><span>${result}</span></div>${bars(p, scale)}${fixed}${action}</div>`;
}

/**
 * The full reveal of one envelope: the three forecasts for each market, the order and its
 * fills, the pass reasons, and Claude's rationale and searches. Sealed at t: no numbers.
 */
export function revealHTML(env: Envelope | null, t: number): string {
  if (!env || !env.reveal || t < env.opensAt) {
    return `<div class="yq-reveal yq-reveal-sealed"><span class="yq-seal yq-seal-big"></span>
      <p><b>Sealed.</b> The forecasts, the orders, and Claude's notes stay in the envelope until the markets close${env ? ` (${fmtWhen(env.opensAt)})` : ''}.</p></div>`;
  }
  const r = env.reveal;
  const markets = sortStrikes(r.markets);
  const scale = Math.max(
    0.05,
    ...markets.flatMap((m) => FORECASTERS.map((f) => m.forecasts[f]?.p ?? 0)),
  );
  const head = `<div class="yq-legend">${FORECASTERS.map((f) => `<span><i style="background:${WHO[f].color}"></i>${WHO[f].name}</span>`).join('')}</div>`;
  const rows = markets.map((m) => marketHTML(m, scale)).join('');
  const c = r.claude;
  let notes = '<div class="yq-muted">No Claude call for this event.</div>';
  if (c) {
    const rationale = c.rationale
      .split(/\n\n+/)
      .map((x) => `<p>${esc(x)}</p>`)
      .join('');
    const searches = c.searches
      .map((s) => `<li>"${esc(s.query)}" <span class="yq-muted">${s.results} results</span></li>`)
      .join('');
    const sum = c.sum_raw != null ? ` Raw sum ${c.sum_raw.toFixed(2)}.` : '';
    const fix = c.repair_max != null ? ` Largest ladder fix ${c.repair_max.toFixed(2)}.` : '';
    notes = `${rationale}
      ${searches ? `<h4>Web searches</h4><ul>${searches}</ul>` : ''}
      <div class="yq-muted">Call time ${(c.latency_ms / 1000).toFixed(1)} s.${sum}${fix} ${c.saw_price ? '' : 'Claude saw no market price.'}</div>`;
  }
  return `<div class="yq-reveal">
    <div class="yq-reveal-head"><b>${esc(env.series)}</b>
      <div class="yq-muted">${eventDayText(env.eventDay)}. Sealed ${fmtWhen(env.sealedAt)}. Opened ${fmtWhen(env.opensAt)}.</div></div>
    ${head}
    <div class="yq-mkts">${rows}</div>
    <div class="yq-claude">
      <h4>Claude's notes</h4>
      ${notes}
    </div>
  </div>`;
}

/** A small line chart of the running mean Brier score of Claude and the Actuary. */
function historySVG(history: Board['history'], w = 260, h = 70): string {
  const pts = history.filter(
    (x) => x.total.brier.claude != null && x.total.brier.strike_rate != null,
  );
  if (pts.length < 2) return '';
  const vals = pts.flatMap((x) => [x.total.brier.claude ?? 0, x.total.brier.strike_rate ?? 0]);
  const lo = Math.min(...vals) * 0.9;
  const hi = Math.max(...vals) * 1.1 || 1;
  const X = (i: number): number => 4 + (i / (pts.length - 1)) * (w - 8);
  const Y = (v: number): number => 4 + (1 - (v - lo) / (hi - lo || 1)) * (h - 8);
  const line = (f: 'claude' | 'strike_rate'): string =>
    pts
      .map((x, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(x.total.brier[f] ?? 0).toFixed(1)}`)
      .join('');
  const dots = pts
    .map(
      (x, i) =>
        `<circle cx="${X(i).toFixed(1)}" cy="${Y(x.total.brier.claude ?? 0).toFixed(1)}" r="3" fill="${WHO.claude.color}"/>`,
    )
    .join('');
  return `<svg class="yq-hist" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-label="Running mean Brier score">
    <path d="${line('strike_rate')}" fill="none" stroke="${WHO.strike_rate.color}" stroke-width="2"/>
    <path d="${line('claude')}" fill="none" stroke="${WHO.claude.color}" stroke-width="2"/>${dots}</svg>`;
}

/**
 * The scores: Claude against the Actuary on settled markets. Grandpa is smaller.
 * compact: only the headline numbers.
 */
export function boardHTML(board: Board | null, opts: { compact?: boolean } = {}): string {
  const compact = opts.compact ?? false;
  if (!board) {
    return `<div class="yq-score">
    <div class="yq-score-head"><b>Claude vs the Actuary</b></div>
    <div class="yq-muted">No settled markets yet. The scores start when the first market settles.</div>
  </div>`;
  }
  const b = board.brier;
  const max = Math.max(b.claude ?? 0, b.strike_rate ?? 0, b.base_rate ?? 0) * 1.15 || 1;
  const row = (
    f: Forecaster,
  ): string => `<div class="yq-score-row${f === 'base_rate' ? ' yq-small' : ''}">
    <span class="yq-score-name" style="color:${WHO[f].color}">${WHO[f].name}</span>
    <span class="yq-score-bar"><span style="width:${(((b[f] ?? 0) / max) * 100).toFixed(1)}%;background:${WHO[f].color}"></span></span>
    <b>${b[f] == null ? '--' : b[f].toFixed(3)}</b></div>`;
  let lead = '';
  if (b.claude != null && b.strike_rate != null && b.claude !== b.strike_rate) {
    lead = ` ${b.claude < b.strike_rate ? 'Claude' : 'Actuary'} leads.`;
  }
  const l = board.latest;
  const latest = `<div class="yq-latest">Just added: <b>${esc(l.series)}</b>, ${l.markets} markets.</div>`;
  const d = board.duel;
  const pnl = board.realizedUsd;
  return `<div class="yq-score">
    <div class="yq-score-head"><b>Claude vs the Actuary</b></div>
    ${row('claude')}${row('strike_rate')}${compact ? '' : row('base_rate')}
    <div class="yq-muted">Brier score on ${board.markets} settled markets. Lower is better.${lead}</div>
    ${compact ? '' : `<div class="yq-duel">Closer to the result: Claude on <b>${d.claude}</b>, Actuary on <b>${d.strike_rate}</b>${d.tie ? `, ${d.tie} ties` : ''}.</div>`}
    ${compact ? '' : historySVG(board.history)}
    ${latest}
    ${compact ? '' : `<div class="yq-muted">Paper P&amp;L of settled markets: ${pnl < 0 ? '-' : ''}${fmtUSD(Math.abs(pnl))}. Paper money only.</div>`}
  </div>`;
}

/** The next opening and its countdown. In quiet hours, it says so. */
export function openingHTML(state: State): string {
  const o = state.nextOpening;
  if (!o) return '';
  const quiet = state.quiet ? '<span class="yq-tag yq-quiet">Quiet</span> ' : '';
  return `<div class="yq-opening">${quiet}Next opening: <b>${esc(o.series)}</b> in <b class="yq-count">${fmtCountdown(o.at - state.t)}</b> <span class="yq-muted">(${fmtClock(o.at)} UTC)</span></div>`;
}

/** Claude spend against the daily and monthly caps. */
export function spendHTML(state: State): string {
  const s = state.spend;
  const pct = s.dailyCap > 0 ? Math.min(100, (s.today / s.dailyCap) * 100) : 0;
  return `<div class="yq-spend">
    <div>Claude spend today <b>${fmtUSD(s.today)}</b> of ${fmtUSD(s.dailyCap)}</div>
    <div class="yq-spend-bar"><span style="width:${Math.max(pct, s.today > 0 ? 1 : 0).toFixed(2)}%"></span></div>
    <div class="yq-muted">This month ${fmtUSD(s.month)} of ${fmtUSD(s.monthlyCap)}</div>
  </div>`;
}

const num = (n: number): string => n.toLocaleString('en-US');
const chip = (n: number, one: string, many = `${one}s`): string =>
  `<span class="yq-chip"><b>${num(n)}</b> ${n === 1 ? one : many}</span>`;

/**
 * The "last 24 hours" strip: what the system did, from recent(). The heartbeat (ticks, scans,
 * reads) and the work (calls, forecasts, orders, fills) as counts, and a bar of the hours.
 * compact: fewer counts and a lower bar. row: the counts and the bar side by side.
 */
export function recentHTML(
  r: RecentResult,
  opts: { compact?: boolean; row?: boolean } = {},
): string {
  const compact = opts.compact ?? false;
  const row = opts.row ?? false;
  const c = r.counts;
  const beat = [
    chip(c.ticks, 'loop tick'),
    chip(c.scans, 'market scan'),
    compact ? '' : chip(c.reads, 'read'),
  ].join('');
  const work = [
    chip(c.calls, 'Claude call'),
    compact ? '' : chip(c.forecasts, 'sealed forecast'),
    chip(c.orders, 'order'),
    chip(c.fills, 'fill'),
    c.errors
      ? `<span class="yq-chip yq-chip-err"><b>${num(c.errors)}</b> network ${c.errors === 1 ? 'error' : 'errors'}</span>`
      : '',
  ].join('');
  const max = Math.max(1, ...r.bar.map((b) => b.beat));
  const cols = r.bar
    .map((b) => {
      const h = b.beat ? Math.max(8, (b.beat / max) * 100) : 0;
      const marks = b.marks
        .map((k) => `<i style="background:${MARK_COLOR[k]}" title="${MARK_WORD[k]}"></i>`)
        .join('');
      return `<span class="yq-rc-col${b.noData ? ' yq-rc-none' : ''}" title="${fmtClock(b.t0)} to ${fmtClock(b.t1)} UTC"><span class="yq-rc-marks">${marks}</span><span class="yq-rc-beat" style="height:${h.toFixed(0)}%"></span></span>`;
    })
    .join('');
  const mid = r.t0 + r.span / 2;
  const head = `<div class="yq-rc-head"><b>Last 24 hours</b>${compact ? '' : `<span class="yq-muted">to ${fmtDay(r.t)} ${fmtClock(r.t)} UTC</span>`}</div>`;
  const counts = `<div class="yq-rc-counts"><span class="yq-rc-group">${work}</span><span class="yq-rc-group yq-rc-beatgroup">${beat}</span></div>`;
  const bar = `<div class="yq-rc-barbox"><div class="yq-rc-bar">${cols}</div>
    <div class="yq-rc-axis"><span>${fmtClock(r.t0)}</span><span>${fmtClock(mid)}</span><span>now</span></div></div>`;
  const cls = `yq-recent${compact ? ' yq-compact' : ''}${row ? ' yq-row' : ''}`;
  return row
    ? `<div class="${cls}"><div>${head}${counts}</div>${bar}</div>`
    : `<div class="${cls}">${head}${counts}${bar}</div>`;
}
