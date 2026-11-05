// Nick's CS2 stats from the Leetify public API. The page calls it directly (no key). Leetify's
// rules: show their logo and a link to his profile, keep their metric names and scales, and do
// not store their data. So the page keeps the data in memory for one page load only.
// This file has no DOM and no Three.js.
import { STEAM_ID } from './steam';

export const LEETIFY_URL = `https://api-public.cs-prod.leetify.com/v3/profile?steam64_id=${STEAM_ID}`;
export const LEETIFY_PROFILE = `https://leetify.com/public/profile/${STEAM_ID}`;
export const LEETIFY_HOME = 'https://leetify.com/';

export interface LeetifyStats {
  readonly matches: number | null;
  /** 0 to 1. */
  readonly winRate: number | null;
  readonly rating: number | null;
  /** 0 to 100. */
  readonly aim: number | null;
}

const record = (x: unknown): Record<string, unknown> =>
  typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : {};
const finite = (x: unknown): number | null =>
  typeof x === 'number' && Number.isFinite(x) ? x : null;

/** The values from a Leetify profile response. A missing value gives null. */
export function leetifyStats(body: unknown): LeetifyStats {
  const b = record(body);
  return {
    matches: finite(b.total_matches),
    winRate: finite(b.winrate),
    rating: finite(record(b.ranks).leetify),
    aim: finite(record(b.rating).aim),
  };
}
