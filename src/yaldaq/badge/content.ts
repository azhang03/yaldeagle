// The staff badge of a visit: the ID card of the subject, on a lanyard, in the look of the firm.
// This file builds its parts as HTML text. Strings only, no DOM.
//
// The badge shows the facts of data/facts.ts: the status, the key numbers as tiles, the 24-hour
// activity as a "shift" strip, the subject's own widget, and a short shift log. Only facts.ts
// and the reveal functions of hud/html.ts give numbers, so the seal holds: forecasts and strike
// labels show only from an envelope that is open at t.
import type { Facts, LogLine, Spark, Stat, Subject, Tone } from '../data/facts';
import { fmtClock, fmtCountdown, fmtDay, fmtDur, fmtP, fmtUSD } from '../data/format';
import type { Model, State } from '../data/model';
import { esc } from '../data/text';
import { WHO, boardHTML, envelopeHTML, revealHTML, sortStrikes } from '../hud/html';
import { CAST, type CastInfo } from '../scene/cast/core';

/** The look and the words of one badge. */
export interface BadgeInfo {
  name: string;
  role: string;
  module: string;
  color: string;
  tint?: string;
  blurb: string;
}

/** The wall screen is a prop, not an actor. It has its own card. */
export const BOARD_INFO: BadgeInfo = {
  name: 'Wall screen',
  role: 'Claude against the Actuary',
  module: 'score',
  color: '#3a3f46',
  blurb:
    'The main question of YALDAQ: does Claude with web search forecast better than a simple count of past results? The screen shows the Brier score of each forecaster on settled markets. Lower is better.',
};

/** The vault is the glass locker wall of the firm. */
export const VAULT_INFO: BadgeInfo = {
  ...CAST.vault,
  name: 'Data vault',
  role: 'Sealed envelopes',
  blurb:
    'Each envelope waits in a lit cubby of the glass locker wall until its markets close. Then the vault opens it. The wall screen counts up when the markets settle.',
};

export const infoOf = (subject: Subject): BadgeInfo | CastInfo =>
  subject === 'board' ? BOARD_INFO : subject === 'vault' ? VAULT_INFO : CAST[subject];

/** The area of the firm where each subject works: the desk on the badge. */
export const DESK: Readonly<Record<Subject, string>> = {
  brief: 'Research lab',
  claude: 'Research lab',
  strike_rate: 'Research lab',
  base_rate: 'Research lab',
  ladder: 'Research lab',
  shadow: 'Fill desk',
  policy: 'Trading desk',
  risk: 'Trading desk',
  loop: 'Trading desk',
  demo: 'Trading desk',
  reconcile: 'Trading desk',
  scanner: 'Operations',
  supervisor: 'Operations',
  cost: "Treasurer's office",
  vault: 'Data vault',
  board: 'Data vault',
};

/** The words of the status light. */
export const TONE_WORD: Readonly<Record<Tone, string>> = {
  work: 'Now',
  ok: 'On duty',
  quiet: 'Quiet',
  stale: 'Late',
  error: 'Error',
  idle: 'Off duty',
};

/** The context of one badge: the shown time, the state at that time, and the model. */
export interface BadgeContext {
  t: number;
  state: State;
  model: Model;
}

/** The parts of the badge that the reader can open or close, and the tiles that light up. */
export interface BadgeUi {
  notes: boolean;
  logMore: boolean;
  bumped: ReadonlySet<string>;
}

export interface BadgeSections {
  status: string;
  tiles: string;
  shift: string;
  widget: string;
  log: string;
}

const short = (series: string | null | undefined): string =>
  String(series ?? '').split(',')[0] ?? '';
const when = (t: number): string => `${fmtDay(t).slice(0, 3)} ${fmtClock(t)}`;
const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;
const clampPct = (x: number): string => Math.max(0, Math.min(100, x * 100)).toFixed(1);
const hd = (text: string, aside = ''): string =>
  `<div class="b-h"><span>${text}</span>${aside ? `<em>${aside}</em>` : ''}</div>`;
const num = (v: Stat['value'] | undefined): number => (typeof v === 'number' ? v : 0);

/** The word on the band: a person, a room, or a screen. */
export const kindWord = (subject: Subject): string =>
  subject === 'vault' ? 'ROOM' : subject === 'board' ? 'SCREEN' : 'STAFF';

/** A small picture for the badge: a blocky figure in the actor color, the safe, or the screen. */
export function photoSVG(subject: Subject): string {
  const info = infoOf(subject);
  const c = info.color;
  const bg = info.tint ?? '#e9e4da';
  if (subject === 'vault') {
    return `<svg viewBox="0 0 40 48" aria-hidden="true"><rect width="40" height="48" rx="5" fill="#e3ddd2"/><rect x="5" y="9" width="30" height="30" rx="3" fill="#59626d"/><rect x="7" y="11" width="26" height="26" rx="2" fill="#7d8690"/><circle cx="20" cy="24" r="7" fill="#c9ced3"/><circle cx="20" cy="24" r="2" fill="${c}"/><rect x="19.2" y="17" width="1.6" height="4" fill="#59626d"/></svg>`;
  }
  if (subject === 'board') {
    return `<svg viewBox="0 0 40 48" aria-hidden="true"><rect width="40" height="48" rx="5" fill="#e3ddd2"/><rect x="4" y="11" width="32" height="22" rx="2" fill="#1b2233"/><rect x="8" y="16" width="16" height="3" fill="${WHO.claude.color}"/><rect x="8" y="22" width="20" height="3" fill="${WHO.strike_rate.color}"/><rect x="8" y="28" width="11" height="2" fill="${WHO.base_rate.color}"/><rect x="18" y="33" width="4" height="7" fill="#3a3f46"/></svg>`;
  }
  return `<svg viewBox="0 0 40 48" aria-hidden="true"><rect width="40" height="48" rx="5" fill="${bg}"/><rect x="7" y="33" width="26" height="15" rx="2" fill="${c}"/><rect x="9" y="8" width="22" height="22" rx="3" fill="${c}"/><rect x="9" y="8" width="22" height="5" rx="2" fill="rgba(0,0,0,0.18)"/><rect x="13" y="17" width="5" height="5" fill="#fff"/><rect x="22" y="17" width="5" height="5" fill="#fff"/><rect x="15" y="19" width="3" height="3" fill="#1d2233"/><rect x="24" y="19" width="3" height="3" fill="#1d2233"/><rect x="17" y="25" width="6" height="2" fill="rgba(0,0,0,0.3)"/></svg>`;
}

/** The staff number, the desk, and the job text under the name. */
export function metaHTML(subject: Subject): string {
  const info = infoOf(subject);
  return `<div class="b-meta-row"><div><span>Staff no.</span><code>${esc(info.module)}</code></div><div><span>Desk</span><b>${esc(DESK[subject])}</b></div></div><p class="b-job">${esc(info.blurb)}</p>`;
}

/** One stat value as text, in the unit of the stat. No data shows "--". */
export function fmtStat(s: Stat): string {
  const v = s.value;
  if (v == null) return '--';
  if (typeof v === 'string') return esc(v);
  if (s.unit === 'ms') return fmtCountdown(v);
  if (s.unit === 's') return v >= 60 ? fmtDur(v * 1000) : `${v.toFixed(v < 10 ? 1 : 0)} s`;
  if (s.unit === 'usd') return fmtUSD(v);
  if (s.key === 'sum' || s.key === 'fix') return v.toFixed(2);
  if (Number.isInteger(v)) return v.toLocaleString('en-US');
  return v.toFixed(3);
}

/** The key numbers as tiles. A tile in `bumped` lights up. */
export function tilesHTML(stats: readonly Stat[], bumped: ReadonlySet<string>): string {
  const n = Math.min(5, stats.length);
  return `<div class="b-tiles n${n}">${stats
    .map((s) => {
      const v = fmtStat(s);
      const cls = `bt${bumped.has(s.key) ? ' bump' : ''}${v.length > 7 ? ' long' : ''}${s.value == null ? ' none' : ''}`;
      return `<div class="${cls}"><b>${v}</b><span class="bt-l">${esc(s.label)}</span>${s.note ? `<span class="bt-n">${esc(s.note)}</span>` : ''}</div>`;
    })
    .join('')}</div>`;
}

/** The shift strip: the subject's own events in 48 half hours. */
export function shiftHTML(spark: Spark): string {
  const total = spark.bins.reduce((a, b) => a + b.n, 0);
  const cols = spark.bins
    .map((b) => {
      if (b.noData) return '<i class="nd"></i>';
      return b.n
        ? `<i class="on" style="height:${Math.max(16, (b.n / spark.max) * 100).toFixed(0)}%"></i>`
        : '<i></i>';
    })
    .join('');
  const aside = total
    ? `${total.toLocaleString('en-US')} ${total === 1 ? 'event' : 'events'}`
    : 'no events';
  const none = spark.bins.some((b) => b.noData) ? '<span class="nd-key"><i></i>no data</span>' : '';
  return `${hd('Shift, last 24 h', aside)}<div class="sh-strip">${cols}</div><div class="axis"><span>${fmtClock(spark.t0)}</span>${none}<span>${fmtClock(spark.t0 + (spark.t - spark.t0) / 2)}</span><span>now</span></div>`;
}

/** A line of the last 24 hours with marked spans (gaps, outages), over the shift bins. */
export function daylineHTML(
  spark: Spark,
  spans: readonly { from: number; to: number }[],
  cls: string,
): string {
  const W = spark.t - spark.t0;
  const bins = spark.bins
    .map((b) => `<i class="${b.noData ? 'nd' : b.n ? 'on' : ''}"></i>`)
    .join('');
  const segs = spans
    .map((s) => {
      const a = Math.max(0, (s.from - spark.t0) / W);
      const b = Math.min(1, (s.to - spark.t0) / W);
      return `<b class="${cls}" style="left:${clampPct(a)}%;width:${Math.max(1.2, (b - a) * 100).toFixed(1)}%"></b>`;
    })
    .join('');
  return `<div class="dl"><div class="dl-bins">${bins}</div>${segs}</div><div class="axis"><span>${fmtClock(spark.t0)}</span><span>now</span></div>`;
}

/** A half-circle gauge. */
function gaugeSVG(v: number, max: number, color: string): string {
  const k = Math.max(0, Math.min(1, v / max));
  const a = Math.PI * (1 - k);
  const x = (r: number): string => (50 + r * Math.cos(a)).toFixed(1);
  const y = (r: number): string => (50 - r * Math.sin(a)).toFixed(1);
  return `<svg class="gauge" viewBox="0 0 100 58" aria-hidden="true"><path d="M10,50 A40,40 0 0 1 90,50" fill="none" stroke="#e6dac3" stroke-width="9" stroke-linecap="round"/>${k > 0 ? `<path d="M10,50 A40,40 0 0 1 ${x(40)},${y(40)}" fill="none" stroke="${color}" stroke-width="9" stroke-linecap="round"/>` : ''}<line x1="50" y1="50" x2="${x(30)}" y2="${y(30)}" stroke="#1b2547" stroke-width="3" stroke-linecap="round"/><circle cx="50" cy="50" r="4.5" fill="#1b2547"/></svg>`;
}

/** A ring that fills as the next tick comes near. */
function dialSVG(frac: number | null, color: string): string {
  const r = 26;
  const c = 2 * Math.PI * r;
  const k = frac == null ? 0 : Math.max(0, Math.min(1, frac));
  const marks = Array.from({ length: 5 }, (_, i) => {
    const a = (i / 5) * 2 * Math.PI - Math.PI / 2;
    return `<line x1="${(32 + 21 * Math.cos(a)).toFixed(1)}" y1="${(32 + 21 * Math.sin(a)).toFixed(1)}" x2="${(32 + 17 * Math.cos(a)).toFixed(1)}" y2="${(32 + 17 * Math.sin(a)).toFixed(1)}" stroke="#b9a582" stroke-width="2"/>`;
  }).join('');
  const hand = k * 2 * Math.PI - Math.PI / 2;
  return `<svg class="dial" viewBox="0 0 64 64" aria-hidden="true"><circle cx="32" cy="32" r="${r}" fill="#fffaf0" stroke="#e6dac3" stroke-width="6"/><circle cx="32" cy="32" r="${r}" fill="none" stroke="${color}" stroke-width="6" stroke-dasharray="${(k * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 32 32)"/>${marks}<line x1="32" y1="32" x2="${(32 + 15 * Math.cos(hand)).toFixed(1)}" y2="${(32 + 15 * Math.sin(hand)).toFixed(1)}" stroke="#1b2547" stroke-width="2.5" stroke-linecap="round"/><circle cx="32" cy="32" r="3" fill="#1b2547"/></svg>`;
}

/** The jar of the treasurer: today's spend against the daily cap. */
function jarSVG(level: number, color: string): string {
  const H = 52;
  const h = level > 0 ? Math.max(2.5, Math.min(1, level) * H) : 0;
  const lines = [0.25, 0.5, 0.75]
    .map(
      (k) =>
        `<line x1="40" x2="46" y1="${(68 - k * H).toFixed(1)}" y2="${(68 - k * H).toFixed(1)}" stroke="#9fb0ab" stroke-width="1.5"/>`,
    )
    .join('');
  return `<svg class="jar" viewBox="0 0 54 74" aria-hidden="true"><rect x="12" y="2" width="30" height="8" rx="2" fill="#5a3825"/><path d="M8,14 h38 a4,4 0 0 1 4,4 v48 a6,6 0 0 1 -6,6 h-34 a6,6 0 0 1 -6,-6 v-48 a4,4 0 0 1 4,-4z" fill="#eef3f1" stroke="#b7c4c0" stroke-width="2"/><rect x="7" y="${(68 - h).toFixed(1)}" width="40" height="${h.toFixed(1)}" rx="3" fill="${color}"/>${lines}</svg>`;
}

const REASON_COLOR: Readonly<Record<string, string>> = {
  edge: '#c2548a',
  wide_spread: '#e08a1e',
  p_extreme: '#5b6ea8',
};
const KIND_WORD: Readonly<Record<string, string>> = {
  balance: 'balance',
  positions: 'positions',
  orderbook: 'order book',
  orders: 'orders',
  fills: 'fills',
};
const KIND_COLOR = ['#b39373', '#5b6ea8', '#2f9fd0', '#8e5bb5', '#2e9e5b'];
const COUNT_WORD: Readonly<Record<string, string>> = {
  open: 'open',
  new: 'new',
  events: 'new events',
  forecasts: 'sent to forecast',
  skipped_late: 'skipped, late',
  skipped_cap: 'skipped, cap',
  failed: 'failed',
};
const LOOP_WORD: Readonly<Record<string, string>> = {
  open_markets: 'open markets',
  open_orders: 'resting orders',
  orders: 'new orders',
  fills: 'fills',
  rejections: 'rejected',
  settlements: 'settled',
};
const kindColor = (i: number): string => KIND_COLOR[i % KIND_COLOR.length] ?? '#8a8f98';

/** Small counters in a row: [value, label]. */
const counters = (pairs: readonly (readonly [number, string])[]): string =>
  `<div class="ctr">${pairs.map(([v, l]) => `<span class="${v ? '' : 'zero'}"><b>${v}</b>${esc(l)}</span>`).join('')}</div>`;

/** The counters of a count map, in the order and the words of `words`. */
const countPairs = (
  c: Readonly<Record<string, number>>,
  words: Readonly<Record<string, string>>,
): [number, string][] =>
  Object.entries(words)
    .filter(([k]) => k in c)
    .map(([k, w]) => [c[k] ?? 0, w]);

/** The subject's own widget, from facts.detail. */
export function widgetHTML(subject: Subject, f: Facts, ctx: BadgeContext, ui: BadgeUi): string {
  const d = f.detail;
  const { t, state } = ctx;
  const color = infoOf(subject).color;
  switch (subject) {
    case 'scanner': {
      const c = d.lastCounts ?? {};
      const lit = f.status.tone === 'ok' || f.status.tone === 'work';
      const lamps = (d.series ?? [])
        .map((s) => `<span class="sc-lamp${lit ? ' lit' : ''}"><i></i>${esc(s)}</span>`)
        .join('');
      const reads = d.readsPerMin ?? 0;
      const max = Math.max(20, reads);
      return `${hd('The nine series', lit ? 'watching' : 'paused')}<div class="sc-grid">${lamps}</div>
        ${hd('At the last cycle')}${counters(countPairs(c, COUNT_WORD))}
        <div class="sc-gauge">${gaugeSVG(reads, max, color)}<div><b>${reads}</b><span>market reads per minute, now</span></div></div>`;
    }
    case 'brief': {
      const briefs = d.briefs ?? [];
      if (!briefs.length) return `${hd('Folders')}<div class="empty">No briefs yet.</div>`;
      const folders = briefs
        .map(
          (
            b,
          ) => `<div class="br-folder${b.open ? ' open' : ''}"><span class="br-tab">${when(b.at)}</span>
          <b>${esc(b.series ?? '')}</b><span>${plural(b.markets, 'market')}, ${b.eventDay ? `event day ${fmtDay(Date.parse(b.eventDay))}` : 'no event day'}</span>
          <span class="br-stamp">${b.open ? 'Opened' : 'Sealed'}</span></div>`,
        )
        .join('');
      return `${hd('Folders handed out', 'no prices inside')}<div class="br-stack">${folders}</div>`;
    }
    case 'claude': {
      const r = d.running ?? null;
      const calls = d.calls ?? [];
      const last = calls.find((c) => c.done);
      const now = r
        ? `<div class="cl-run"><div><b>Working on ${plural(r.markets, 'market')}</b>, ${esc(short(r.series))}</div>
            <div class="cl-prog"><span style="width:${clampPct(r.progress)}%"></span></div>
            <div class="cl-sub">Started ${fmtClock(r.at, true)} UTC, ${Math.max(0, Math.round((t - r.at) / 1000))} s ago. The searches and the cost show when the call ends.</div></div>`
        : `<div class="cl-idle">Not on a call now.${last ? ` The last call ended ${fmtDur(t - last.end)} ago.` : ''}</div>`;
      const rows = calls
        .map((c) => {
          const dots =
            c.searches == null
              ? '<i class="wait"></i>'
              : Array.from({ length: Math.min(8, c.searches) }, () => '<i></i>').join('') ||
                '<i class="no"></i>';
          const word = c.searches == null ? 'searching' : c.searches === 1 ? 'search' : 'searches';
          return `<div class="cl-call${c.done ? '' : ' run'}"><div class="cl-call-h"><b>${esc(short(c.series))}</b><span>${when(c.at)}</span></div>
            <div class="cl-call-f"><span><b>${c.markets}</b>markets</span><span><b class="dots">${dots}</b>${word}</span><span><b>${c.secs == null ? '...' : `${c.secs.toFixed(0)} s`}</b>time</span><span><b>${c.cost == null ? '...' : fmtUSD(c.cost)}</b>cost</span></div></div>`;
        })
        .join('');
      const env = d.openEnvelope ?? null;
      const notes = env
        ? `<button class="b-more" type="button" data-act="notes" aria-expanded="${ui.notes}">${ui.notes ? 'Hide' : 'Show'} Claude's notes from the ${esc(short(env.series))} envelope</button>${ui.notes ? `<div class="b-reveal">${revealHTML(env, t)}</div>` : ''}`
        : `<div class="sealed-note"><span class="yq-seal"></span>Claude's notes and searches stay sealed until the markets close.</div>`;
      return `${hd('Now')}${now}${calls.length ? `${hd('Calls')}<div class="cl-calls">${rows}</div>` : ''}${notes}`;
    }
    case 'strike_rate':
    case 'base_rate': {
      const me = WHO[subject];
      let out = '';
      const r = d.revealed ?? null;
      if (r) {
        const ms = sortStrikes(r.markets);
        const max = Math.max(0.05, ...ms.flatMap((m) => [m.p ?? 0, m.claude ?? 0])) * 1.08;
        const dot = (p: number | null, cls: string): string =>
          p == null ? '' : `<i class="${cls}" style="left:${clampPct(p / max)}%"></i>`;
        const rows = ms
          .map(
            (m) =>
              `<div class="fc-row"><span class="fc-k">${esc(m.strike)}</span><span class="fc-track">${dot(m.claude, 'cl')}${dot(m.p, 'me')}</span><span class="fc-v">${m.p == null ? '-' : fmtP(m.p)}</span></div>`,
          )
          .join('');
        out += `${hd(`Opened: ${esc(short(r.series))}`)}<div class="fc-legend"><span><i style="background:${me.color}"></i>${me.name}</span><span><i style="background:${WHO.claude.color}"></i>Claude</span></div><div class="fc-plot" style="--me:${me.color};--cl:${WHO.claude.color}">${rows}</div>`;
      }
      const sealed = (d.sealedEnvelopes ?? [])
        .map((e) => {
          const s = state.envelopes.find((x) => x.id === e.id);
          return `<div class="fc-env"><span class="yq-seal"></span><div><b>${esc(short(e.series))}</b><span>${s ? `${s.counts.forecasts} forecasts inside, from all three` : ''}</span></div><div class="fc-cd"><b>${fmtCountdown(e.opensAt - t)}</b><span>to open</span></div></div>`;
        })
        .join('');
      if (sealed)
        out += `${hd('Sealed', 'its forecasts wait here')}<div class="fc-envs">${sealed}</div>`;
      return out || `${hd('Forecasts')}<div class="empty">No envelopes yet.</div>`;
    }
    case 'ladder': {
      const repairs = d.repairs ?? [];
      const last = repairs[0];
      if (!last) return `${hd('The level')}<div class="empty">No repairs yet.</div>`;
      const fix2 = (v: number | null): string => (v == null ? '-' : v.toFixed(2));
      // A largest fix comes only after the envelope opens.
      const fixOf = (v: number | null): string => (v == null ? 'sealed' : v.toFixed(2));
      const off = Math.max(-1, Math.min(1, ((last.sumRaw ?? 1) - 1) / 0.1));
      const rows = repairs
        .map(
          (r) =>
            `<div class="ld-row"><span>${when(r.at)}</span><b>${esc(short(r.series))}</b><span>sum <b>${fix2(r.sumRaw)}</b></span><span>fix <b>${fixOf(r.repairMax)}</b></span></div>`,
        )
        .join('');
      const shape = last.shape === 'partition' ? 'buckets' : esc(last.shape ?? '');
      return `${hd('The level', `${esc(short(last.series))}, ${shape}`)}
        <div class="ld-level"><div class="ld-tube"><span class="ld-mark"></span><span class="ld-bub" style="left:${(50 + off * 40).toFixed(1)}%"></span></div>
        <div class="ld-read"><b>${fix2(last.sumRaw)}</b><span>raw sum</span></div><div class="ld-read"><b>${fixOf(last.repairMax)}</b><span>largest fix</span></div></div>
        <div class="ld-scale"><span>0.90</span><span>1.00</span><span>1.10</span></div>${hd('Checks')}${rows}`;
    }
    case 'policy': {
      const orders = num(f.stats.find((s) => s.key === 'orders')?.value);
      const passed = num(f.stats.find((s) => s.key === 'passed')?.value);
      const total = orders + passed;
      const shown = Math.min(60, total);
      const dots = Array.from(
        { length: shown },
        (_, i) => `<i class="${i < orders ? 'ord' : ''}"></i>`,
      ).join('');
      const reasons = d.reasons ?? [];
      const rsum = reasons.reduce((a, r) => a + r.n, 0);
      const rc = (k: string): string => REASON_COLOR[k] ?? '#8a8f98';
      const bar = reasons
        .map((r) => `<span style="flex:${r.n};background:${rc(r.key)}"></span>`)
        .join('');
      const legend = reasons
        .map(
          (r) =>
            `<div class="pl-r"><i style="background:${rc(r.key)}"></i><span>${esc(r.label)}</span><b>${r.n}</b></div>`,
        )
        .join('');
      const stamps = (d.orders ?? [])
        .map(
          (o) =>
            `<div class="pl-ord"><span class="pl-stamp">Order</span><b>${esc(short(o.series))}</b><span>${when(o.at)}</span><span class="yq-muted">sealed</span></div>`,
        )
        .join('');
      const markets = total
        ? `<div class="pl-dots">${dots}${total > shown ? `<em>+${total - shown}</em>` : ''}</div><div class="pl-key"><span><i class="ord"></i>order</span><span><i></i>pass</span></div>`
        : '<div class="empty">No markets priced in the last 24 hours.</div>';
      return `${hd('Each market, 24 h', total ? `${orders} with an order` : '')}${markets}
        ${rsum ? `${hd('Why it passed')}<div class="pl-bar">${bar}</div>${legend}` : ''}
        ${stamps ? `${hd('Orders', 'side, price, and size sealed')}${stamps}` : ''}`;
    }
    case 'risk': {
      const gates = d.gates ?? [];
      const rows = gates
        .map(
          (g) =>
            `<div class="rk-gate${g.on ? ' on' : ''}"><span class="rk-sw"><i></i></span><div><b>${esc(g.name)}</b><span>${g.on ? 'On. New orders stop here.' : 'Off. Orders can pass.'}</span></div><span class="rk-lamp"></span></div>`,
        )
        .join('');
      const open = gates.every((g) => !g.on);
      return `${hd('The gates', `as of ${when(ctx.model.asOf)} UTC`)}${rows}<div class="rk-door${open ? '' : ' shut'}"><span class="rk-door-i"></span>${open ? 'The door is open. Orders can go out.' : 'The door is shut. No new orders go out.'}</div>`;
    }
    case 'loop': {
      const c = d.lastCounts ?? {};
      const due = f.stats.find((s) => s.key === 'due')?.value;
      const frac = typeof due === 'number' ? 1 - due / 300e3 : null;
      const gaps = d.gaps ?? [];
      const longestGap = d.longestGap ?? 0;
      const longest = gaps.find((g) => g.to - g.from === longestGap);
      const lastTick = state.jobs.loop.last;
      return `<div class="lp-top">${dialSVG(frac, color)}<div><b>${lastTick != null ? fmtClock(lastTick, true) : '-'}</b><span>${lastTick != null ? 'the last tick (UTC). The ring fills up to the next one, 5 min later.' : 'No tick yet.'}</span></div></div>
        ${hd('At the last tick')}${counters(countPairs(c, LOOP_WORD))}
        ${hd('Ticks and gaps, 24 h', gaps.length ? plural(gaps.length, 'gap') : 'no gaps')}${daylineHTML(f.spark, gaps, 'gap')}
        <div class="dl-note">${longest ? `Longest gap ${fmtDur(longestGap)}, ${fmtClock(longest.from)} to ${fmtClock(longest.to)} UTC.` : 'No gap over 15 minutes.'}</div>`;
    }
    case 'shadow': {
      const fills = d.fills ?? [];
      if (!fills.length)
        return `${hd('Fills')}<div class="empty">No paper fills in the files yet.</div>`;
      const rows = fills
        .map((x) => {
          const seen = `<span>seen ${fmtClock(x.at, true)}</span>`;
          // A sealed fill has no print time yet, so it has no lag.
          if (x.exAt == null || x.lag == null) {
            return `<div class="sd-fill"><div class="sd-h"><b>${esc(short(x.series))}</b><span>print time sealed</span></div>
          <div class="sd-t">${seen}</div></div>`;
          }
          return `<div class="sd-fill"><div class="sd-h"><b>${esc(short(x.series))}</b><span>seen after <b>${x.lag >= 60 ? fmtDur(x.lag * 1000) : `${x.lag.toFixed(0)} s`}</b></span></div>
          <div class="sd-track"><span style="width:${clampPct(x.lag / 300)}%"></span></div>
          <div class="sd-t"><span>printed ${fmtClock(x.exAt, true)}</span>${seen}</div></div>`;
        })
        .join('');
      return `${hd('From trade to paper fill', 'the bar is one 5 min watch')}${rows}`;
    }
    case 'demo': {
      const kinds = Object.entries(d.byKind ?? {}).sort((a, b) => b[1] - a[1]);
      const total = kinds.reduce((a, [, n]) => a + n, 0);
      if (!total) {
        return `${hd('What it read')}<div class="empty">No demo reads in the last 24 hours.</div>`;
      }
      const bar = kinds
        .map(([, n], i) => `<span style="flex:${n};background:${kindColor(i)}"></span>`)
        .join('');
      const legend = kinds
        .map(
          ([k, n], i) =>
            `<div class="pl-r"><i style="background:${kindColor(i)}"></i><span>${esc(KIND_WORD[k] ?? k)}</span><b>${n}</b></div>`,
        )
        .join('');
      const errs = num(f.stats.find((s) => s.key === 'errors')?.value);
      return `${hd('What it read on the demo exchange', `${total} reads`)}<div class="pl-bar tall">${bar}</div>${legend}<div class="dm-err${errs ? ' bad' : ''}"><span></span>${errs ? `${plural(errs, 'read')} failed in the last 24 h.` : 'Every read worked.'}</div>`;
    }
    case 'reconcile': {
      const checks = d.checks ?? [];
      const first = checks[0];
      const last = checks.at(-1);
      if (!first || !last) {
        return `${hd('Checks')}<div class="empty">No checks in the last 24 hours.</div>`;
      }
      const ok = checks.filter((c) => c.ok).length;
      const stamps = checks
        .map((c) => `<i class="${c.ok ? 'ok' : 'bad'}">${c.ok ? '✓' : '✗'}</i>`)
        .join('');
      return `${hd('Our books and the demo books', `${ok} of ${checks.length} agree`)}<div class="rc-row">${stamps}</div><div class="axis"><span>${when(first.at)}</span><span>${when(last.at)}</span></div>`;
    }
    case 'cost': {
      const today = d.today ?? 0;
      const month = d.month ?? 0;
      const dailyCap = d.dailyCap ?? 0;
      const monthlyCap = d.monthlyCap ?? 0;
      const width = (v: number, cap: number): string =>
        v > 0 && cap > 0 ? Math.max(1, Math.min(100, (v / cap) * 100)).toFixed(1) : '0';
      const coins = (d.spends ?? [])
        .map(
          (s) =>
            `<div class="cs-coin"><i>$</i><b>${fmtUSD(s.cost)}</b><span>${when(s.at)}</span></div>`,
        )
        .join('');
      return `<div class="cs-top">${jarSVG(dailyCap > 0 ? today / dailyCap : 0, color)}<div class="cs-caps">
          <div><b>${fmtUSD(today)}</b> of ${fmtUSD(dailyCap)} today</div><div class="cs-bar"><span style="width:${width(today, dailyCap)}%"></span></div>
          <div><b>${fmtUSD(month)}</b> of ${fmtUSD(monthlyCap)} this month</div><div class="cs-bar"><span style="width:${width(month, monthlyCap)}%"></span></div></div></div>
        ${coins ? `${hd('Coins in the jar')}<div class="cs-coins">${coins}</div>` : ''}`;
    }
    case 'supervisor': {
      const jobs = (d.jobs ?? [])
        .map(
          (j) =>
            `<div class="sv-job"><span class="b-light t-${j.tone}"></span><b>${esc(j.name)}</b><span>${esc(j.text)}</span></div>`,
        )
        .join('');
      const outages = d.outages ?? [];
      const outs = outages
        .map(
          (o) =>
            `<div class="sv-out"><b>${when(o.from)} to ${fmtClock(o.to)}</b><span>${plural(o.errors, 'network error')}${o.to > o.from ? `, ${fmtDur(o.to - o.from)}` : ''}</span></div>`,
        )
        .join('');
      const spans = outages.map((o) => ({ from: o.from, to: Math.max(o.to, o.from + 60e3) }));
      return `${hd('Jobs')}${jobs}${hd('Error runs, 24 h', outages.length ? plural(outages.length, 'run') : 'none')}${daylineHTML(f.spark, spans, 'out')}${outs || '<div class="dl-note">No network errors in the last 24 hours.</div>'}`;
    }
    case 'vault': {
      const envs = d.envelopes ?? [];
      const list = envs.length
        ? envs.map((e) => envelopeHTML(e)).join('')
        : '<div class="empty">No envelopes yet.</div>';
      const next = envs.filter((e) => !e.open).sort((a, b) => a.opensIn - b.opensIn)[0];
      const opened = d.openEnvelope ?? null;
      const shown = opened ?? next;
      const title = opened ? 'The open envelope' : 'Inside the next envelope';
      return `${hd('Cubbies')}<div class="vt-envs">${list}</div>${shown ? `${hd(title)}<div class="b-reveal">${revealHTML(shown, t)}</div>` : ''}`;
    }
    case 'board':
      return `<div class="b-reveal">${boardHTML(d.board ?? null)}</div>`;
  }
}

const LOG_SHORT = 4;

/** The shift log, newest first. The short log shows LOG_SHORT lines. */
export function logHTML(log: readonly LogLine[], more: boolean): string {
  if (!log.length) return `${hd('Shift log')}<div class="empty">No events in the files yet.</div>`;
  const lines = (more ? log : log.slice(0, LOG_SHORT))
    .map((x) => `<li><time>${when(x.at)}</time><span>${x.text}</span></li>`)
    .join('');
  const btn =
    log.length > LOG_SHORT
      ? `<button class="b-more" type="button" data-act="log" aria-expanded="${more}">${more ? 'Show less' : `Show ${log.length - LOG_SHORT} more`}</button>`
      : '';
  return `${hd('Shift log', 'newest first')}<ol class="b-log">${lines}</ol>${btn}`;
}

/** The status line: the tone word and the status text. */
export const statusHTML = (f: Facts): string =>
  `<b>${TONE_WORD[f.status.tone]}</b> ${esc(f.status.text)}`;

/** Every part of the badge that changes with time, as HTML text. */
export function badgeSections(
  subject: Subject,
  f: Facts,
  ctx: BadgeContext,
  ui: BadgeUi,
): BadgeSections {
  return {
    status: statusHTML(f),
    tiles: tilesHTML(f.stats, ui.bumped),
    shift: shiftHTML(f.spark),
    widget: widgetHTML(subject, f, ctx, ui),
    log: logHTML(f.log, ui.logMore),
  };
}
