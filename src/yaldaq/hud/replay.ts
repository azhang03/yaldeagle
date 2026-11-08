// The replay bar: play and pause, the speed, live, the day, a time scrubber with marks, and
// jumps to the good moments of the shown day. Style: firm.css (.yq-replay).
//
// The bar has no frame loop of its own. The firm's frame loop calls update().
import { SPEEDS, type Clock } from '../data/clock';
import type { Feed } from '../data/feed';
import { DAY_MS, dayOf, dayStart, fmtClock, fmtDay, fmtWhen } from '../data/format';
import { moments as findMoments, type Model, type Moment } from '../data/model';
import { esc } from '../data/text';

/** A jump lands this long before the moment, so its motion plays. */
const LEAD_MS = 20e3;
/** The bar shows this many day buttons. The older days are in the "Earlier" list. */
const DAY_BUTTONS = 3;
/** A day from the feed. Other text never reaches the HTML. */
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export interface ReplayBar {
  readonly root: HTMLElement;
  /** Redraws the day list, the moments, and the marks for a new model. */
  setModel(model: Model): void;
  /** Call each frame. It reads the clock and writes only what changed. */
  update(): void;
  /** Removes the bar and its clock listener. */
  destroy(): void;
}

/**
 * Builds the bar in host.
 * opts.state gives the HTML of the state tag (live, replay, or no news), so the bar and the
 * time pill say the same thing.
 * opts.compact: a smaller bar for phones and overlays (the moments scroll in one row).
 */
export function createReplayBar(
  host: HTMLElement,
  opts: {
    clock: Clock;
    feed: Feed;
    model: Model;
    state: () => string;
    compact?: boolean;
  },
): ReplayBar {
  const { clock, feed } = opts;
  let model = opts.model;
  let list: Moment[] = [];

  const root = document.createElement('div');
  root.className = `yq-replay${opts.compact ? ' yq-compact' : ''}`;
  root.innerHTML = `
    <div class="yq-rp-row">
      <button class="yq-btn yq-rp-play" type="button" aria-label="Play or pause"></button>
      <div class="yq-seg yq-rp-speed">${SPEEDS.map((s) => `<button class="yq-btn" type="button" data-speed="${s}">${s}x</button>`).join('')}</div>
      <button class="yq-btn yq-rp-live" type="button">Live</button>
      <span class="yq-rp-time"></span>
    </div>
    <div class="yq-rp-row">
      <div class="yq-rp-days"></div>
      <span class="yq-rp-state"></span>
    </div>
    <div class="yq-rp-track"><div class="yq-rp-marks"></div><div class="yq-rp-thumb"></div></div>
    <div class="yq-rp-hours">${[0, 6, 12, 18, 24].map((h) => `<span style="left:${(h / 24) * 100}%">${String(h).padStart(2, '0')}</span>`).join('')}</div>
    <div class="yq-rp-moments"></div>`;
  host.appendChild(root);
  const $ = <T extends HTMLElement = HTMLElement>(s: string): T => {
    const el = root.querySelector<T>(s);
    if (!el) throw new Error(`The replay bar has no ${s}.`);
    return el;
  };
  const play = $('.yq-rp-play');
  const liveBtn = $('.yq-rp-live');
  const time = $('.yq-rp-time');
  const state = $('.yq-rp-state');
  const days = $('.yq-rp-days');
  const track = $('.yq-rp-track');
  const marks = $('.yq-rp-marks');
  const thumb = $('.yq-rp-thumb');
  const momentsEl = $('.yq-rp-moments');
  const speedBtns = [...root.querySelectorAll<HTMLButtonElement>('[data-speed]')];

  play.onclick = () => clock.toggle();
  liveBtn.onclick = () => clock.goLive();
  for (const b of speedBtns) b.onclick = () => clock.setSpeed(Number(b.dataset.speed));

  /** Loads the day, then shows the same time of day there, inside the model. */
  let dayLoad = 0;
  async function showDay(day: string): Promise<void> {
    const tod = clock.t - dayStart(dayOf(clock.t));
    const ticket = ++dayLoad;
    await feed.loadDay(day);
    // A later choice wins over this one.
    if (ticket !== dayLoad) return;
    const m = feed.model ?? model;
    clock.seek(Math.min(m.end, Math.max(m.start, dayStart(day) + tod)));
  }

  days.onclick = (ev) => {
    const b = (ev.target as Element | null)?.closest<HTMLButtonElement>('[data-day]');
    if (b?.dataset.day) void showDay(b.dataset.day);
  };
  days.onchange = (ev) => {
    const sel = ev.target as HTMLSelectElement;
    if (sel.value) void showDay(sel.value);
  };
  momentsEl.onclick = (ev) => {
    const b = (ev.target as Element | null)?.closest<HTMLButtonElement>('[data-moment]');
    const m = b ? list[Number(b.dataset.moment)] : undefined;
    if (m) clock.seek(m.at - LEAD_MS);
  };

  // The scrubber shows one UTC day. A drag on it moves the time.
  let shownDay: string | null = null;
  function seekAt(ev: PointerEvent): void {
    if (!shownDay) return;
    const r = track.getBoundingClientRect();
    const f = Math.min(1, Math.max(0, (ev.clientX - r.left) / r.width));
    clock.seek(dayStart(shownDay) + f * DAY_MS);
  }
  let dragging = false;
  track.addEventListener('pointerdown', (ev) => {
    dragging = true;
    track.setPointerCapture(ev.pointerId);
    seekAt(ev);
  });
  track.addEventListener('pointermove', (ev) => {
    if (dragging) seekAt(ev);
  });
  track.addEventListener('pointerup', () => (dragging = false));
  track.addEventListener('pointercancel', () => (dragging = false));

  function drawDays(): void {
    const all = model.days.filter((d) => DATE.test(d));
    const recent = all.slice(-DAY_BUTTONS);
    const earlier = all.slice(0, Math.max(0, all.length - DAY_BUTTONS));
    const select = earlier.length
      ? `<select class="yq-btn yq-rp-earlier" aria-label="An earlier day"><option value="">Earlier</option>${earlier
          .map((d) => `<option value="${d}">${fmtDay(dayStart(d))}</option>`)
          .join('')}</select>`
      : '';
    days.innerHTML = `${select}<div class="yq-seg">${recent
      .map(
        (d) =>
          `<button class="yq-btn" type="button" data-day="${d}">${fmtDay(dayStart(d))}</button>`,
      )
      .join('')}</div>`;
  }

  function drawDay(day: string): void {
    const t0 = dayStart(day);
    const inDay = (t: number): boolean => t >= t0 && t < t0 + DAY_MS;
    const pos = (t: number): string => (((t - t0) / DAY_MS) * 100).toFixed(3);
    let html = '';
    // No data: before the first loaded event, and after the last export.
    if (model.start > t0) {
      html += `<i class="yq-rp-none" style="left:0;width:${pos(Math.min(model.start, t0 + DAY_MS))}%"></i>`;
    }
    if (model.asOf < t0 + DAY_MS) {
      const a = Math.max(model.asOf, t0);
      html += `<i class="yq-rp-after" style="left:${pos(a)}%;width:${(100 - Number(pos(a))).toFixed(3)}%" title="After the last export"></i>`;
    }
    // The openings: each new event that YALDAQ saw, and the next ones it expects.
    for (const e of model.events) {
      if (e.actor === 'brief' && e.kind === 'brief' && inDay(e.at)) {
        html += `<i class="yq-rp-open" style="left:${pos(e.at)}%" title="${esc(e.series ?? 'New event')} opens"></i>`;
      }
    }
    for (const o of model.openings) {
      if (inDay(o.at)) {
        html += `<i class="yq-rp-open" style="left:${pos(o.at)}%" title="${esc(o.series)} opens"></i>`;
      }
    }
    for (const m of list) {
      if (inDay(m.at)) {
        html += `<i class="yq-rp-mark yq-mk-${m.kind}" style="left:${pos(m.at)}%" title="${esc(m.label)}"></i>`;
      }
    }
    marks.innerHTML = html;
    // The moment buttons of the shown day only.
    momentsEl.innerHTML = list
      .map((m, i) =>
        inDay(m.at)
          ? `<button class="yq-btn yq-mo-${m.kind}" type="button" data-moment="${i}"><b>${fmtClock(m.at)}</b> ${esc(m.label)}</button>`
          : '',
      )
      .join('');
  }

  let lastLabel = '';
  let lastKey = '';
  function update(): void {
    const t = clock.t;
    const day = dayOf(t);
    if (day !== shownDay) {
      shownDay = day;
      drawDay(day);
      lastKey = '';
    }
    thumb.style.left = `${(((t - dayStart(day)) / DAY_MS) * 100).toFixed(3)}%`;
    const label = fmtWhen(t, true);
    if (label !== lastLabel) time.textContent = lastLabel = label;
    const tag = opts.state();
    const key = `${clock.playing}|${clock.speed}|${clock.live}|${day}|${tag}`;
    if (key === lastKey) return;
    lastKey = key;
    play.textContent = clock.playing ? '❚❚' : '▶';
    for (const b of speedBtns) b.classList.toggle('on', Number(b.dataset.speed) === clock.speed);
    for (const b of days.querySelectorAll<HTMLButtonElement>('[data-day]')) {
      b.classList.toggle('on', b.dataset.day === day);
    }
    const sel = days.querySelector<HTMLSelectElement>('select');
    if (sel) {
      const earlier = [...sel.options].some((o) => o.value === day);
      sel.value = earlier ? day : '';
      sel.classList.toggle('on', earlier);
    }
    liveBtn.classList.toggle('on', clock.live);
    state.innerHTML = tag;
  }

  function setModel(m: Model): void {
    model = m;
    list = findMoments(m);
    drawDays();
    shownDay = null;
    lastKey = '';
    update();
  }
  const off = clock.onChange(() => update());
  setModel(model);

  return {
    root,
    setModel,
    update,
    destroy() {
      off();
      root.remove();
    },
  };
}
