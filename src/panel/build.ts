// Builds the item panel like a small steel frame building.
// The content reads top to bottom, so the build goes bottom up. The title block is the roof, and it lands last.
// The styles are in panel.css.
import './panel.css';
import { escapeHtml as esc } from './content';
import type { PanelContent } from './content';

// Layout in px. The build needs room at the sides (scaffold) and at the top (sign).
const SIDE = 40; // side margin of the panel while it builds
const TOP = 56; // free space above the panel
const GROUND = 28; // free space below the panel band (room for the foundation under a tall panel)
const EDGE = 26; // side margin of the finished panel
const MAX_W = 600; // width limit of the finished panel
const BP_PAD = 10; // the blueprint sheet is this much larger than the panel
const LOCKED_LEAD = 'Nick has not earned this yet.';
const BOUNCE = 'cubic-bezier(.3,1.45,.6,1)';
const SETTLE = 'cubic-bezier(.3,.8,.3,1)';

// Durations in ms at speed 1 for the locked end.
const LOCKED_TIMES = { lvlGap: 150, lvlDur: 220, hoard: 380, fin: 460, textGap: 90, textDur: 220 };

const SVGNS = 'http://www.w3.org/2000/svg';
const BRACE = `<svg class="pb-x" viewBox="0 0 10 10" preserveAspectRatio="none"><line x1="0" y1="10" x2="10" y2="0"/><line x1="0" y1="0" x2="10" y2="10"/></svg>`;

interface Instance {
  finished: Promise<void>;
  skip(): void;
  demolish(): Promise<void>;
  kill(): void;
}
const live = new WeakMap<HTMLElement, Instance>();

interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Line {
  x0: number;
  x1: number;
  y: number;
  h: number;
}
interface Floor {
  el: HTMLElement;
  y: number;
  h: number;
}
interface Geometry {
  W: number;
  HH: number;
  wf: number;
  H: number;
  s: number;
  ground: number;
  box: Box;
  fin: Box;
  floors: Floor[];
  lines: Line[];
  boxes: Box[];
}

/** The shared state of one build. */
interface Ctx {
  root: HTMLElement;
  frame: HTMLElement;
  skin: HTMLElement;
  scroll: HTMLElement;
  stage: HTMLElement;
  found: HTMLElement;
  close: HTMLElement;
  bpLayer: HTMLElement;
  fx: HTMLElement;
  slabs: HTMLElement[];
  g: Geometry;
  speed: number;
  skip: () => void;
  locked: boolean;
  status: PanelContent['status'];
  bp?: HTMLElement;
}

type Props = Record<string, string | number>;
type Point = readonly [number, Props, string?];
type Timeline = ReturnType<typeof makeTimeline>;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  parent?: Element,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (parent) parent.append(e);
  return e;
}

// A temporary element: the finished panel does not keep it.
function temp<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  cls?: string,
  parent?: Element,
): HTMLElementTagNameMap[K] {
  const e = el(tag, cls, parent);
  e.dataset.temp = '';
  return e;
}

function svg(
  tag: string,
  parent: Element,
  attrs: Record<string, string | number> = {},
): SVGElement {
  const e = document.createElementNS(SVGNS, tag) as SVGElement;
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  parent.append(e);
  return e;
}

const px = (v: number): string => `${Math.round(v * 100) / 100}px`;
const geo = (b: Box) => ({ left: px(b.x), top: px(b.y), width: px(b.w), height: px(b.h) });
const place = (e: HTMLElement, b: Box): void => void Object.assign(e.style, geo(b));

// All moves of one build, made at the start with Web Animations. Times are in ms at speed 1.
// Each animation fills both ways, so an element shows its first frame until its move starts.
// Rule: one animation for each element and property. Use track() for a property that moves more than once.
function makeTimeline(speed: number) {
  const k = 1 / Math.max(0.05, speed);
  const anims: Animation[] = [];
  let end = 0;
  const push = (a: Animation, t: number): Animation => {
    anims.push(a);
    end = Math.max(end, t);
    return a;
  };
  return {
    anims,
    get end() {
      return end;
    },
    add(e: Element, frames: Keyframe[], at: number, dur: number, easing = 'ease-out'): Animation {
      const d = Math.max(1, dur);
      const opts: KeyframeAnimationOptions = {
        delay: at * k,
        duration: d * k,
        easing,
        fill: 'both',
      };
      return push(e.animate(frames, opts), at + d);
    },
    // points: [time, props, easing to the next point]. Each point must name the same properties.
    track(e: Element, points: readonly Point[]): Animation {
      const first = points[0];
      const last = points[points.length - 1];
      if (!first || !last) throw new Error('track needs points');
      const t0 = first[0];
      const span = Math.max(1, last[0] - t0);
      const frames: Keyframe[] = points.map(([t, p, ease]) => ({
        ...p,
        offset: (t - t0) / span,
        easing: ease ?? 'ease-in-out',
      }));
      const opts: KeyframeAnimationOptions = { delay: t0 * k, duration: span * k, fill: 'both' };
      return push(e.animate(frames, opts), t0 + span);
    },
  };
}

// Content: the roof (title block) and one floor for each section. The "Try it" button goes on the last floor.
function fillStage(stage: HTMLElement, c: PanelContent): HTMLElement[] {
  const locked = c.status === 'locked';
  const label = esc(c.statusLabel);
  const roof = el('div', 'pb-floor pb-roof', stage);
  roof.innerHTML =
    `<span class="pb-area">${esc(c.area.name)}</span>` +
    `<p class="pb-item">Item: ${esc(c.itemName)}</p>` +
    `<h2 class="pb-title">${esc(c.title)}</h2>` +
    `<span class="pb-status ${esc(c.status)}">${locked ? `<span class="pb-glitch">${label}</span>` : label}</span>` +
    `<p class="pb-lead">${esc(locked ? LOCKED_LEAD : c.lead)}</p>` +
    (c.confirm ? `<p class="pb-confirm">To confirm with Nick: ${esc(c.confirm)}</p>` : '');
  const floors: HTMLElement[] = [roof];
  for (const sec of c.sections) {
    const f = el('div', 'pb-floor', stage);
    f.innerHTML = `<h3>${esc(sec.heading)}</h3><div class="pb-sec">${sec.html}</div>`;
    floors.push(f);
  }
  if (c.tryIt) {
    floors[floors.length - 1]?.insertAdjacentHTML(
      'beforeend',
      '<button class="pb-try" disabled>Try it (later)</button><p class="pb-small">A short practice set. Not built yet.</p>',
    );
  }
  return floors;
}

// Measures the content at the finished width. Returns the build box, the finished box, the floors,
// and the text lines for the blueprint. All values are in px of the root, at build scale.
function measure(root: HTMLElement, stage: HTMLElement, floorEls: HTMLElement[]): Geometry {
  const W = root.clientWidth;
  const HH = root.clientHeight;
  const wf = Math.max(200, Math.min(MAX_W, W - 2 * EDGE));
  stage.style.width = px(wf);
  const H = stage.offsetHeight;
  const hb = Math.max(120, HH - TOP - GROUND);
  const s = Math.min(1, (W - 2 * SIDE) / wf, hb / H);
  const hf = Math.min(H, hb);
  // The panel is centered in the band between TOP and GROUND. The foundation is under its bottom edge.
  const ground = TOP + (hb + hf) / 2;
  const box = { x: (W - wf * s) / 2, y: ground - H * s, w: wf * s, h: H * s };
  const fin = { x: (W - wf) / 2, y: ground - hf, w: wf, h: hf };
  const floors = floorEls.map((e) => ({ el: e, y: e.offsetTop * s, h: e.offsetHeight * s }));

  const sr = stage.getBoundingClientRect();
  const raw: Line[] = [];
  const range = document.createRange();
  const walk = document.createTreeWalker(stage, NodeFilter.SHOW_TEXT);
  for (let n = walk.nextNode() as Text | null; n; n = walk.nextNode() as Text | null) {
    if (!n.data.trim() || n.parentElement?.closest('.pb-area,.pb-status,.pb-try')) continue;
    range.selectNodeContents(n);
    for (const r of range.getClientRects()) {
      if (r.width > 3)
        raw.push({
          x0: r.left - sr.left,
          x1: r.right - sr.left,
          y: (r.top + r.bottom) / 2 - sr.top,
          h: r.height,
        });
    }
  }
  raw.sort((a, b) => a.y - b.y || a.x0 - b.x0);
  const lines: Line[] = [];
  for (const r of raw) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.y - r.y) < 5 && r.x0 <= last.x1 + 14) {
      last.x1 = Math.max(last.x1, r.x1);
      last.h = Math.max(last.h, r.h);
    } else lines.push({ ...r });
  }
  const boxes = [...stage.querySelectorAll('.pb-area,.pb-status,.pb-try,.pb-confirm')].map((e) => {
    const r = e.getBoundingClientRect();
    return { x: (r.left - sr.left) * s, y: (r.top - sr.top) * s, w: r.width * s, h: r.height * s };
  });
  for (const l of lines) Object.assign(l, { x0: l.x0 * s, x1: l.x1 * s, y: l.y * s, h: l.h * s });
  return { W, HH, wf, H, s, ground, box, fin, floors, lines, boxes };
}

// ---------- Stages ----------

// The blueprint sheet unrolls from the top, then the outline, the floor lines, and the text lines draw.
function blueprint(tl: Timeline, c: Ctx, at: number, unroll: number, draw: number): number {
  const { box, floors, lines, boxes, s } = c.g;
  const O = BP_PAD;
  const w = box.w + 2 * O;
  const h = box.h + 2 * O;
  const lay = el('div', 'pb-bp', c.bpLayer);
  place(lay, { x: box.x - O, y: box.y - O, w, h });
  lay.addEventListener('click', c.skip);
  c.bp = lay;
  const sheet = el('div', 'pb-sheet', lay);
  const roll = el('div', 'pb-roll', lay);
  const ease = 'cubic-bezier(.3,.7,.4,1)';
  tl.add(
    sheet,
    [{ clipPath: 'inset(0 0 100% 0)' }, { clipPath: 'inset(0 0 0% 0)' }],
    at,
    unroll,
    ease,
  );
  tl.track(roll, [
    [at, { translate: '0 0', opacity: 1 }, ease],
    [at + unroll, { translate: `0 ${px(h)}`, opacity: 1 }],
    [at + unroll + 140, { translate: `0 ${px(h + 8)}`, opacity: 0 }],
  ]);

  const sv = svg('svg', sheet, { width: w, height: h, viewBox: `0 0 ${w} ${h}` });
  const t0 = at + unroll * 0.6;
  const stroke = (d: string, len: number, width: number, t: number, dur: number, op = 1): void => {
    const p = svg('path', sv, {
      d,
      'stroke-width': width,
      'stroke-dasharray': `${len} ${len + 8}`,
      opacity: op,
    });
    tl.add(
      p,
      [{ strokeDashoffset: px(len + 4) }, { strokeDashoffset: '0px' }],
      t,
      dur,
      'ease-in-out',
    );
  };
  const rect = (b: Box, width: number, t: number, dur: number, op: number): void =>
    stroke(`M${b.x} ${b.y}h${b.w}v${b.h}h${-b.w}Z`, 2 * (b.w + b.h), width, t, dur, op);

  rect({ x: O, y: O, w: box.w, h: box.h }, 2, t0, draw * 0.35, 1);
  // Dimension lines in the margin: one along the left side with a tick at each floor, one along the top.
  const dx = O * 0.45;
  let d = `M${dx} ${O}V${O + box.h}`;
  let len = box.h;
  for (const f of [...floors, { y: box.h }]) {
    d += `M${dx - 3} ${O + f.y}h6`;
    len += 6;
  }
  stroke(d, len, 1, t0 + draw * 0.1, draw * 0.4, 0.75);
  stroke(
    `M${O} ${dx}H${O + box.w}M${O} ${dx - 3}v6M${O + box.w} ${dx - 3}v6`,
    box.w + 12,
    1,
    t0 + draw * 0.1,
    draw * 0.4,
    0.75,
  );
  floors.slice(1).forEach((f, i) => {
    stroke(
      `M${O} ${O + f.y}H${O + box.w}`,
      box.w,
      1.4,
      t0 + draw * (0.15 + 0.05 * i),
      draw * 0.3,
      0.8,
    );
  });
  for (const b of boxes)
    rect({ x: O + b.x, y: O + b.y, w: b.w, h: b.h }, 1.2, t0 + draw * 0.3, draw * 0.3, 0.85);
  const n = Math.max(1, lines.length - 1);
  lines.forEach((l, i) => {
    const width = Math.max(1, (l.h > 24 * s ? 3.4 : 1.8) * Math.max(0.6, s));
    stroke(
      `M${O + l.x0} ${O + l.y}H${O + l.x1}`,
      l.x1 - l.x0,
      width,
      t0 + draw * (0.3 + (0.45 * i) / n),
      draw * 0.25,
      0.9,
    );
  });
  return t0 + draw;
}

function blueprintFade(tl: Timeline, c: Ctx, at: number, dur: number): void {
  if (c.bp) tl.add(c.bp, [{ opacity: 1 }, { opacity: 0 }], at, dur, 'ease-in');
}

// Concrete pours from a chute and spreads out from the center.
function foundation(tl: Timeline, c: Ctx, at: number, dur: number): number {
  const { box, ground } = c.g;
  tl.add(
    c.found,
    [{ clipPath: 'inset(0 50% 0 50%)' }, { clipPath: 'inset(0 0% 0 0%)' }],
    at + dur * 0.15,
    dur * 0.85,
    SETTLE,
  );
  const pour = el('div', 'pb-pour', c.fx);
  Object.assign(pour.style, { left: px(box.x + box.w / 2), top: px(ground - 40) });
  tl.track(pour, [
    [at, { scale: '1 0', opacity: 1 }],
    [at + dur * 0.25, { scale: '1 1', opacity: 1 }],
    [at + dur * 0.75, { scale: '1 1', opacity: 1 }],
    [at + dur, { scale: '1 1', opacity: 0 }],
  ]);
  return at + dur;
}

// Two scaffold towers climb, one level for each floor, from the bottom up. Returns the end time.
function scaffoldUp(tl: Timeline, c: Ctx, at: number, gap: number, dur: number): number {
  const { box } = c.g;
  const sc = el('div', 'pb-scaf');
  if (!c.locked) sc.dataset.temp = '';
  c.frame.insertBefore(sc, c.skin);
  const towers = ['l', 'r'].map((side) => el('div', `pb-tower ${side}`, sc));
  const up = [...c.g.floors].reverse();
  up.forEach((f, i) => {
    const t = at + i * gap;
    const top = `${(f.y / box.h) * 100}%`;
    for (const tw of towers) {
      const lvl = el('div', 'pb-lvl', tw);
      Object.assign(lvl.style, { top, height: `${(f.h / box.h) * 100}%` });
      const inner = el('div', 'pb-lvl-in', lvl);
      inner.innerHTML = BRACE;
      el('div', 'pb-plank', inner);
      tl.add(inner, [{ scale: '1 0' }, { scale: '1 1' }], t, dur, BOUNCE);
    }
    if (i === 0) {
      for (const tw of towers) {
        const jack = el('div', 'pb-jack', tw);
        tl.add(jack, [{ scale: '1 0' }, { scale: '1 1' }], t - dur * 0.3, dur * 0.5, 'ease-out');
      }
    }
    const ledger = el('div', 'pb-ledger', sc);
    ledger.style.top = top;
    tl.add(ledger, [{ scale: '0 1' }, { scale: '1 1' }], t + dur * 0.4, dur * 0.7, 'ease-out');
  });
  return at + (up.length - 1) * gap + dur;
}

// From the build box (small if the text is long) to the finished box. Clip the content while it grows.
function growToFinal(tl: Timeline, c: Ctx, at: number, dur: number): number {
  const { box, fin, s } = c.g;
  if (Math.abs(box.w - fin.w) < 0.5 && Math.abs(box.h - fin.h) < 0.5) return at;
  const r = c.locked ? '4px' : '10px';
  c.scroll.animate([{ clipPath: `inset(0 round ${r})` }, { clipPath: `inset(0 round ${r})` }], {
    delay: at / Math.max(0.05, c.speed),
    duration: 1,
    fill: 'forwards',
  });
  tl.add(c.frame, [geo(box), geo(fin)], at, dur, SETTLE);
  tl.add(c.stage, [{ scale: String(s) }, { scale: '1' }], at, dur, SETTLE);
  return at + dur;
}

// The blueprint fades into the white card. The seams between the floors fade too.
function finish(tl: Timeline, c: Ctx, at: number, dur: number): number {
  blueprintFade(tl, c, at, dur * 0.8);
  tl.add(c.skin, [{ opacity: 0 }, { opacity: 1 }], at, dur * 0.8);
  for (const sl of c.slabs) tl.add(sl, [{ opacity: 1 }, { opacity: 0 }], at, dur * 0.6);
  const end = growToFinal(tl, c, at + dur * 0.3, dur * 0.7);
  tl.add(c.close, [{ opacity: 0 }, { opacity: 1 }], at + dur * 0.7, dur * 0.3);
  return Math.max(at + dur, end);
}

// In progress: a small scaffold stays on the roof with a sign.
function rig(tl: Timeline, c: Ctx, at: number, dur: number): number {
  const r = el('div', 'pb-rig', c.frame);
  r.innerHTML = `${BRACE}<i style="left:0"></i><i style="left:calc(50% - 1.5px)"></i><i style="right:0"></i><b></b>`;
  const sign = el('div', 'pb-sign', r);
  sign.textContent = 'In progress';
  tl.add(r, [{ scale: '1 0' }, { scale: '1 1' }], at, dur * 0.4, BOUNCE);
  tl.track(sign, [
    [at + dur * 0.3, { rotate: '-75deg', opacity: 0 }],
    [at + dur * 0.55, { rotate: '14deg', opacity: 1 }],
    [at + dur * 0.78, { rotate: '-6deg', opacity: 1 }],
    [at + dur, { rotate: '0deg', opacity: 1 }],
  ]);
  return at + dur;
}

// Locked: the build stops at the scaffold. A plywood hoarding goes up and shows the text.
function lockedEnd(tl: Timeline, c: Ctx, at: number): void {
  const p = LOCKED_TIMES;
  const t = scaffoldUp(tl, c, at, p.lvlGap, p.lvlDur);
  tl.track(c.skin, [
    [t, { scale: '1 0' }, 'cubic-bezier(.3,.8,.4,1)'],
    [t + p.hoard * 0.75, { scale: '1 1.03' }],
    [t + p.hoard, { scale: '1 1' }],
  ]);
  c.skin.querySelectorAll('.pb-tape').forEach((tape, i) => {
    tl.add(
      tape,
      [{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0% 0 0)' }],
      t + p.hoard * (0.7 + 0.25 * i),
      p.hoard * 0.6,
    );
  });
  blueprintFade(tl, c, t + p.hoard * 0.5, p.fin * 0.6);
  const tx = t + p.hoard;
  c.g.floors.forEach((f, i) => {
    tl.add(
      f.el,
      [
        { opacity: 0, translate: '0 6px' },
        { opacity: 1, translate: '0 0' },
      ],
      tx + i * p.textGap,
      p.textDur,
    );
  });
  const te = tx + (c.g.floors.length - 1) * p.textGap + p.textDur;
  growToFinal(tl, c, te - p.fin * 0.2, p.fin * 0.7);
  tl.add(c.close, [{ opacity: 0 }, { opacity: 1 }], te, p.fin * 0.3);
}

// A small puff of dust at (x, y) in root px.
function dust(tl: Timeline, layer: HTMLElement, x: number, y: number, at: number, n = 3): void {
  for (let i = 0; i < n; i++) {
    const d = el('div', 'pb-dust', layer);
    Object.assign(d.style, { left: px(x), top: px(y) });
    const dx = (i - (n - 1) / 2) * 12;
    tl.track(d, [
      [at, { translate: '0 0', scale: '0.3', opacity: 0 }, 'ease-out'],
      [at + 60, { translate: `${dx * 0.3}px -2px`, scale: '0.8', opacity: 0.9 }, 'ease-out'],
      [at + 480, { translate: `${dx}px ${-8 - (i % 2) * 5}px`, scale: '1.5', opacity: 0 }],
    ]);
  }
}

// Footings, steel columns, bolted I-beams, cladding panels, then a glass shine.
function steelBuild(tl: Timeline, c: Ctx): void {
  let t = blueprint(tl, c, 0, 300, 480);
  const { box, s } = c.g;
  const up = [...c.g.floors].reverse();
  const xs = [4, box.w / 2, box.w - 4]; // column centers, in frame px
  xs.forEach((x, i) => {
    const pad = temp('div', 'pb-pad');
    c.frame.insertBefore(pad, c.found);
    pad.style.left = px(x);
    tl.add(pad, [{ scale: '1 0' }, { scale: '1 1' }], t - 80 + i * 70, 220, BOUNCE);
  });
  t += 320;
  if (c.locked) {
    t = foundation(tl, c, t - 100, 320);
    lockedEnd(tl, c, t);
    return;
  }
  const steel = temp('div', 'pb-steel');
  c.frame.insertBefore(steel, c.skin);
  xs.forEach((x, i) => {
    const col = el('div', 'pb-col', steel);
    col.style.left = px(x);
    tl.add(
      col,
      [{ scale: '1 0' }, { scale: '1 1' }],
      t + i * 70,
      420,
      'cubic-bezier(.3,.9,.3,1.05)',
    );
  });
  t += 520;
  up.forEach((f, i) => {
    const tb = t + i * 110;
    const beam = el('div', 'pb-beam', steel);
    beam.style.top = px(f.y);
    tl.add(
      beam,
      [
        { translate: '0 -16px', opacity: 0 },
        { translate: '0 0', opacity: 1 },
      ],
      tb,
      150,
      'cubic-bezier(.5,0,.6,1.3)',
    );
    xs.forEach((x, j) => {
      for (const side of [-7, 7]) {
        const rv = el('div', 'pb-rivet', steel);
        Object.assign(rv.style, { left: px(x + side), top: px(f.y) });
        tl.add(
          rv,
          [
            { scale: '0', opacity: 0 },
            { scale: '1.7', opacity: 1, offset: 0.6 },
            { scale: '1', opacity: 1 },
          ],
          tb + 130 + j * 25,
          170,
        );
      }
    });
  });
  t += (up.length - 1) * 110 + 330;
  foundation(tl, c, t - 150, 300);
  up.forEach((f, i) => {
    const dir = i % 2 ? -1 : 1;
    tl.add(
      f.el,
      [
        { translate: `${px((dir * 70) / s)} 0`, opacity: 0 },
        { translate: `${px((-dir * 4) / s)} 0`, opacity: 1, offset: 0.75 },
        { translate: '0 0', opacity: 1 },
      ],
      t + i * 150,
      280,
      'ease-out',
    );
  });
  t += (up.length - 1) * 150 + 280;
  const end = finish(tl, c, t - 50, 420);
  // The steel hides behind the cladding. Fade it, because the beam ends stick out at the sides.
  tl.add(steel, [{ opacity: 1 }, { opacity: 0 }], t - 50, 250);
  const shine = temp('div', 'pb-shine', c.frame);
  tl.add(
    el('i', '', shine),
    [{ translate: '-120% 0' }, { translate: '330% 0' }],
    end - 120,
    560,
    'ease-in-out',
  );
  if (c.status === 'progress') rig(tl, c, end - 100, 600);
}

// ---------- Public API ----------

export function buildPanel(
  host: HTMLElement,
  content: PanelContent,
  opts: { speed?: number; onClose?: () => void } = {},
): { finished: Promise<void>; skip(): void; demolish(): Promise<void> } {
  const { speed = 1, onClose } = opts;
  live.get(host)?.kill();
  host.replaceChildren();

  const locked = content.status === 'locked';
  const root = el('div', `pb-root pb-building${locked ? ' pb-locked' : ''}`, host);
  root.style.setProperty('--area', content.area.color);
  root.style.setProperty('--pb-top', `${TOP}px`);
  root.style.setProperty('--pb-ground', `${GROUND}px`);
  root.style.setProperty('--pb-edge', `${EDGE}px`);
  root.style.setProperty('--pb-max-w', `${MAX_W}px`);
  const bpLayer = temp('div', 'pb-layer', root);
  const frame = el('div', 'pb-frame', root);
  const fx = temp('div', 'pb-layer', root);
  const skin = el('div', 'pb-skin', frame);
  if (locked) {
    el('div', 'pb-tape t', skin);
    el('div', 'pb-tape b', skin);
  }
  const scroll = el('div', 'pb-scroll', frame);
  const stage = el('div', 'pb-stage', scroll);
  const floorEls = fillStage(stage, content);
  const found = el('div', 'pb-found', frame);
  const close = el('button', 'pb-close', frame);
  close.type = 'button';
  close.setAttribute('aria-label', 'Close');
  close.textContent = '×';
  close.addEventListener('click', (e) => {
    e.stopPropagation();
    onClose?.();
  });
  const slabs = locked ? [] : floorEls.slice(0, -1).map((f) => temp('div', 'pb-slab', f));

  const g = measure(root, stage, floorEls);
  place(frame, g.box);
  stage.style.scale = String(g.s);

  let done = false;
  let killed = false;
  let demo: Promise<void> | null = null;
  let demoTl: Timeline | null = null;
  let resolveFinished: () => void = () => {};
  const finished = new Promise<void>((r) => (resolveFinished = r));
  const tl = makeTimeline(speed);

  // Sets the finished panel. The base styles of all kept elements are their final state,
  // so this works at any moment of the build.
  function commit(): void {
    if (done || killed) return;
    done = true;
    root.querySelectorAll('[data-temp]').forEach((e) => e.remove());
    frame.style.cssText = '';
    frame.classList.add('pb-final');
    stage.style.width = '';
    stage.style.scale = '';
    root.classList.remove('pb-building');
    for (const a of scroll.getAnimations()) a.cancel();
    for (const a of tl.anims) a.cancel();
    resolveFinished();
  }
  const skip = (): void => commit();
  const c: Ctx = {
    root,
    frame,
    skin,
    scroll,
    stage,
    found,
    close,
    bpLayer,
    fx,
    slabs,
    g,
    speed,
    skip,
    locked,
    status: content.status,
  };
  frame.addEventListener('click', () => !done && commit());

  steelBuild(tl, c);
  Promise.all(tl.anims.map((a) => a.finished)).then(commit, () => {});

  function demolish(): Promise<void> {
    if (demo) return demo;
    commit();
    if (killed) return Promise.resolve();
    const t2 = (demoTl = makeTimeline(speed));
    const fr = frame.getBoundingClientRect();
    const rr = root.getBoundingClientRect();
    const fe = [...stage.children];
    const gap = Math.min(40, 200 / fe.length);
    t2.add(close, [{ opacity: 1 }, { opacity: 0 }], 0, 100);
    fe.forEach((f, i) => {
      const r = i % 2 ? '-3deg' : '3deg';
      t2.add(
        f,
        [
          { translate: '0 0', rotate: '0deg', opacity: 1 },
          { translate: '0 44px', rotate: r, opacity: 0 },
        ],
        i * gap,
        260,
        'ease-in',
      );
    });
    t2.add(
      skin,
      [
        { opacity: 1, scale: '1 1' },
        { opacity: 0, scale: '1 0.7' },
      ],
      120,
      300,
      'ease-in',
    );
    for (const e of frame.querySelectorAll('.pb-rig,.pb-scaf')) {
      t2.add(
        e,
        [
          { opacity: 1, translate: '0 0' },
          { opacity: 0, translate: '0 30px' },
        ],
        100,
        320,
        'ease-in',
      );
    }
    t2.add(
      found,
      [
        { opacity: 1, scale: '1 1' },
        { opacity: 0, scale: '1 0' },
      ],
      380,
      180,
      'ease-in',
    );
    const layer = el('div', 'pb-layer', root);
    const y = fr.bottom - rr.top;
    for (let i = 0; i < 4; i++)
      dust(t2, layer, fr.left - rr.left + ((i + 0.5) / 4) * fr.width, y, 100, 3);
    const end = (): void => {
      root.remove();
      if (live.get(host) === inst) live.delete(host);
    };
    demo = Promise.all(t2.anims.map((a) => a.finished)).then(end, end);
    return demo;
  }

  function kill(): void {
    killed = true;
    for (const a of [...tl.anims, ...(demoTl?.anims ?? []), ...scroll.getAnimations()]) a.cancel();
    root.remove();
    resolveFinished();
    if (live.get(host) === inst) live.delete(host);
  }

  const inst: Instance = { finished, skip, demolish, kill };
  live.set(host, inst);
  return { finished, skip, demolish };
}
