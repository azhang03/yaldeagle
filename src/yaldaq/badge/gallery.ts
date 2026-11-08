// The dev gallery (`/?badges`, dev server only): all 16 staff badges at one time, for a check
// by eye. No 3D. It reads the dev feed and has buttons for the test moments.
import '../hud/firm.css';
import { createClock, type Clock } from '../data/clock';
import { SUBJECTS, factsFor, indexByActor, subjectEvents, type ActorIndex } from '../data/facts';
import { createFeed } from '../data/feed';
import { DEV_FEED_URL } from '../data/feed-paths';
import { fmtClock, fmtDay, ms } from '../data/format';
import { stateAt, type Model, type TimedEvent } from '../data/model';
import { mountBadge } from './badge';

const MOMENTS: readonly (readonly [string, string | null])[] = [
  ['Live', null],
  ['Sat 05:08, first call', '2026-11-07T05:08:50Z'],
  ['Sat 14:14, a fill', '2026-11-07T14:14:20Z'],
  ['Sat 15:14, second call', '2026-11-07T15:14:20Z'],
  ['Sat 18:20, the outage', '2026-11-07T18:20:00Z'],
  ['Sun 04:58, the unseal', '2026-11-08T04:58:30Z'],
  ['Sun 05:01, opened', '2026-11-08T05:01:00Z'],
];

const CSS = `
#yaldaq.yq-gallery { overflow: auto; background: #121a33; }
#yaldaq .gal-bar { position: sticky; top: 0; z-index: 10; display: flex; flex-wrap: wrap;
  align-items: center; gap: 6px 12px; padding: 8px 14px; background: #f8f1e2;
  border-bottom: 3px solid #5a3825; color: #1b2547; font-size: 13px; }
#yaldaq .gal-bar h1 { margin: 0; font: 700 17px Georgia, serif; }
#yaldaq .gal-time { font-variant-numeric: tabular-nums; }
#yaldaq .gal-time b { font-size: 15px; }
#yaldaq .gal-btns { display: flex; flex-wrap: wrap; gap: 5px; }
#yaldaq .gal-btns .yq-btn { min-height: 32px; font-size: 12px; padding: 2px 9px; }
#yaldaq .gal { columns: 340px; column-gap: 22px; padding: 6px 18px 30px; }
#yaldaq .gal-item { break-inside: avoid; display: inline-block; width: 100%; padding-top: 40px;
  overflow: hidden; }
#yaldaq .gal-item .b-strap { height: 30px; }
`;

/** Fills `host` with the gallery. The host must be shown (data-active="true"). */
export function mountGallery(host: HTMLElement): void {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.appendChild(style);
  host.classList.add('yq-gallery');
  host.innerHTML = `<header class="gal-bar"><h1>All staff badges</h1><span class="gal-time">Loading the feed...</span><div class="gal-btns"></div></header><main class="gal"></main>`;
  const timeEl = host.querySelector<HTMLElement>('.gal-time');
  const btns = host.querySelector<HTMLElement>('.gal-btns');
  const gal = host.querySelector<HTMLElement>('.gal');
  if (!timeEl || !btns || !gal) return;

  const badges = SUBJECTS.map((subject) => {
    const item = document.createElement('div');
    item.className = 'gal-item';
    const el = document.createElement('section');
    el.dataset.subject = subject;
    item.appendChild(el);
    gal.appendChild(item);
    return { subject, badge: mountBadge(el) };
  });

  const feed = createFeed(DEV_FEED_URL);
  let model: Model | null = null;
  let by: ActorIndex = {};
  let calls: TimedEvent[] = [];
  let clock: Clock | null = null;

  const button = (text: string, fn: () => void): HTMLButtonElement => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'yq-btn';
    b.textContent = text;
    b.onclick = fn;
    btns.appendChild(b);
    return b;
  };
  for (const [label, iso] of MOMENTS) {
    button(label, () => (iso ? clock?.seek(ms(iso)) : clock?.goLive()));
  }
  const play = button('Pause', () => clock?.toggle());
  const speeds = ([1, 10, 60] as const).map((s) => button(`${s}x`, () => clock?.setSpeed(s)));
  const showControls = (c: Clock): void => {
    play.textContent = c.playing ? 'Pause' : 'Play';
    speeds.forEach((b, i) => b.classList.toggle('on', [1, 10, 60][i] === c.speed));
  };

  feed.onChange(() => {
    const m = feed.model;
    if (!m) {
      timeEl.textContent = `Feed: ${feed.status}`;
      return;
    }
    model = m;
    by = indexByActor(m);
    calls = m.events.filter((e) => e.kind === 'call');
    if (!clock) {
      clock = createClock(() => ({ start: model?.start ?? m.start, end: model?.end ?? m.end }));
      clock.onChange(showControls);
      showControls(clock);
    }
  });
  feed.start();

  let last = performance.now();
  const frame = (): void => {
    const now = performance.now();
    const dt = Math.min(1, (now - last) / 1000);
    last = now;
    if (!model || !clock) return;
    const m = model;
    const { from, to, jumped } = clock.tick(dt);
    const state = stateAt(m, to);
    for (const { subject, badge } of badges) {
      if (!jumped) {
        const ended =
          subject === 'claude' &&
          calls.some((e) => (e.end ?? e.at) > from && (e.end ?? e.at) <= to);
        if (ended || subjectEvents(m, subject, from, to).length) badge.act();
      }
      badge.update(
        subject,
        factsFor(subject, m, to, { by, state }),
        { model: m, state, t: to },
        {
          jumped,
        },
      );
    }
    timeEl.innerHTML = `<b>${fmtClock(to, true)} UTC</b> ${fmtDay(to)}, ${clock.live ? 'live' : 'replay'}`;
  };
  setInterval(frame, 250);
}
