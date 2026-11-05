// Loads Nick's CS2 stats once for each page load and turns them into the text of the stat boxes.
// The data stays in memory only (a Leetify rule). This file has no DOM and no Three.js.
import { LEETIFY_URL, leetifyStats, type LeetifyStats } from './leetify';
import { parseSteamSummary, STEAM_ROUTE, type SteamStats } from './steam';

/** The names of the stat boxes (`data-stat` in the panel). */
export const STAT_KEYS = [
  'cs2Matches',
  'cs2WinRate',
  'cs2Rating',
  'cs2Aim',
  'kd',
  'headshots',
  'matches',
  'hours',
] as const;
export type StatKey = (typeof STAT_KEYS)[number];
/** The box text for each stat that has data. A box with no entry keeps its dashes. */
export type StatValues = Partial<Record<StatKey, string>>;

/**
 * A source that fails or takes longer than this gives no data. It is longer than the server's
 * 8 s wait for Steam, so a slow Steam answer that the server gets still reaches the page.
 */
const TIMEOUT_MS = 12000;

const count = (n: number): string => Math.round(n).toLocaleString('en-US');
const percent = (share: number): string => `${Math.round(share * 100)}%`;

function values(pairs: readonly [StatKey, number | null, (n: number) => string][]): StatValues {
  const out: StatValues = {};
  for (const [key, n, format] of pairs) if (n !== null) out[key] = format(n);
  return out;
}

/**
 * Leetify values as the Leetify app shows them: the rating with its sign (+3.17), and Aim on its
 * 0 to 100 scale with no unit.
 */
export function leetifyValues(s: LeetifyStats): StatValues {
  return values([
    ['cs2Matches', s.matches, count],
    ['cs2WinRate', s.winRate, percent],
    ['cs2Rating', s.rating, (n) => `${n > 0 ? '+' : ''}${n.toFixed(2)}`],
    ['cs2Aim', s.aim, (n) => String(Math.round(n))],
  ]);
}

export function steamValues(s: SteamStats): StatValues {
  return values([
    ['kd', s.kd, (n) => n.toFixed(2)],
    ['headshots', s.headshots, percent],
    ['matches', s.matches, count],
    ['hours', s.hours, count],
  ]);
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${url} gave status ${res.status}.`);
  return res.json();
}

interface Sources {
  readonly leetify: Promise<LeetifyStats | null>;
  readonly steam: Promise<SteamStats | null>;
}
let sources: Sources | null = null;

/** Starts both requests on the first call. Later calls give the same promises. */
export function loadCs2(): Sources {
  sources ??= {
    leetify: getJson(LEETIFY_URL).then(leetifyStats, () => null),
    steam: getJson(STEAM_ROUTE).then(parseSteamSummary, () => null),
  };
  return sources;
}

/** Calls `fill` with the box text of each source when its data comes. */
export function watchCs2(fill: (v: StatValues) => void): void {
  const { leetify, steam } = loadCs2();
  void leetify.then((s) => s && fill(leetifyValues(s)));
  void steam.then((s) => s && fill(steamValues(s)));
}
