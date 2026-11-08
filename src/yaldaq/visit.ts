// The visit: a tap on a character, the data vault, or the wall screen flies the camera close
// and opens the subject's staff badge beside it. Esc, the close button, or a tap on nothing
// goes back to the overview.
//
// The badge size sets the close view, so the badge is measured before the flight. Things
// between the camera and the subject hide during a visit. The unseal flies the camera to the
// vault with no badge; at its end the vault badge opens, if the camera is still there.
import { Vector3, type Object3D } from 'three';
import {
  SUBJECTS,
  factsFor,
  indexByActor,
  subjectEvents,
  type ActorIndex,
  type Subject,
} from './data/facts';
import type { Model, State, TimedEvent } from './data/model';
import { mountBadge } from './badge/badge';
import type { Character } from './scene/cast';
import type { CastActor } from './scene/envelopes';
import { AZ, at, clamp, deg, uvOf } from './scene/kit';
import type { Board, Console, Locker, TapeScreen } from './scene/props';
import type { FirmSet } from './scene/set';
import type { CameraState, FirmStage } from './scene/stage';

export interface Visit {
  /** The subject of the visit, or null in the overview. */
  readonly subject: Subject | null;
  /** Flies to the subject and opens its badge. */
  open(subject: Subject): void;
  /** Goes back to the overview. */
  leave(): void;
  /** The state at the shown time (a few times each second). It redraws the open badge. */
  render(state: State, jumped?: boolean): void;
  /** Each frame of play (not a jump): the band glows when the subject has an event. */
  frame(from: number, to: number): void;
  /** A jump: an unseal flight with no badge yet goes back, because no unseal plays now. */
  jumped(): void;
  /** The unseal starts. With no visit, the camera flies to the vault; the promise ends then. */
  unsealStarted(): Promise<void> | null;
  /** The unseal ends: the vault badge opens, if the camera flew for it and is still there. */
  unsealEnded(): void;
  /** The screen size or the layout changed. Returns true when a visit runs (it handled it). */
  resized(layoutChanged: boolean): boolean;
}

export interface VisitDeps {
  /** The #yaldaq container. It holds #yq-badge, #yq-hint, and the pills. */
  host: HTMLElement;
  stage: FirmStage;
  chars: Readonly<Record<CastActor, Character>>;
  actors: readonly CastActor[];
  /** The home point of each character in the current layout. */
  home: Readonly<Record<CastActor, Vector3>>;
  locker: Locker;
  board: Board;
  ops: Console;
  tape: TapeScreen;
  set(): FirmSet | null;
  /** The model of the feed, or null. */
  model(): Model | null;
  /** The overlays measure again after a visit. */
  updateInsets(): void;
  /** Runs when a visit starts or ends. */
  onChange(visiting: boolean): void;
}

/** The camera of a close view: low, but high enough to clear the glass rails and low walls. */
const POV = { fov: 40, el: deg(20) };
/**
 * The twin stands in a booth: a DEMO roof over it, and a counter and a glass rail in front.
 * A higher pitch looks over the counter and under the roof, so the twin shows. On a tall
 * screen the twin sits high in the view, so the pitch must be higher still.
 */
const EL_OF: Partial<Record<Subject, { wide: number; tall: number }>> = {
  demo: { wide: deg(34), tall: deg(40) },
};
const FLY_S = 1.2;
const BACK_S = 1.0;
/** The badge fades out in this time (ms); badge.css has the same time. */
const OUT_MS = 260;

type View = Subject | 'unseal';
interface Box {
  left: number;
  top: number;
  width: number;
  height: number;
}

const isSubject = (s: string): s is Subject => (SUBJECTS as readonly string[]).includes(s);

export function createVisit(deps: VisitDeps): Visit {
  const { host, stage, chars, actors, home, locker, board, ops, tape } = deps;
  const q = (sel: string): HTMLElement => {
    const el = host.querySelector<HTMLElement>(sel);
    if (!el) throw new Error(`The firm has no ${sel}.`);
    return el;
  };
  const badgeEl = q('#yq-badge');
  const hint = q('#yq-hint');
  const pills = [q('#yq-pill-time'), q('#yq-pill-open')];

  let subject: Subject | null = null;
  let view: View | null = null;
  let token = 0;
  let panelOpen = false;
  let box: Box | null = null;
  let state: State | null = null;
  /** The visit token of an unseal flight, or null when the camera did not fly for the unseal. */
  let unsealFlight: number | null = null;
  let shownSize = { w: innerWidth, h: innerHeight };

  // The index of the events by actor and the Claude calls, built once for each model.
  let indexed: Model | null = null;
  let by: ActorIndex = {};
  let calls: TimedEvent[] = [];
  function indexOf(m: Model): ActorIndex {
    if (m !== indexed) {
      indexed = m;
      by = indexByActor(m);
      calls = by.claude?.filter((e) => e.kind === 'call') ?? [];
    }
    return by;
  }

  const badge = mountBadge(badgeEl, { onClose: () => leave() });

  /** The world point, the middle height, and the width of a subject. */
  function subjectFrame(v: View): { p: Vector3; y: number; span: number } {
    if (v === 'vault' || v === 'unseal') {
      // The locker, with the wall screen behind it and the door in front.
      const l = uvOf(locker.root.position);
      const b = uvOf(board.root.position);
      const p = at(l.u, (l.v + b.v) / 2 + 0.3);
      return { p, y: v === 'unseal' ? 1.35 : 1.1, span: v === 'unseal' ? 4.4 : 3.6 };
    }
    if (v === 'board') {
      return { p: board.root.position.clone().add(at(0, 0.6)), y: board.mid, span: 3.6 };
    }
    return { p: home[v].clone(), y: chars[v].height * 0.55, span: 2.8 };
  }

  /**
   * The close view. The badge is only as big as its content, so the view uses its measured
   * box. Wide screen: the subject stands left of the middle, in the free part left of the
   * badge. Tall screen: the subject stands in the free part between the pills and the badge.
   * The unseal plays with no badge, so the vault is in the middle until the badge opens.
   */
  function closeView(v: View): CameraState {
    const { width, height } = stage.size();
    const a = width / height;
    const f = subjectFrame(v);
    const right = new Vector3(Math.cos(AZ), 0, -Math.sin(AZ));
    const g = f.p.clone().setY(f.y);
    const big = v === 'unseal' || v === 'vault' || v === 'board';
    const b = v === 'unseal' && !panelOpen ? null : box;
    let h: number;
    let fx = 0;
    let fy = 0;
    if (a >= 1) {
      if (b) {
        const free = clamp(b.left / width, 0.3, 0.8);
        h = Math.max(f.span / ((big ? 1.45 : 2) * free) / a, 1.2);
        fx = 2 * (free * (big ? 0.52 : 0.66) - 0.5);
      } else h = Math.max(f.span / 0.85 / a, 1.2);
      fy = 0.08;
    } else if (b) {
      const y0 = host.getBoundingClientRect().top;
      const pillsBottom = Math.max(...pills.map((p) => p.getBoundingClientRect().bottom)) - y0;
      const top = (pillsBottom + 8) / height;
      const bottom = clamp(b.top / height, top + 0.2, 0.95);
      h = Math.max(f.span / (big ? 1.9 : 2.6) / a, (big ? 1.5 : 0.85) / (bottom - top));
      fy = 1 - (top + bottom);
    } else {
      h = Math.max(f.span / 1.9 / a, 1.6);
      fy = -0.12;
    }
    const target = g.addScaledVector(right, -fx * h * a);
    target.y -= fy * h;
    const pitch = v === 'unseal' ? undefined : EL_OF[v];
    const el = pitch ? (a >= 1 ? pitch.wide : pitch.tall) : POV.el;
    return { target, az: AZ, el, fov: POV.fov, h };
  }

  /** The things that can stand between the camera and the subject. */
  function movable(): { key: string; objs: Object3D[]; p: Vector3; wide?: boolean }[] {
    const set = deps.set();
    return [
      ...actors.map((a) => ({ key: a, objs: [chars[a].root], p: home[a] })),
      ...(set?.pieces ?? []).map((x, i) => ({ key: `piece${i}`, objs: [x.obj], p: at(x.u, x.v) })),
      { key: 'console', objs: [ops.root], p: ops.root.position },
      { key: 'tape', objs: [tape.root], p: tape.root.position },
      { key: 'vault', objs: [locker.root], p: locker.root.position },
      { key: 'board', objs: [board.root], p: board.root.position, wide: true },
    ];
  }
  /** The close view is low, so everything in front of the subject and inside the view hides. */
  function hideBlockers(v: View): void {
    const f = subjectFrame(v);
    const toward = new Vector3(Math.sin(AZ), 0, Math.cos(AZ));
    const right = new Vector3(Math.cos(AZ), 0, -Math.sin(AZ));
    // The locker stays with the wall screen: the envelopes in its cubbies would float alone.
    const keep: string[] = v === 'unseal' || v === 'board' ? ['vault', 'board'] : [v];
    const { width, height } = stage.size();
    const halfWidth = (closeView(v).h * width) / height;
    for (const m of movable()) {
      const d = m.p.clone().sub(f.p);
      const along = d.dot(toward);
      const side = Math.abs(d.dot(right));
      const hide = !keep.includes(m.key) && along > 0.3 && side < halfWidth + (m.wide ? 3 : 0.6);
      for (const o of m.objs) o.visible = !hide;
    }
  }
  function showAll(): void {
    for (const m of movable()) for (const o of m.objs) o.visible = true;
  }

  /** Draws the badge at the shown time. False when there is no model to draw from. */
  function drawBadge(jumped = false): boolean {
    const m = deps.model();
    if (!m || !subject || !state) return false;
    const s = state;
    const f = factsFor(subject, m, s.t, { by: indexOf(m), state: s });
    badge.update(subject, f, { model: m, state: s, t: s.t }, { jumped });
    return true;
  }
  /** Renders the badge with no motion and returns its box on the screen, or null with no data. */
  function measureBadge(): Box | null {
    const was = badgeEl.hidden;
    badgeEl.hidden = false;
    badgeEl.classList.add('measure');
    const drawn = drawBadge();
    const r = badgeEl.querySelector('.b-card')?.getBoundingClientRect();
    badgeEl.classList.remove('measure');
    badgeEl.hidden = was;
    // The box is in the firm's container, which a view lift can move.
    const h0 = host.getBoundingClientRect();
    return drawn && r
      ? { left: r.left - h0.left, top: r.top - h0.top, width: r.width, height: r.height }
      : null;
  }
  function showPanel(): void {
    badgeEl.classList.remove('in', 'out');
    box = measureBadge();
    if (!box) return;
    panelOpen = true;
    badgeEl.hidden = false;
    // Read the layout, so the swing animation starts again.
    void badgeEl.offsetWidth;
    badgeEl.classList.add('in');
  }
  function hidePanel(): void {
    if (!panelOpen) return;
    panelOpen = false;
    badgeEl.classList.remove('in');
    badgeEl.classList.add('out');
    setTimeout(() => {
      if (panelOpen) return;
      badgeEl.hidden = true;
      badgeEl.classList.remove('out');
    }, OUT_MS);
  }

  function setSubject(s: Subject | null): void {
    const was = subject !== null;
    subject = s;
    host.classList.toggle('yq-visiting', s !== null);
    if (was !== (s !== null)) deps.onChange(s !== null);
  }

  /** Starts a visit. v: the camera subject ('unseal' frames the vault and the wall screen). */
  async function openVisit(s: Subject, v: View = s, panelNow = true): Promise<number> {
    // With no feed data there is no badge to show, so a tap does nothing.
    if (!deps.model()) return token;
    if (subject === s && view === v) return token;
    const my = ++token;
    hidePanel();
    setSubject(s);
    view = v;
    // The badge size sets the close view, so it is measured before the flight.
    box = panelNow ? measureBadge() : null;
    hint.classList.add('gone');
    showAll();
    hideBlockers(v);
    if (s !== 'vault' && s !== 'board') chars[s].pulse(chars[s].info.color);
    await stage.flyTo(() => closeView(v), FLY_S);
    if (my === token && panelNow) showPanel();
    return my;
  }

  function leave(): void {
    if (!subject) return;
    ++token;
    unsealFlight = null;
    hidePanel();
    setSubject(null);
    view = null;
    showAll();
    deps.updateInsets();
    void stage.flyTo(stage.overview, BACK_S);
  }

  stage.onTap((data) => {
    if (data && isSubject(data.subject)) void openVisit(data.subject);
    else if (subject) leave();
  });
  addEventListener('keydown', (ev) => {
    if (ev.key === 'Escape' && host.dataset.active === 'true') leave();
  });

  return {
    get subject() {
      return subject;
    },
    open: (s) => void openVisit(s),
    leave,
    render(s, jumped = false) {
      state = s;
      if (panelOpen) drawBadge(jumped);
    },
    frame(from, to) {
      const m = deps.model();
      if (!panelOpen || !subject || !m) return;
      indexOf(m);
      // The end of a Claude call is part of its event: the badge glows with its new numbers.
      const callEnded =
        subject === 'claude' && calls.some((e) => e.end != null && e.end > from && e.end <= to);
      if (callEnded || subjectEvents(m, subject, from, to).length) badge.act();
    },
    jumped() {
      if (view === 'unseal' && !panelOpen) leave();
      unsealFlight = null;
    },
    unsealStarted() {
      // The camera already waits at the vault for an earlier unseal: keep that flight, so the
      // badge opens at the end of this show.
      if (view === 'unseal' && !panelOpen && unsealFlight === token) return null;
      unsealFlight = null;
      if (subject) return null;
      return openVisit('vault', 'unseal', false).then((my) => {
        if (my === token && view === 'unseal') unsealFlight = my;
      });
    },
    unsealEnded() {
      const keep = unsealFlight !== null && unsealFlight === token && subject === 'vault';
      unsealFlight = null;
      if (!keep) return;
      showPanel();
      void stage.flyTo(() => closeView(view ?? 'vault'), 0.7);
    },
    resized(layoutChanged) {
      const size = { w: innerWidth, h: innerHeight };
      const changed = size.w !== shownSize.w || size.h !== shownSize.h;
      shownSize = size;
      if (!subject || !view) return false;
      if (layoutChanged) {
        showAll();
        hideBlockers(view);
      }
      if (changed || layoutChanged) {
        // A new screen size moves the badge, so the close view follows it.
        badgeEl.classList.remove('in');
        if (panelOpen) box = measureBadge();
        const v = view;
        void stage.flyTo(() => closeView(v), 0.4);
      }
      return true;
    },
  };
}
