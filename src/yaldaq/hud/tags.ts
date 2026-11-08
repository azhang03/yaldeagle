// Floating tags over the room: the names of the characters, their speech bubbles, and the
// envelope tags. The tags follow the 3D points on the screen each frame.
import { Vector3 } from 'three';
import { esc } from '../data/text';
import { OPEN_TAG_MS } from '../data/stages';
import type { Character } from '../scene/cast';
import type { CastActor, Token } from '../scene/envelopes';
import { at } from '../scene/kit';
import type { Locker } from '../scene/props';
import type { Layout } from '../scene/set';
import type { FirmStage } from '../scene/stage';

export interface Tags {
  /** Shows a speech bubble over the actor for secs seconds of wall time. */
  say(
    actor: CastActor,
    text: string | null | undefined,
    opts?: { err?: boolean; secs?: number },
  ): void;
  /** Hides every bubble (a jump). */
  clearBubbles(): void;
  /** Sets the content of the tag of an envelope. */
  setEnvTag(id: string, html: string, open: boolean): void;
  /** Places every tag for this frame. */
  position(f: {
    tokens: ReadonlyMap<string, Token>;
    layout: Layout;
    t: number;
    /** The token that the unseal moves: its tag hides. */
    busy: Token | null;
    /** A visit hides the names and the envelope tags. */
    visiting: boolean;
    /** The top edge for the bubbles, in px: the bottom of the pills. */
    top: number;
  }): void;
}

interface Item {
  el: HTMLElement;
  w: number;
  h: number;
  x: number;
  y: number;
}

const GAP = 4;
const overlaps = (a: Item, b: Item): boolean =>
  a.x < b.x + b.w + GAP && b.x < a.x + a.w + GAP && a.y < b.y + b.h + GAP && b.y < a.y + a.h + GAP;

/**
 * Items that would overlap move up, the lowest first. An item that would go above `top` moves
 * down under the item in its way instead, so no bubble goes under the pills.
 */
function stackUp(live: Item[], top = -Infinity): void {
  live.sort((p, q) => q.y - p.y);
  const placed: Item[] = [];
  for (const it of live) {
    const y0 = Math.max(it.y, top);
    it.y = y0;
    for (let moved = true; moved;) {
      moved = false;
      for (const o of placed) {
        if (overlaps(it, o)) {
          it.y = o.y - it.h - GAP;
          moved = true;
        }
      }
    }
    if (it.y < top) {
      it.y = y0;
      for (let moved = true, n = 0; moved && n < 20; n++) {
        moved = false;
        for (const o of placed) {
          if (overlaps(it, o)) {
            it.y = o.y + o.h + GAP;
            moved = true;
          }
        }
      }
    }
    placed.push(it);
    it.el.style.transform = `translate(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px)`;
  }
}

export function createTags(
  layer: HTMLElement,
  deps: {
    stage: FirmStage;
    chars: Readonly<Record<CastActor, Character>>;
    actors: readonly CastActor[];
    locker: Locker;
    /** A tap on an envelope tag. */
    onEnvTap?: (id: string) => void;
  },
): Tags {
  const { stage, chars, actors, locker } = deps;
  function makeTag<K extends 'div' | 'button'>(
    tag: K,
    cls: string,
    html = '',
  ): HTMLElementTagNameMap[K] {
    const el = document.createElement(tag);
    el.className = cls;
    el.innerHTML = html;
    layer.appendChild(el);
    return el;
  }
  const names = new Map<CastActor, HTMLElement>();
  for (const a of actors) names.set(a, makeTag('div', 'yq-name', esc(chars[a].info.name)));
  const bubbles = new Map<CastActor, { el: HTMLElement; until: number; w: number; h: number }>();
  const envTags = new Map<string, HTMLButtonElement>();

  function screenOf(p: Vector3): { x: number; y: number; off: boolean } {
    const s = stage.toScreen(p);
    const { width, height } = stage.size();
    const off = s.behind || s.x < -40 || s.x > width + 40 || s.y < -40 || s.y > height + 40;
    return { x: s.x, y: s.y, off };
  }

  const tmp = new Vector3();
  return {
    say(actor, text, { err = false, secs = 2.6 } = {}) {
      if (!text) return;
      let b = bubbles.get(actor);
      if (!b) {
        b = { el: makeTag('div', 'yq-bubble'), until: 0, w: 0, h: 0 };
        bubbles.set(actor, b);
      }
      b.el.textContent = text;
      b.el.classList.toggle('err', err);
      b.el.style.display = '';
      b.el.style.opacity = '1';
      b.until = performance.now() / 1000 + secs;
      b.w = b.el.offsetWidth;
      b.h = b.el.offsetHeight;
    },
    clearBubbles() {
      for (const b of bubbles.values()) b.until = 0;
    },
    setEnvTag(id, html, open) {
      let el = envTags.get(id);
      if (!el) {
        el = makeTag('button', 'yq-envtag');
        el.type = 'button';
        el.style.display = 'none';
        const tap = deps.onEnvTap;
        if (tap) el.onclick = () => tap(id);
        envTags.set(id, el);
      }
      if (el.innerHTML !== html) el.innerHTML = html;
      el.classList.toggle('open', open);
    },
    position({ tokens, layout, t, busy, visiting, top }) {
      const now = performance.now() / 1000;
      const { width } = stage.size();
      const live: Item[] = [];
      for (const a of actors) {
        const c = chars[a];
        const n = names.get(a);
        if (n) {
          if (c.root.visible && !visiting) {
            const s = screenOf(c.root.position);
            n.style.display = s.off ? 'none' : '';
            n.style.transform = `translate(${(s.x - n.offsetWidth / 2).toFixed(1)}px, ${(s.y + 6).toFixed(1)}px)`;
          } else n.style.display = 'none';
        }
        const b = bubbles.get(a);
        if (!b) continue;
        if (now > b.until || !c.root.visible) {
          b.el.style.opacity = '0';
          if (now > b.until + 0.3) b.el.style.display = 'none';
          continue;
        }
        const p = c.anchor('head');
        p.y += 0.3;
        const s = screenOf(p);
        if (s.off) {
          b.el.style.display = 'none';
          continue;
        }
        b.el.style.display = '';
        const x = Math.min(width - b.w - 4, Math.max(4, s.x - b.w / 2));
        live.push({ el: b.el, w: b.w, h: b.h, x, y: s.y - b.h - 8 });
      }
      stackUp(live, top);

      // The envelope tags: under the locker wall for a waiting envelope (so the wall screen
      // stays clear), or over a moving one. They hide during a visit and while the unseal
      // plays. An opened envelope shows its tag for OPEN_TAG_MS.
      for (const [id, el] of envTags) {
        if (!tokens.has(id)) {
          el.remove();
          envTags.delete(id);
        }
      }
      const below: (Item & { i: number })[] = [];
      const above: Item[] = [];
      for (const tok of tokens.values()) {
        const el = envTags.get(tok.env.id);
        if (!el) continue;
        const resting = !tok.trip && (tok.stage === 'locker' || tok.stage === 'open');
        const hide =
          !tok.obj.visible ||
          visiting ||
          busy === tok ||
          !el.firstChild ||
          t >= tok.env.opensAt + OPEN_TAG_MS;
        if (hide) {
          el.style.display = 'none';
          continue;
        }
        const tagAt = layout.tagAt;
        const slot = locker.cub[tok.i ?? 0]?.slot ?? [0, 0, 0];
        const p = !resting
          ? tmp.copy(tok.obj.position).setY(tok.obj.position.y + 0.3)
          : tagAt
            ? at(...tagAt)
            : locker.root.localToWorld(tmp.set(slot[0], 0.02, 0.3));
        el.classList.toggle('compact', !!tagAt);
        const s = screenOf(p);
        if (s.off) {
          el.style.display = 'none';
          continue;
        }
        el.style.display = '';
        // A tag over a moving envelope must not catch a tap meant for the character under it.
        el.style.pointerEvents = resting ? '' : 'none';
        const w = el.offsetWidth;
        const h = el.offsetHeight;
        const x = Math.min(width - w - 4, Math.max(4, s.x - w / 2));
        if (resting) below.push({ el, w, h, x, y: s.y + 6, i: tok.i ?? 0 });
        else above.push({ el, w, h, x, y: s.y - h - 6 });
      }
      stackUp(above);
      // Under the locker the tags go down in the cubby order.
      below.sort((p, q) => p.i - q.i);
      let yNext = -Infinity;
      for (const it of below) {
        it.y = Math.max(it.y, yNext);
        yNext = it.y + it.h + GAP;
        it.el.style.transform = `translate(${it.x.toFixed(1)}px, ${it.y.toFixed(1)}px)`;
      }
    },
  };
}
