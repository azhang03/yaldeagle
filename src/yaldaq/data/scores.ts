// The wall screen's scores at a time, from YALDAQ's own scoring in scores.json. No DOM.
import type { Forecaster, ScoreEntry, ScoresFile } from './contract';
import { ms } from './format';

export interface Board {
  markets: number;
  brier: Record<Forecaster, number | null>;
  duel: { claude: number; strike_rate: number; tie: number };
  realizedUsd: number;
  /** The last event that settled by t. */
  latest: {
    envelope: string;
    series: string;
    eventDay: string | null;
    markets: number;
    settledAt: number;
  };
  /** The entries that settled by t, in time order. */
  history: ScoreEntry[];
}

/** The scores at t: the totals of the last entry with settled_at <= t, or null with none. */
export function boardAt(scores: ScoresFile | null, t: number): Board | null {
  if (!scores) return null;
  const history = scores.history.filter((h) => ms(h.settled_at) <= t);
  const last = history.at(-1);
  if (!last) return null;
  return {
    markets: last.total.markets,
    brier: last.total.brier,
    duel: last.total.duel,
    realizedUsd: last.total.realized_usd,
    latest: {
      envelope: last.envelope,
      series: last.series,
      eventDay: last.event_day,
      markets: last.markets,
      settledAt: ms(last.settled_at),
    },
    history,
  };
}
