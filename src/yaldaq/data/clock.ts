// The replay clock. It holds the shown time and moves it with the wall time at a speed.
// No DOM. readOptions reads the URL only when the page passes it or `location` exists.
import { ms } from './format';
import { LIVE_DELAY_MS } from './model';

export const SPEEDS = [1, 10, 60] as const;
export type Speed = (typeof SPEEDS)[number];

/** In live mode, a step longer than this (and longer than twice the frame time) is a jump. */
const LONG_STEP_MS = 5000;

export interface ClockOptions {
  /** The start time, or null for live mode. */
  t: number | null;
  speed: Speed | null;
  paused: boolean;
}

/**
 * URL options:
 *   ?t=2026-11-07T05:08:30Z  start at this time (UTC), speed 1 unless ?speed
 *   ?speed=1|10|60           the start speed
 *   ?paused                  start paused
 * With no ?t, the clock starts in live mode: LIVE_DELAY_MS behind the wall clock.
 */
export function readOptions(search: string = globalThis.location?.search ?? ''): ClockOptions {
  const p = new URLSearchParams(search);
  const tText = p.get('t');
  const t = tText ? ms(tText) : NaN;
  const speed = SPEEDS.find((s) => s === Number(p.get('speed'))) ?? null;
  return { t: Number.isFinite(t) ? t : null, speed, paused: p.has('paused') };
}

export interface ClockTick {
  from: number;
  to: number;
  /** The first tick after a seek: set the state at `to` and play no motion. */
  jumped: boolean;
}

export interface Clock {
  readonly t: number;
  readonly speed: number;
  readonly playing: boolean;
  /** True while the clock follows the wall clock. A seek or a speed change ends it. */
  readonly live: boolean;
  tick(dt: number): ClockTick;
  seek(t: number): void;
  setSpeed(speed: number): void;
  play(): void;
  pause(): void;
  toggle(): void;
  /** Back to live: LIVE_DELAY_MS behind the wall clock, at 1x. */
  goLive(): void;
  /** fn runs after each change of speed, play state, live state, or a seek. */
  onChange(fn: (clock: Clock) => void): () => void;
}

/**
 * Makes the clock. `bounds` gives the times the clock can show (the model can grow).
 * In live mode each tick sets t to the wall clock less LIVE_DELAY_MS, kept inside the bounds.
 * In replay each tick moves t by dt seconds times the speed and stops at the end.
 */
export function createClock(
  bounds: () => { start: number; end: number },
  opts: ClockOptions = readOptions(),
  now: () => number = Date.now,
): Clock {
  const clampT = (x: number): number => {
    const b = bounds();
    return Math.min(b.end, Math.max(b.start, x));
  };
  const listeners = new Set<(clock: Clock) => void>();
  let t = clampT(opts.t ?? now() - LIVE_DELAY_MS);
  let speed: number = opts.speed ?? 1;
  let playing = !opts.paused;
  let live = opts.t == null && (opts.speed == null || opts.speed === 1);
  let jumped = true;

  const clock: Clock = {
    get t() {
      return t;
    },
    get speed() {
      return speed;
    },
    get playing() {
      return playing;
    },
    get live() {
      return live;
    },
    tick(dt) {
      const from = t;
      const wasJump = jumped;
      jumped = false;
      if (live && playing) {
        t = clampT(now() - LIVE_DELAY_MS);
        // A long step (a hidden tab, or a stale feed that caught up) is a jump: the page sets
        // the state at t and plays no motion for the skipped span.
        if (!wasJump && t - from > Math.max(LONG_STEP_MS, dt * 2000)) {
          return { from: t, to: t, jumped: true };
        }
      } else if (playing && !wasJump) {
        t = clampT(t + dt * 1000 * speed);
        if (t >= bounds().end) {
          playing = false;
          emit();
        }
      }
      return { from: wasJump ? t : from, to: t, jumped: wasJump };
    },
    seek(x) {
      t = clampT(x);
      jumped = true;
      live = false;
      emit();
    },
    setSpeed(s) {
      speed = s;
      live = false;
      emit();
    },
    play() {
      if (t >= bounds().end) clock.seek(bounds().start);
      playing = true;
      emit();
    },
    pause() {
      playing = false;
      live = false;
      emit();
    },
    toggle() {
      if (playing) clock.pause();
      else clock.play();
    },
    goLive() {
      t = clampT(now() - LIVE_DELAY_MS);
      speed = 1;
      playing = true;
      jumped = true;
      live = true;
      emit();
    },
    onChange(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
  function emit(): void {
    for (const fn of listeners) fn(clock);
  }
  return clock;
}
