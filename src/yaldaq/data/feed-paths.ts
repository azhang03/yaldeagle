// The paths of the public feed files and their cache times. The page, the dev route in
// vite.config.ts, and the store's Worker (feed/) use this one copy.

/** The four file kinds, relative to the store root. */
export const FEED_PATH =
  /^(?:live\.json|scores\.json|days\/\d{4}-\d{2}-\d{2}\.json|reveals\/env-[0-9a-f]{8}\.json)$/;

/** The store root on the live site. */
export const FEED_URL = 'https://yaldaq-feed.lucharnist.workers.dev/v1/';

/** The store root on the dev server (the dev route in vite.config.ts). */
export const DEV_FEED_URL = '/feed/v1/';

const DAY_MS = 864e5;
/** A day file can still change until this long after its day ends. */
const DAY_SETTLES_MS = 36 * 3600e3;

/** Cache seconds for a GET: live 20, scores 120, a reveal 300, a day file 86400 if its date is at least 36 h before now (UTC), else 60. */
export function cacheSeconds(path: string, nowMs: number): number {
  if (path === 'live.json') return 20;
  if (path === 'scores.json') return 120;
  if (path.startsWith('reveals/')) return 300;
  // "At least 36 h before now" counts from the end of the UTC day.
  const dayEnd = Date.parse(`${path.slice(5, 15)}T00:00:00Z`) + DAY_MS;
  return nowMs - dayEnd >= DAY_SETTLES_MS ? 86400 : 60;
}
