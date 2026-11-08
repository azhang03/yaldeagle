// The feed client: it polls the store, keeps the day files, reveals, and scores that the page
// needs, and builds the model. No DOM.
//
// The store answers 200 with the JSON of a file, or 204 when the file is not there yet. A day
// file holds the events of one UTC day up to its export; live.json holds the last 30 min. The
// client keeps one unbroken range of days up to as_of. Between polls it folds the old live
// events into the day files, so no event goes missing and no event shows twice.
import type { DayFile, FeedEvent, LiveFile, RevealFile, ScoresFile } from './contract';
import { dayOf, ms } from './format';
import { LIVE_TAIL_MS, addDays, buildModel, type Model } from './model';

export type FeedStatus = 'connecting' | 'empty' | 'live' | 'offline';

export interface Feed {
  readonly status: FeedStatus;
  readonly model: Model | null;
  start(): void;
  stop(): void;
  /** Loads `day`, the day before it, and every day up to the loaded range. */
  loadDay(day: string): Promise<void>;
  loadReveal(id: string): Promise<void>;
  onChange(fn: () => void): () => void;
}

/** The client fetches the reveal of an envelope that opened in this span before as_of. */
const REVEAL_SPAN_MS = 48 * 3600e3;
/** A reveal file must not open later than this after now (the store's rule too). */
const REVEAL_SKEW_MS = 120e3;

type Got = { ok: true; data: unknown } | { ok: false };

const isFile = (x: unknown): x is { schema: 2 } =>
  typeof x === 'object' && x !== null && !Array.isArray(x) && Reflect.get(x, 'schema') === 2;

const settledSum = (live: LiveFile): number => live.opened.reduce((s, o) => s + o.settled, 0);

export function createFeed(
  base: string,
  opts: { fetch?: typeof fetch; pollMs?: number; now?: () => number } = {},
): Feed {
  const fetchFn: typeof fetch = opts.fetch ?? ((input, init) => globalThis.fetch(input, init));
  const pollMs = opts.pollMs ?? 60000;
  const now = opts.now ?? Date.now;

  let status: FeedStatus = 'connecting';
  let model: Model | null = null;
  let live: LiveFile | null = null;
  const days = new Map<string, DayFile>();
  const reveals = new Map<string, RevealFile>();
  /** The settled count of each opened envelope when its reveal was fetched. */
  const revealSettled = new Map<string, number>();
  let scores: ScoresFile | null = null;
  let scoresSum: number | null = null;
  let timer: ReturnType<typeof setInterval> | undefined;
  /** A poll waits in the queue. At most one waits, so slow answers do not pile up polls. */
  let pollQueued = false;
  /** Work runs one at a time, so a poll and a day load never mix their files. */
  let queue: Promise<void> = Promise.resolve();
  const listeners = new Set<() => void>();

  const emit = (): void => {
    for (const fn of listeners) fn();
  };

  /** A failed poll: offline when there is no model yet, else no change. */
  const failed = (): void => {
    if (model || status === 'offline') return;
    status = 'offline';
    emit();
  };

  /** Queues a job. The promise never rejects: a broken file must not break the page. */
  const run = (job: () => Promise<void>, onError: () => void = () => {}): Promise<void> => {
    queue = queue.then(job).catch(onError);
    return queue;
  };

  async function get(path: string): Promise<Got> {
    try {
      const r = await fetchFn(base + path, { cache: 'no-cache' });
      if (r.status !== 200) {
        // Read the body (empty for a 204). Else the browser cancels the request and logs it as
        // a failed request.
        await r.text();
        return r.status === 204 ? { ok: true, data: null } : { ok: false };
      }
      const data: unknown = await r.json();
      return isFile(data) ? { ok: true, data } : { ok: false };
    } catch {
      return { ok: false };
    }
  }

  /** Gets day files into `into`. False when a request failed. */
  async function getDays(list: readonly string[], into: Map<string, DayFile>): Promise<boolean> {
    const got = await Promise.all(list.map((d) => get(`days/${d}.json`)));
    for (const [i, g] of got.entries()) {
      if (!g.ok) return false;
      const day = list[i];
      if (day && g.data) into.set(day, g.data as DayFile);
    }
    return true;
  }

  async function getReveal(id: string, settled: number | null): Promise<void> {
    const g = await get(`reveals/${id}.json`);
    if (!g.ok || !g.data) return;
    const r = g.data as RevealFile;
    // A reveal must belong to its envelope and must not open in the future.
    if (r.envelope !== id || !(ms(r.opened_at) <= now() + REVEAL_SKEW_MS)) return;
    reveals.set(id, r);
    if (settled != null) revealSettled.set(id, settled);
  }

  function rebuild(): void {
    if (!live) return;
    model = buildModel({
      live,
      days: [...days.values()],
      reveals: [...reveals.values()],
      scores,
    });
    status = 'live';
  }

  /** Moves the old live events from the old cut up to the new cut into their day files. */
  function fold(old: LiveFile, newCut: number): void {
    const oldCut = ms(old.as_of) - LIVE_TAIL_MS;
    for (const [date, d] of days) {
      days.set(date, { ...d, events: d.events.filter((e) => ms(e.t) < oldCut) });
    }
    const moved: FeedEvent[] = old.events.filter((e) => {
      const at = ms(e.t);
      return at >= oldCut && at < newCut;
    });
    for (const e of moved) {
      const date = e.t.slice(0, 10);
      const d = days.get(date);
      if (d) d.events.push(e);
      else days.set(date, { schema: 2, date, complete: false, events: [e] });
    }
  }

  async function poll(): Promise<void> {
    const g = await get('live.json');
    if (!g.ok) {
      failed();
      return;
    }
    if (!g.data) {
      const changed = status !== 'empty';
      status = 'empty';
      model = null;
      live = null;
      days.clear();
      reveals.clear();
      revealSettled.clear();
      scores = null;
      scoresSum = null;
      if (changed) emit();
      return;
    }
    const next = g.data as LiveFile;
    const asOf = ms(next.as_of);
    const newCut = asOf - LIVE_TAIL_MS;
    const listed = new Set(next.days);
    const loaded = [...days.keys()].sort();
    const firstLoaded = loaded[0];
    const prevAsOf = live ? ms(live.as_of) : null;

    if (live && prevAsOf != null && newCut <= prevAsOf && asOf >= prevAsOf) {
      // No gap: the old live events cover the span up to the new cut.
      fold(live, newCut);
    } else {
      // The first file, or a gap: get the last days again. First move the whole old live tail
      // into the day files, so a kept day reaches the old as_of.
      if (live) fold(live, Infinity);
      const lastDay = dayOf(asOf);
      const dayBefore = addDays(lastDay, -1);
      const from = firstLoaded && firstLoaded > dayBefore ? firstLoaded : dayBefore;
      const list: string[] = [];
      for (let d = from; d <= lastDay; d = addDays(d, 1)) if (listed.has(d)) list.push(d);
      const fresh = new Map<string, DayFile>();
      if (!(await getDays(list, fresh))) {
        failed();
        return;
      }
      // Keep the older days only when they meet the new ones with no hole.
      const keepOld = prevAsOf != null && dayOf(prevAsOf) >= from;
      for (const d of [...days.keys()]) if (!keepOld || d >= from) days.delete(d);
      for (const [d, f] of fresh) days.set(d, f);
    }
    live = next;

    await Promise.all(
      next.opened
        .filter(
          (o) =>
            ms(o.opened_at) >= asOf - REVEAL_SPAN_MS &&
            (!reveals.has(o.envelope) || revealSettled.get(o.envelope) !== o.settled),
        )
        .map((o) => getReveal(o.envelope, o.settled)),
    );

    const sum = settledSum(next);
    if (scoresSum !== sum) {
      const s = await get('scores.json');
      if (s.ok) {
        scores = (s.data as ScoresFile | null) ?? null;
        scoresSum = sum;
      }
    }

    rebuild();
    emit();
  }

  function pollOnce(): void {
    if (pollQueued) return;
    pollQueued = true;
    void run(() => {
      pollQueued = false;
      return poll();
    }, failed);
  }

  return {
    get status() {
      return status;
    },
    get model() {
      return model;
    },
    start() {
      if (timer !== undefined) return;
      pollOnce();
      timer = setInterval(pollOnce, pollMs);
    },
    stop() {
      clearInterval(timer);
      timer = undefined;
    },
    loadDay(day) {
      return run(async () => {
        const first = [...days.keys()].sort()[0];
        if (!live || !first) return;
        const listed = new Set(live.days);
        const list: string[] = [];
        for (let d = addDays(day, -1); d < first; d = addDays(d, 1)) {
          if (listed.has(d)) list.push(d);
        }
        if (!list.length) return;
        const fresh = new Map<string, DayFile>();
        if (!(await getDays(list, fresh))) return;
        for (const [d, f] of fresh) days.set(d, f);
        rebuild();
        emit();
      });
    },
    loadReveal(id) {
      return run(async () => {
        if (!live) return;
        const opened = live.opened.find((o) => o.envelope === id);
        await getReveal(id, opened ? opened.settled : null);
        rebuild();
        emit();
      });
    },
    onChange(fn) {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
  };
}
