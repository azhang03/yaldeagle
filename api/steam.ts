// Vercel function: Nick's Steam stats. The key comes from the project settings (STEAM_API_KEY).
import { steamResponse } from '../src/stats/steam.js';

export function GET(): Promise<Response> {
  return steamResponse(process.env.STEAM_API_KEY);
}
