// The YALDAQ firm: a modern quant firm at night. Each actor of YALDAQ is a character at its
// desk, and each event of the feed plays as a small act. The room fills the screen, and small
// overlays sit on top of it: the two pills, the "last 24 hours" strip, and the dock.
//
// Public rules: every motion that means "something happened" starts in react(), from an event
// of eventsBetween(), or from the event times of an envelope. A jump sets the end state with no
// motion. The envelope tags show counts only, never a number of the sealed contents.
import { Color, Vector3, type Object3D } from 'three';
import { createClock, type Clock } from './data/clock';
import type { Actor } from './data/contract';
import { createFeed } from './data/feed';
import { DEV_FEED_URL, FEED_URL } from './data/feed-paths';
import { eventsBetween, stateAt, type Model, type State, type TimedEvent } from './data/model';
import { boardAt } from './data/scores';
import { esc, eventText, jobStatus, mergeRuns } from './data/text';
import { fmtClock, fmtCountdown, fmtDay } from './data/format';
import { createHud } from './hud/hud';
import { createTags } from './hud/tags';
import { CAST, buildCharacter, playEvent, type Character } from './scene/cast';
import { createEnvelopes, type CastActor } from './scene/envelopes';
import { FACE_VIEWER, at, ease, smooth } from './scene/kit';
import {
  buildBlastDoor,
  buildBoard,
  buildConsole,
  buildLocker,
  buildTapeScreen,
  type BoardValues,
} from './scene/props';
import { LAYOUTS, PAL, buildSet, type FirmSet, type Spot } from './scene/set';
import { createFirmStage } from './scene/stage';
import { createUnseal } from './scene/unseal';

export interface Firm {
  setActive(active: boolean): void;
  inVisit(): boolean;
}

/** The actors with a character. The vault is the locker wall of the firm. */
const ACTORS = (Object.keys(CAST) as Actor[]).filter((a): a is CastActor => a !== 'vault');
const isCast = (a: Actor): a is CastActor => a !== 'vault';
/** In quiet hours, these read. The others nap. */
const READERS: Partial<Record<CastActor, true>> = {
  brief: true,
  claude: true,
  strike_rate: true,
  base_rate: true,
  shadow: true,
  reconcile: true,
};
/** Read counts come each minute and need no bubble. */
const QUIET_BUBBLE: Partial<Record<string, true>> = {
  'scanner.requests': true,
  'demo.requests': true,
};
/** The state, the pills, and the tags update this often (ms of wall time). */
const STATE_EVERY_MS = 200;
const EMPTY_BOARD: BoardValues = {
  claude: null,
  strike_rate: null,
  base_rate: null,
  markets: 0,
  latest: null,
  flash: 0,
  wipe: 0,
};

/** The first part of a series name: "Truth Social posts, daily" gives "Truth Social posts". */
const short = (series: string | null | undefined): string =>
  String(series ?? '').split(',')[0] ?? '';

const SKELETON = `
<div id="yq-stage"></div>
<div id="yq-tags"></div>
<div id="yq-pill-time" class="yq-pill yq-card"><b id="yq-time-clock">--:--:--</b><span id="yq-time-sub"></span></div>
<div id="yq-pill-open" class="yq-pill yq-card"><b id="yq-open-count">--</b><span id="yq-open-sub"></span></div>
<div id="yq-recent" class="yq-card" aria-label="The last 24 hours"></div>
<div id="yq-hint">Tap a character, the data vault, or the wall screen.</div>
<div id="yq-dock" class="yq-card" hidden>
  <button id="yq-dock-fold" class="yq-btn" type="button" aria-expanded="true"></button>
  <div id="yq-dock-bar"></div>
</div>
<div id="yq-badge-host">
  <section id="yq-badge" role="dialog" aria-label="Staff badge" hidden></section>
</div>`;

/**
 * Mounts the firm into `host`. The firm starts hidden: setActive(true) shows it, starts its
 * frame loop, and starts the feed. The firm has no visits yet, so it does not call
 * onVisitChange.
 */
export function mountFirm(
  host: HTMLElement,
  _opts: { onVisitChange(visiting: boolean): void },
): Firm {
  host.innerHTML = SKELETON;
  const $ = (id: string): HTMLElement => {
    const el = host.querySelector<HTMLElement>(`#${id}`);
    if (!el) throw new Error(`The firm has no #${id}.`);
    return el;
  };
  const el = {
    stage: $('yq-stage'),
    tags: $('yq-tags'),
  };
  const isActive = (): boolean => host.dataset.active === 'true';

  const feed = createFeed(import.meta.env.DEV ? DEV_FEED_URL : FEED_URL);
  let model: Model | null = null;
  let clock: Clock | null = null;

  // The layout follows the screen shape: areas side by side on a wide screen, stacked on a
  // tall one.
  const layoutFor = (): 'wide' | 'tall' => (innerWidth >= innerHeight ? 'wide' : 'tall');
  let layoutName = layoutFor();
  const stage = createFirmStage(el.stage, { rect: LAYOUTS[layoutName].rect, panZoom: true });
  stage.setRunning(false);
  const { scene } = stage;
  // The night: a navy backdrop, warm lamp light, and the floors take the shadows.
  scene.background = new Color(PAL.night);
  stage.ground.visible = false;
  stage.hemi.color.set('#fff0dc');
  stage.hemi.groundColor.set('#4a4560');
  stage.hemi.intensity = 1.7;
  stage.sun.color.set('#ffe7c8');
  stage.sun.intensity = 1.2;

  // The props. They stay for the life of the firm; a layout change moves them.
  const locker = buildLocker();
  const door = buildBlastDoor();
  const board = buildBoard();
  const ops = buildConsole();
  const tape = buildTapeScreen();
  scene.add(locker.root, door.root, board.root, ops.root, tape.root);
  stage.addHit(locker.root, { subject: 'vault' });
  stage.addHit(door.root, { subject: 'vault' });
  stage.addHit(board.root, { subject: 'board' });

  // The characters and their homes. The root holds the hit box of the character.
  const chars = {} as Record<CastActor, Character>;
  for (const a of ACTORS) {
    const c = buildCharacter(a);
    chars[a] = c;
    scene.add(c.root);
    stage.addHit(c.root, { subject: a });
  }
  const home = {} as Record<CastActor, Vector3>;

  let set: FirmSet | null = null;
  const envelopes = createEnvelopes({
    scene,
    locker,
    door,
    chars,
    layout: () => LAYOUTS[layoutName],
    addHit: (obj) => stage.addHit(obj, { subject: 'vault' }),
    removeHit: (obj) => stage.removeHit(obj),
  });
  const unseal = createUnseal({ locker, door, envelopes });
  const tags = createTags(el.tags, { stage, chars, actors: ACTORS, locker });

  function place(obj: Object3D, s: Spot): void {
    obj.position.copy(at(s[0], s[1]));
    obj.rotation.y = FACE_VIEWER + (s[2] ?? 0);
  }
  function applyLayout(name: 'wide' | 'tall'): void {
    layoutName = name;
    const L = LAYOUTS[name];
    if (set) scene.remove(set.root);
    set = buildSet(L);
    scene.add(set.root);
    place(locker.root, L.spots.locker);
    place(door.root, L.spots.door);
    place(board.root, L.spots.board);
    place(ops.root, L.spots.console);
    place(tape.root, L.spots.tape);
    for (const a of ACTORS) {
      const s = L.spots[a];
      home[a] = at(s[0], s[1]);
      chars[a].reset();
      place(chars[a].root, s);
    }
    envelopes.layoutChanged();
    stage.setRect(L.rect);
    stage.resetView();
  }
  applyLayout(layoutName);

  // The overlays. They cover the top and the bottom of the screen.
  const hud = createHud(host, { stage, feed });
  const ro = new ResizeObserver(() => {
    if (!isActive()) return;
    const want = layoutFor();
    if (want !== layoutName) {
      applyLayout(want);
      if (model && clock) resetTo(clock.t);
    }
    hud.updateInsets();
  });
  for (const x of [...hud.observed, host]) ro.observe(x);

  // The wall screen. It counts up when the number of settled markets grows during play.
  let boardShown: BoardValues = EMPTY_BOARD;
  let boardWant: BoardValues = EMPTY_BOARD;
  let boardAnim: { from: BoardValues; to: BoardValues; t: number } | null = null;
  function boardValues(t: number): BoardValues {
    const b = model ? boardAt(model.scores, t) : null;
    if (!b) return EMPTY_BOARD;
    return {
      ...b.brier,
      markets: b.markets,
      latest: short(b.latest.series),
      flash: 0,
      wipe: 0,
    };
  }
  function setBoard(v: BoardValues): void {
    boardAnim = null;
    boardShown = v;
    board.show(v);
  }
  const lerpScore = (a: number | null, b: number | null, k: number): number | null =>
    a == null || b == null ? b : a + (b - a) * k;
  function updateBoard(dt: number): void {
    if (!boardAnim) {
      if (boardWant.markets > boardShown.markets) {
        boardAnim = { from: boardShown, to: boardWant, t: 0 };
      } else if (boardWant !== boardShown) {
        setBoard(boardWant);
        return;
      } else return;
    }
    boardAnim.t += dt;
    const s = boardAnim.t;
    const { from, to } = boardAnim;
    // 0 to 0.8 s: the screen refreshes. 0.2 to 1.8 s: the numbers count up.
    const k = ease((s - 0.2) / 1.6);
    boardShown = {
      claude: lerpScore(from.claude, to.claude, k),
      strike_rate: lerpScore(from.strike_rate, to.strike_rate, k),
      base_rate: lerpScore(from.base_rate, to.base_rate, k),
      markets: Math.round(from.markets + (to.markets - from.markets) * k),
      latest: s >= 0.2 ? to.latest : from.latest,
      wipe: s < 0.8 ? smooth(s / 0.8) : 0,
      flash: s >= 0.2 && s < 2.3 ? 1 - smooth((s - 0.2) / 2.1) : 0,
    };
    board.show(boardShown);
    if (s >= 2.3) {
      setBoard(to);
      boardWant = to;
    }
  }
  board.show(EMPTY_BOARD);

  // Claude calls run from t to end. The bubble at the end has the full line.
  let pendingCalls: TimedEvent[] = [];
  let rackFlash = 0;
  const seriesOf = (id: string | null | undefined): string | undefined =>
    id ? envelopes.tokens.get(id)?.env.series : undefined;
  /** Event text without the actor name: the bubble stands over the actor. */
  const bubbleText = (ev: TimedEvent, n: number, t = ev.at): string | undefined =>
    eventText(ev, { n, series: seriesOf(ev.envelope) ?? null, t })?.replace(/^[^:]+:\s*/, '');

  function react({ ev, n }: { ev: TimedEvent; n: number }): void {
    const key = `${ev.actor}.${ev.kind}`;
    if (key === 'vault.unseal') {
      unseal.start(ev);
      return;
    }
    if (!isCast(ev.actor)) return;
    const actor = ev.actor;
    const c = chars[actor];
    let runTo: Vector3 | null = null;
    if (ev.kind === 'error') runTo = home[ev.job === 'forecast-new' ? 'scanner' : 'loop'].clone();
    // With the cast map, a loop tick also makes the clerk check the tape for the open markets.
    void playEvent(c, ev, { speed: clock?.speed ?? 1, runTo, cast: chars });
    if (key === 'scanner.cycle') rackFlash = 1;
    if (key === 'brief.brief') {
      envelopes.fly('brief', 'claude', 0);
      envelopes.fly('brief', 'strike_rate', 0.15);
      envelopes.fly('brief', 'base_rate', 0.3);
    }
    if (key === 'shadow.fill' && ev.envelope) {
      // The clerk sends the fill stamp to the waiting envelope. Its fill badge pops.
      const tok = envelopes.tokens.get(ev.envelope);
      const i = tok?.i;
      const cub = i != null ? locker.cub[i] : undefined;
      if (tok && i != null && cub && tok.stage === 'locker' && !tok.trip) {
        const to = locker.root.localToWorld(new Vector3(...cub.front)).setY(0.9);
        envelopes.flyPoints(chars.shadow.anchor('hand'), to, 1.0, 0.5);
        envelopes.tween(0, () => locker.pop(i, 'fills'), 1.6);
      }
    }
    if (key === 'claude.call') {
      pendingCalls.push(ev);
      const secs = ((ev.end ?? ev.at) - ev.at) / 1000 / (clock?.speed ?? 1);
      tags.say(
        'claude',
        `Working: ${short(seriesOf(ev.envelope))}, ${ev.markets ?? 0} markets. The forecasts go into the sealed envelope.`,
        { secs: Math.max(2.6, secs) },
      );
      return;
    }
    if (QUIET_BUBBLE[key]) return;
    tags.say(actor, bubbleText(ev, n), { err: ev.kind === 'error' });
  }
  function checkCalls(t: number): void {
    pendingCalls = pendingCalls.filter((ev) => {
      const end = ev.end ?? ev.at;
      if (t < end) return true;
      tags.say('claude', bubbleText(ev, 1, end), { secs: 3 });
      return false;
    });
  }

  // A jump: set the scene to the state at t, with no motion.
  let quietShown: boolean | null = null;
  function resetTo(t: number): void {
    unseal.cancel();
    envelopes.reset(t);
    rackFlash = 0;
    set?.racks.setFlash(0);
    boardWant = boardValues(t);
    setBoard(boardWant);
    tags.clearBubbles();
    // A jump plays no motion: every act stops and every figure goes back to its spot.
    for (const a of ACTORS) chars[a].reset();
    pendingCalls = model
      ? model.events.filter((e) => e.kind === 'call' && e.at <= t && (e.end ?? e.at) > t)
      : [];
    quietShown = null;
  }

  function setQuiet(quiet: boolean): void {
    if (quiet === quietShown) return;
    quietShown = quiet;
    for (const a of ACTORS) chars[a].setIdle(quiet ? (READERS[a] ? 'read' : 'nap') : 'idle');
  }

  /** With no model: the feed's state in the pills, and the cast reads or naps. */
  function applyFeedStatus(): void {
    hud.showStatus(feed.status === 'live' ? 'connecting' : feed.status);
    setQuiet(true);
  }

  // The state at the shown time, a few times each second.
  function applyState(s: State): void {
    if (!model || !clock) return;
    const t = s.t;
    boardWant = boardValues(t);
    hud.applyState(s);
    // The envelope tags and the badges in the cubbies: counts only, never numbers.
    const byId = new Map(s.envelopes.map((e) => [e.id, e]));
    let waiting = 0;
    let fills = 0;
    for (const tok of envelopes.tokens.values()) {
      const e = byId.get(tok.env.id);
      const inLocker = (tok.stage === 'locker' || tok.stage === 'open') && !tok.trip;
      if (tok.i != null && unseal.token !== tok)
        locker.setBadges(tok.i, inLocker && e ? e.counts : { forecasts: 0 });
      if (!e) continue;
      if (!e.open) {
        waiting += e.counts.orders;
        fills += e.counts.fills;
      }
      const c = e.counts;
      const stamps = `${c.forecasts} forecasts · ${c.orders} ${c.orders === 1 ? 'order' : 'orders'} · ${c.fills} ${c.fills === 1 ? 'fill' : 'fills'}`;
      const html = e.open
        ? `<span class="yq-open-dot"></span><span>Opened <b>${esc(short(e.series))}</b><br>${fmtDay(e.opensAt).slice(0, 3)} ${fmtClock(e.opensAt)} UTC</span>`
        : `<span class="yq-seal"></span><span><b>${esc(short(e.series))}</b> opens in <b>${fmtCountdown(e.opensIn)}</b><br><span class="yq-stamps">${stamps}</span></span>`;
      tags.setEnvTag(tok.env.id, html, e.open);
    }
    tape.show({ waiting, fills });
    // Quiet hours: the cast naps or reads.
    setQuiet(s.quiet);
    // The job lamps, the alarms, and the jar.
    const tones = {
      scanner: jobStatus(s.jobs.scanner, t).tone,
      loop: jobStatus(s.jobs.loop, t).tone,
    };
    ops.setTone('scanner', tones.scanner);
    ops.setTone('loop', tones.loop);
    // The alarm look shows a job state from the events (a network error or a stale job).
    chars.loop.setAlarm(tones.loop === 'error' || tones.loop === 'stale');
    chars.supervisor.setAlarm(tones.scanner === 'error' || tones.loop === 'error');
    chars.cost.setLevel(Math.min(1, s.spend.today / Math.max(1e-9, s.spend.dailyCap)));
  }

  // A new model from the feed. A swap is not a jump: tokens keep their trips. The first model
  // makes the clock, and the first tick of the clock is a jump.
  function onFeed(): void {
    const m = feed.model;
    if (!m) {
      if (model) {
        model = null;
        clock = null;
        unseal.cancel();
        envelopes.setModel(null, 0);
        resetTo(0);
      }
      applyFeedStatus();
      return;
    }
    model = m;
    // The bounds follow the newest model.
    clock ??= createClock(() => {
      const b = model ?? m;
      return { start: b.start, end: b.end };
    });
    envelopes.setModel(m, clock.t);
    hud.setModel(m, clock);
    lastState = 0;
  }
  feed.onChange(onFeed);
  applyFeedStatus();

  // The frame.
  let lastState = 0;
  stage.start((dt) => {
    for (const a of ACTORS) chars[a].update(dt);
    if (model && clock) {
      const { from, to, jumped } = clock.tick(dt);
      if (jumped) resetTo(to);
      else {
        for (const run of mergeRuns(eventsBetween(model, from, to))) react(run);
        checkCalls(to);
      }
      envelopes.update(dt, to, unseal.token);
      unseal.update(dt, to);
      const now = performance.now();
      if (jumped || now - lastState > STATE_EVERY_MS) {
        lastState = now;
        envelopes.sync(to);
        applyState(stateAt(model, to));
      }
    } else envelopes.update(dt, 0, null);
    hud.update();
    updateBoard(dt);
    locker.update(dt);
    if (rackFlash > 0) {
      rackFlash = Math.max(0, rackFlash - dt / 1.4);
      set?.racks.setFlash(rackFlash > 0.5 ? 1 : rackFlash * 2);
    }
    tags.position({
      tokens: envelopes.tokens,
      layout: LAYOUTS[layoutName],
      t: clock?.t ?? 0,
      busy: unseal.token,
      visiting: false,
      top: hud.topEdge,
    });
  });
  // The firm starts hidden: setActive(true) starts the frame loop.
  stage.setRunning(false);

  // The feed stops while the page is hidden. It starts again when the firm shows.
  addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') feed.stop();
    else if (isActive()) feed.start();
  });

  if (new URLSearchParams(location.search).has('debug')) {
    Reflect.set(window, 'yaldaq', {
      feed,
      stage,
      chars,
      tokens: envelopes.tokens,
      clock: () => clock,
      model: () => model,
    });
  }

  return {
    setActive(active) {
      if (active) {
        host.dataset.active = 'true';
        const want = layoutFor();
        if (want !== layoutName) {
          applyLayout(want);
          if (model && clock) resetTo(clock.t);
        }
        hud.updateInsets();
        stage.setRunning(true);
        feed.start();
        if (clock?.live) clock.goLive();
        hud.shown();
      } else {
        feed.stop();
        stage.setRunning(false);
        host.dataset.active = 'false';
      }
    },
    inVisit: () => false,
  };
}
