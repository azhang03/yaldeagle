import { describe, expect, it } from 'vitest';
import { leetifyValues, steamValues } from './cs2';
import { leetifyStats } from './leetify';
import { steamStats } from './steam';

const userStats = (stats: Record<string, number>) => ({
  playerstats: { stats: Object.entries(stats).map(([name, value]) => ({ name, value })) },
});
const ownedGames = { response: { games: [{ appid: 730, playtime_forever: 346200 }] } };

describe('steamStats', () => {
  it('gives K/D, the headshot share, matches, and hours from the Steam counters', () => {
    const s = steamStats(
      userStats({
        total_kills: 219864,
        total_deaths: 190888,
        total_kills_headshot: 96897,
        total_matches_played: 7993,
      }),
      ownedGames,
    );
    expect(s.kd).toBeCloseTo(1.1518, 4);
    expect(s.headshots).toBeCloseTo(0.4407, 4);
    expect(s.matches).toBe(7993);
    expect(s.hours).toBe(5770);
    expect(steamValues(s)).toEqual({
      kd: '1.15',
      headshots: '44%',
      matches: '7,993',
      hours: '5,770',
    });
  });

  it('gives null for a value with a missing or zero counter, and no box text for it', () => {
    const s = steamStats(userStats({ total_kills: 10, total_deaths: 0 }), { response: {} });
    expect(s).toEqual({ kd: null, headshots: null, matches: null, hours: null });
    expect(steamValues(s)).toEqual({});
  });

  it('survives a response of the wrong shape', () => {
    expect(steamStats('nope', null)).toEqual({
      kd: null,
      headshots: null,
      matches: null,
      hours: null,
    });
  });
});

describe('leetifyStats', () => {
  it('reads the profile values and shows them on the Leetify scales', () => {
    const s = leetifyStats({
      total_matches: 1967,
      winrate: 0.4828,
      ranks: { leetify: 3.17 },
      rating: { aim: 91.6207 },
    });
    expect(s).toEqual({ matches: 1967, winRate: 0.4828, rating: 3.17, aim: 91.6207 });
    expect(leetifyValues(s)).toEqual({
      cs2Matches: '1,967',
      cs2WinRate: '48%',
      cs2Rating: '3.17',
      cs2Aim: '92',
    });
  });

  it('gives null for missing values', () => {
    expect(leetifyStats({ ranks: {} })).toEqual({
      matches: null,
      winRate: null,
      rating: null,
      aim: null,
    });
  });
});
