// The stage of each envelope at a time, and its locker cubby. No DOM, no Three.js.
import type { Envelope, Model } from './model';

export type EnvelopeStage = 'lab' | 'ladder' | 'policy' | 'locker' | 'open';

export interface StageTimes {
  brief: number;
  callEnd: number | null;
  policyStart: number | null;
  policyEnd: number | null;
  unseal: number;
}

/** An opened envelope stays in its cubby for this long after the unseal. */
export const LOCKER_KEEP_MS = 24 * 3600e3;

/**
 * The times when the envelope moves from stage to stage. When the envelope was sealed before
 * the loaded events start, its own events are not loaded: it is in the locker already.
 */
export function timesOf(model: Model, env: Envelope): StageTimes {
  if (env.sealedAt < model.start) {
    const s = env.sealedAt;
    return { brief: s, callEnd: s, policyStart: s, policyEnd: s, unseal: env.opensAt };
  }
  const evs = model.events.filter((e) => e.envelope === env.id);
  const pol = evs.filter((e) => e.actor === 'policy' || (e.actor === 'risk' && e.kind === 'pass'));
  const call = evs.find((e) => e.kind === 'call');
  const repair = evs.find((e) => e.kind === 'repair');
  return {
    brief: evs.find((e) => e.kind === 'brief')?.at ?? env.sealedAt,
    // Without a call, the envelope leaves the lab at the ladder repair.
    callEnd: call?.end ?? repair?.at ?? null,
    policyStart: pol[0]?.at ?? null,
    policyEnd: pol.at(-1)?.at ?? null,
    unseal: env.opensAt,
  };
}

/** The stage at t, or null before the brief. */
export function stageAt(times: StageTimes, t: number): EnvelopeStage | null {
  if (t < times.brief) return null;
  if (t >= times.unseal) return 'open';
  if (times.policyEnd != null && t >= times.policyEnd) return 'locker';
  if (times.policyStart != null && t >= times.policyStart) return 'policy';
  if (times.callEnd != null && t >= times.callEnd) return 'ladder';
  return 'lab';
}

let warned = false;

/**
 * The cubby index of each envelope in the locker at t. The function replays the enter and leave
 * moments up to t in time order. An envelope keeps its cubby while it stays. When all cubbies
 * are full, a new envelope takes the cubby of the open envelope with the earliest unseal.
 * The full-locker warning shows once for each page load.
 */
export function cubbiesAt(
  timesById: ReadonlyMap<string, StageTimes>,
  t: number,
  count: number,
): Map<string, number> {
  // kind 0 = leave, 1 = enter: a leave sorts first on a tie.
  const moments: { at: number; kind: 0 | 1; id: string }[] = [];
  for (const [id, x] of timesById) {
    const enter = x.policyEnd ?? x.unseal;
    if (enter <= t) moments.push({ at: enter, kind: 1, id });
    const leave = x.unseal + LOCKER_KEEP_MS;
    if (leave <= t) moments.push({ at: leave, kind: 0, id });
  }
  moments.sort((a, b) => a.at - b.at || a.kind - b.kind);
  const cubby = new Map<string, number>();
  let entered = 0;
  for (const m of moments) {
    if (m.kind === 0) {
      cubby.delete(m.id);
      continue;
    }
    const used = new Set(cubby.values());
    let index = -1;
    for (let i = 0; i < count; i++) {
      if (!used.has(i)) {
        index = i;
        break;
      }
    }
    if (index < 0) {
      let oldest: string | null = null;
      let oldestUnseal = Infinity;
      for (const id of cubby.keys()) {
        const u = timesById.get(id)?.unseal ?? Infinity;
        if (u <= m.at && u < oldestUnseal) {
          oldest = id;
          oldestUnseal = u;
        }
      }
      if (oldest != null) {
        index = cubby.get(oldest) ?? 0;
        cubby.delete(oldest);
      } else {
        index = entered % count;
        if (!warned) {
          warned = true;
          console.warn(`The locker is full: ${count} sealed envelopes. Two share a cubby.`);
        }
      }
    }
    cubby.set(m.id, index);
    entered++;
  }
  return cubby;
}
