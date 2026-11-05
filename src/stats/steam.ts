// Nick's lifetime Counter-Strike stats from the Steam Web API. The counters include his CS:GO
// years. The server side (api/steam.ts and the dev server) calls Steam with the key. The page
// only reads the summary. This file has no DOM and no Three.js.

/** Nick's 64-bit Steam ID. The function reads only this account. */
export const STEAM_ID = '76561198130482337';
export const STEAM_PROFILE = 'https://steamcommunity.com/id/JudeJudy';
/** The route of the Vercel function (api/steam.ts) and of the dev server. */
export const STEAM_ROUTE = '/api/steam';

const CS_APP = 730;
/** Vercel's CDN asks Steam at most once an hour. */
const CACHE = 'public, s-maxage=3600, stale-while-revalidate=86400';

export interface SteamStats {
  readonly kd: number | null;
  /** Headshot kills as a share of all kills, 0 to 1. */
  readonly headshots: number | null;
  readonly matches: number | null;
  readonly hours: number | null;
}

const record = (x: unknown): Record<string, unknown> =>
  typeof x === 'object' && x !== null ? (x as Record<string, unknown>) : {};
const finite = (x: unknown): number | null =>
  typeof x === 'number' && Number.isFinite(x) ? x : null;
const ratio = (a: number | null, b: number | null): number | null =>
  a === null || b === null || b === 0 ? null : a / b;

/**
 * The summary from a GetUserStatsForGame response and a GetOwnedGames response. A missing
 * counter gives null for each value that needs it.
 */
export function steamStats(userStats: unknown, ownedGames: unknown): SteamStats {
  const counters = new Map<string, number>();
  const list = record(record(userStats).playerstats).stats;
  if (Array.isArray(list)) {
    for (const s of list) {
      const { name, value } = record(s);
      const v = finite(value);
      if (typeof name === 'string' && v !== null) counters.set(name, v);
    }
  }
  const get = (name: string): number | null => counters.get(name) ?? null;
  const games = record(record(ownedGames).response).games;
  const cs = Array.isArray(games) ? games.map(record).find((g) => g.appid === CS_APP) : undefined;
  const minutes = finite(cs?.playtime_forever);
  return {
    kd: ratio(get('total_kills'), get('total_deaths')),
    headshots: ratio(get('total_kills_headshot'), get('total_kills')),
    matches: get('total_matches_played'),
    hours: minutes === null ? null : minutes / 60,
  };
}

/** Reads the Steam summary from the response of the function. */
export function parseSteamSummary(body: unknown): SteamStats {
  const b = record(body);
  return {
    kd: finite(b.kd),
    headshots: finite(b.headshots),
    matches: finite(b.matches),
    hours: finite(b.hours),
  };
}

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Steam gave status ${res.status}.`);
  return res.json();
}

/** The response of the Steam route. The key never goes into the response. */
export async function steamResponse(key: string | undefined): Promise<Response> {
  if (!key) return Response.json({ error: 'The server has no Steam key.' }, { status: 502 });
  const base = 'https://api.steampowered.com';
  const query = `key=${encodeURIComponent(key)}&steamid=${STEAM_ID}`;
  try {
    const [userStats, ownedGames] = await Promise.all([
      getJson(`${base}/ISteamUserStats/GetUserStatsForGame/v2/?appid=${CS_APP}&${query}`),
      getJson(`${base}/IPlayerService/GetOwnedGames/v1/?appids_filter%5B0%5D=${CS_APP}&${query}`),
    ]);
    return Response.json(steamStats(userStats, ownedGames), {
      headers: { 'Cache-Control': CACHE },
    });
  } catch {
    return Response.json({ error: 'Steam did not answer.' }, { status: 502 });
  }
}
