// The unseal: at the close of an event, the blast door opens, the cubby opens and turns green,
// the envelope rises out of it and opens, the open envelope goes back into its cubby, and the
// door shuts. The wall screen does not change here: it counts up when a market settles.
import { Vector3 } from 'three';
import type { TimedEvent } from '../data/model';
import type { Envelopes, Token } from './envelopes';
import { ease, smooth } from './kit';
import type { BlastDoor, Locker } from './props';

export interface Unseal {
  /** The token that the unseal moves now, or null. */
  readonly token: Token | null;
  /** Plays the unseal of the event's envelope. A running unseal ends at once first. */
  start(ev: TimedEvent): void;
  /** Ends a running unseal at once, with the envelope at its state at t. */
  finish(t: number): void;
  /** Stops a running unseal with no end state (a jump sets every token itself). */
  cancel(): void;
  update(dt: number, t: number): void;
}

/** The times of the show, in seconds of wall time. */
const T = {
  doorOpen: 0.8,
  cubbyFrom: 0.5,
  cubbyTo: 1.0,
  green: 0.6,
  riseFrom: 1.0,
  riseTo: 2.0,
  flapFrom: 2.0,
  flapTo: 2.8,
  backFrom: 2.9,
  backTo: 3.7,
  shutFrom: 3.7,
  end: 4.3,
} as const;
/** The envelope grows to this size over the cubby. */
const GROW = 1.8;

export function createUnseal(deps: {
  locker: Locker;
  door: BlastDoor;
  envelopes: Envelopes;
}): Unseal {
  const { locker, door, envelopes } = deps;
  let seq: { tok: Token; i: number; t: number; slot: Vector3; up: Vector3 } | null = null;

  function finish(t: number): void {
    if (!seq) return;
    const { tok } = seq;
    seq = null;
    envelopes.setStatic(tok, t);
    envelopes.shutDoor();
  }

  return {
    get token() {
      return seq?.tok ?? null;
    },
    start(ev) {
      const tok = ev.envelope ? envelopes.tokens.get(ev.envelope) : undefined;
      if (!tok) return;
      finish(ev.at);
      // The envelope waits in its cubby. If it was still on its way, it arrives at once.
      envelopes.setStatic(tok, ev.at - 1);
      tok.goal = 'open';
      const i = envelopes.cubbyOf(tok, ev.at);
      const c = locker.cub[i];
      if (!c) return;
      tok.obj.visible = true;
      tok.obj.position.copy(locker.root.localToWorld(new Vector3(...c.slot)));
      const slot = tok.obj.position.clone();
      const up = locker.root.localToWorld(new Vector3(c.slot[0], locker.H + 0.5, 0.55));
      seq = { tok, i, t: 0, slot, up };
    },
    finish,
    cancel() {
      seq = null;
    },
    update(dt, t) {
      if (!seq) return;
      if (!envelopes.tokens.has(seq.tok.env.id)) {
        seq = null;
        envelopes.shutDoor();
        return;
      }
      seq.t += dt;
      const s = seq.t;
      const { tok, i } = seq;
      const o = tok.obj;
      const df =
        s < T.shutFrom ? ease(s / T.doorOpen) : 1 - ease((s - T.shutFrom) / (T.end - T.shutFrom));
      door.setDoor(df);
      door.setLamp(df > 0.05 ? 'open' : 'shut');
      locker.setDoor(i, ease((s - T.cubbyFrom) / (T.cubbyTo - T.cubbyFrom)));
      if (s >= T.green) locker.setLit(i, 'open');
      if (s >= T.riseFrom && s < T.backFrom) {
        const k = ease((s - T.riseFrom) / (T.riseTo - T.riseFrom));
        o.position.lerpVectors(seq.slot, seq.up, k);
        o.scale.setScalar(tok.base * (1 + (GROW - 1) * k));
      }
      if (s >= T.flapFrom) o.userData.open(smooth((s - T.flapFrom) / (T.flapTo - T.flapFrom)));
      if (s >= T.backFrom) {
        const k = ease((s - T.backFrom) / (T.backTo - T.backFrom));
        o.position.lerpVectors(seq.up, seq.slot, k);
        o.scale.setScalar(tok.base * (GROW - (GROW - 1) * k));
      }
      if (s >= T.end) {
        seq = null;
        envelopes.setStatic(tok, Math.max(t, tok.times.unseal));
        envelopes.shutDoor();
      }
    },
  };
}
