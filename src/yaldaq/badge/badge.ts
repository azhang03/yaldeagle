// The staff badge: the visit card of one subject. update() writes only the parts that changed,
// so the buttons inside keep working between frames. act() glows the band when the subject
// has an event.
import './badge.css';
import type { Facts, Subject } from '../data/facts';
import { setHTML } from '../hud/dom';
import { badgeSections, infoOf, kindWord, metaHTML, photoSVG, type BadgeContext } from './content';

export interface Badge {
  readonly root: HTMLElement;
  /** Writes the badge of the subject at the shown time. A jump lights no tiles. */
  update(subject: Subject, f: Facts, ctx: BadgeContext, o?: { jumped?: boolean }): void;
  /** The subject acted: the band glows, and changed tiles light up. */
  act(): void;
  readonly subject: Subject | null;
}

/** A tile stays lit this long after its value changes (ms). */
const BUMP_MS = 1600;
/** A value that changes this soon after act() lights its tile (ms). */
const ACT_MS = 900;

/** Builds a badge in root. onClose: shows a close button on the band. */
export function mountBadge(root: HTMLElement, opts: { onClose?: () => void } = {}): Badge {
  const { onClose } = opts;
  root.classList.add('badge');
  root.innerHTML = `<div class="b-strap" aria-hidden="true"></div><div class="b-clip" aria-hidden="true"></div>
    <div class="b-card">
      <div class="b-band"><span class="b-slot"></span><span class="b-firm">YALDAQ</span><span class="b-kind"></span>${onClose ? '<button class="b-close" type="button" aria-label="Close">✕</button>' : ''}</div>
      <div class="b-scroll">
        <header class="b-head"><div class="b-photo"></div><div class="b-id"><div class="b-name"></div><div class="b-role"></div>
          <div class="b-status"><span class="b-light"></span><span class="b-stext"></span></div></div></header>
        <div class="b-meta"></div>
        <div class="b-sec b-tilebox"></div>
        <div class="b-sec b-shift"></div>
        <div class="b-sec b-widget"></div>
        <div class="b-sec b-logbox"></div>
      </div>
    </div>`;
  const q = (sel: string): HTMLElement => {
    const el = root.querySelector<HTMLElement>(sel);
    if (!el) throw new Error(`The badge has no ${sel}.`);
    return el;
  };
  const el = {
    card: q('.b-card'),
    kind: q('.b-kind'),
    photo: q('.b-photo'),
    name: q('.b-name'),
    role: q('.b-role'),
    light: q('.b-light'),
    stext: q('.b-stext'),
    meta: q('.b-meta'),
    tiles: q('.b-tilebox'),
    shift: q('.b-shift'),
    widget: q('.b-widget'),
    log: q('.b-logbox'),
    scroll: q('.b-scroll'),
  };
  let subject: Subject | null = null;
  let logMore = false;
  let notes = false;
  let prev = new Map<string, unknown>();
  let bumpedAt = new Map<string, number>();
  let actAt = -1e9;
  let last: [Subject, Facts, BadgeContext] | null = null;

  if (onClose) q('.b-close').addEventListener('click', onClose);
  root.addEventListener('click', (ev) => {
    const target = ev.target;
    const b = target instanceof Element ? target.closest<HTMLElement>('[data-act]') : null;
    if (!b) return;
    if (b.dataset.act === 'log') logMore = !logMore;
    if (b.dataset.act === 'notes') notes = !notes;
    if (last) update(...last);
  });

  function update(s: Subject, f: Facts, ctx: BadgeContext, o: { jumped?: boolean } = {}): void {
    last = [s, f, ctx];
    const now = performance.now();
    if (s !== subject) {
      subject = s;
      logMore = false;
      notes = false;
      prev = new Map();
      bumpedAt = new Map();
      actAt = -1e9;
      const info = infoOf(s);
      root.style.setProperty('--band', info.color);
      el.kind.textContent = kindWord(s);
      el.photo.innerHTML = photoSVG(s);
      el.name.textContent = info.name;
      el.role.textContent = info.role;
      el.meta.innerHTML = metaHTML(s);
      el.scroll.scrollTop = 0;
    }
    if (o.jumped) {
      prev = new Map();
      bumpedAt = new Map();
    }
    // A tile lights up when its value changes just after an event of the subject.
    const acted = now - actAt < ACT_MS;
    for (const st of f.stats) {
      if (st.unit !== 'ms' && acted && prev.has(st.key) && prev.get(st.key) !== st.value) {
        bumpedAt.set(st.key, now);
      }
      prev.set(st.key, st.value);
    }
    const bumped = new Set<string>();
    for (const [k, at] of bumpedAt) if (now - at < BUMP_MS) bumped.add(k);
    const parts = badgeSections(s, f, ctx, { notes, logMore, bumped });
    el.light.className = `b-light t-${f.status.tone}`;
    setHTML(el.stext, parts.status);
    setHTML(el.tiles, parts.tiles);
    setHTML(el.shift, parts.shift);
    setHTML(el.widget, parts.widget);
    setHTML(el.log, parts.log);
  }

  function act(): void {
    actAt = performance.now();
    el.card.classList.remove('glow');
    // Read the layout, so the glow animation starts again.
    void el.card.offsetWidth;
    el.card.classList.add('glow');
  }

  return {
    root,
    update,
    act,
    get subject() {
      return subject;
    },
  };
}
