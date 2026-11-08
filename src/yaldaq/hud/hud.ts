// The overlays of the firm: the two pills, the "last 24 hours" strip, the folding dock with the
// replay bar, and the hint. They sit on top of the room. The room's top and bottom insets keep
// the room clear of them.
//
// With no model (the feed connects, is empty, or does not answer), only the time pill shows,
// with the state of the feed.
import type { Clock } from '../data/clock';
import type { Feed, FeedStatus } from '../data/feed';
import { dayOf, fmtClock, fmtCountdown, fmtDay } from '../data/format';
import { LIVE_DELAY_MS, STALE_FEED_MS, recent, type Model, type State } from '../data/model';
import { esc } from '../data/text';
import type { FirmStage } from '../scene/stage';
import { setHTML } from './dom';
import { recentHTML } from './html';
import { createReplayBar, type ReplayBar } from './replay';

export interface Hud {
  /** The lowest edge of the top overlays, in px. The speech bubbles stay under it. */
  readonly topEdge: number;
  /** The elements whose size changes the insets. */
  readonly observed: readonly HTMLElement[];
  /** Measures the overlays and sets the room's insets. */
  updateInsets(): void;
  /** The pills with no model: the state of the feed. */
  showStatus(status: Exclude<FeedStatus, 'live'>): void;
  /** A new model (or the first). The clock exists from the first model on. */
  setModel(model: Model, clock: Clock): void;
  /** The pills and the strip at the shown time. */
  applyState(s: State): void;
  /** Call each frame. */
  update(): void;
  /** The firm shows for the first time: the hint goes after a few seconds. */
  shown(): void;
}

const STATUS_WORDS: Record<Exclude<FeedStatus, 'live'>, [string, string]> = {
  connecting: ['Connecting', 'Loading the feed.'],
  empty: ['No news yet', 'The feed has no data yet. The page checks each minute.'],
  offline: ['Offline', 'The feed did not answer. The page tries again each minute.'],
};

/** The first part of a series name: "Truth Social posts, daily" gives "Truth Social posts". */
const short = (series: string): string => series.split(',')[0] ?? '';

export function createHud(host: HTMLElement, opts: { stage: FirmStage; feed: Feed }): Hud {
  const $ = (id: string): HTMLElement => {
    const el = host.querySelector<HTMLElement>(`#${id}`);
    if (!el) throw new Error(`The firm has no #${id}.`);
    return el;
  };
  const el = {
    pillTime: $('yq-pill-time'),
    timeClock: $('yq-time-clock'),
    timeSub: $('yq-time-sub'),
    pillOpen: $('yq-pill-open'),
    openCount: $('yq-open-count'),
    openSub: $('yq-open-sub'),
    recent: $('yq-recent'),
    hint: $('yq-hint'),
    dock: $('yq-dock'),
    fold: $('yq-dock-fold'),
    bar: $('yq-dock-bar'),
  };
  const { stage, feed } = opts;
  let model: Model | null = null;
  let clock: Clock | null = null;
  let bar: ReplayBar | null = null;

  /** The state tag: live, replay, or "no news since" when the last export is old. */
  function stateTag(): string {
    if (!model || !clock) return '';
    if (!clock.live) return '<span class="yq-tag">Replay</span>';
    const nowMs = Date.now();
    if (nowMs - model.asOf > STALE_FEED_MS) {
      const day = dayOf(model.asOf) === dayOf(nowMs) ? '' : `${fmtDay(model.asOf)} `;
      return `<span class="yq-tag yq-quiet">No news since ${day}${fmtClock(model.asOf)} UTC</span>`;
    }
    return `<span class="yq-tag yq-live">Live, ${LIVE_DELAY_MS / 60e3} min behind</span>`;
  }

  // The dock folds to one button. It starts folded on a tall screen.
  let folded = innerWidth < innerHeight;
  let foldKey = '';
  function foldText(): void {
    const key = clock ? `${folded}|${clock.playing}|${clock.speed}|${clock.live}` : `${folded}`;
    if (key === foldKey) return;
    foldKey = key;
    el.fold.textContent = folded
      ? `▴ Replay ${clock?.playing ? `${clock.speed}x` : 'paused'}${clock?.live ? ', live' : ''}`
      : '▾ Hide';
  }
  function setFold(f: boolean): void {
    folded = f;
    el.dock.classList.toggle('folded', f);
    el.fold.setAttribute('aria-expanded', String(!f));
    foldText();
  }
  el.fold.onclick = () => setFold(!folded);
  setFold(folded);

  let topEdge = 0;
  function updateInsets(): void {
    const wide = innerWidth > innerHeight;
    const pillsBottom = Math.max(
      el.pillTime.getBoundingClientRect().bottom,
      el.pillOpen.hidden ? 0 : el.pillOpen.getBoundingClientRect().bottom,
    );
    // The last 24 hours: between the pills on a wide screen, under them on a tall screen.
    el.recent.style.top = wide ? '' : `${pillsBottom + 6}px`;
    const strip = el.recent.getBoundingClientRect();
    const stripBottom = strip.height ? strip.bottom : 0;
    topEdge = Math.max(pillsBottom, stripBottom) + 6;
    // Leave room at the top for the envelope tags over the vault.
    const top = Math.max(pillsBottom, stripBottom) + (wide ? 4 : 24);
    const d = el.dock.getBoundingClientRect();
    const bottom = d.height ? innerHeight - d.top + 4 : 0;
    stage.setInsets({ top, bottom, left: 0, right: 0 });
  }

  function showStatus(status: Exclude<FeedStatus, 'live'>): void {
    model = null;
    clock = null;
    bar?.destroy();
    bar = null;
    const [bold, sub] = STATUS_WORDS[status];
    el.timeClock.textContent = bold;
    el.timeSub.textContent = sub;
    el.pillOpen.hidden = true;
    el.dock.hidden = true;
    // With no data a tap opens nothing, so the hint does not ask for one.
    el.hint.hidden = true;
    setHTML(el.recent, '');
    updateInsets();
  }

  function setModel(m: Model, c: Clock): void {
    model = m;
    if (c !== clock || !bar) {
      bar?.destroy();
      clock = c;
      bar = createReplayBar(el.bar, { clock: c, feed, model: m, state: stateTag, compact: true });
      foldKey = '';
      foldText();
    } else bar.setModel(m);
    el.dock.hidden = false;
    el.hint.hidden = false;
    updateInsets();
  }

  function applyState(s: State): void {
    if (!model || !clock) return;
    const t = s.t;
    setHTML(
      el.recent,
      recentHTML(recent(model, t), { compact: true, row: innerWidth > innerHeight }),
    );
    el.timeClock.textContent = `${fmtClock(t, true)} UTC`;
    setHTML(el.timeSub, `${fmtDay(t)} ${stateTag()}`);
    const o = s.nextOpening;
    el.pillOpen.hidden = false;
    el.openCount.textContent = o ? `Next opening ${fmtCountdown(o.at - t)}` : 'No opening known';
    setHTML(
      el.openSub,
      o
        ? `${s.quiet ? '<span class="yq-tag yq-quiet">Quiet</span>' : ''}${esc(short(o.series))}<span class="yq-wide-only">, ${fmtClock(o.at)} UTC</span>`
        : s.quiet
          ? '<span class="yq-tag yq-quiet">Quiet</span>'
          : '',
    );
  }

  let hintShown = false;
  return {
    get topEdge() {
      return topEdge;
    },
    observed: [el.dock, el.pillTime, el.pillOpen, el.recent],
    updateInsets,
    showStatus,
    setModel,
    applyState,
    update() {
      if (!bar) return;
      bar.update();
      foldText();
    },
    shown() {
      if (hintShown) return;
      hintShown = true;
      setTimeout(() => el.hint.classList.add('gone'), 9000);
    },
  };
}
