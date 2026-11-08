// The upload check of the public store. The Worker (feed/) and the dev route in vite.config.ts
// run it on every file. A file that breaks a rule does not go public.

import { FEED_PATH } from './feed-paths';

export type CheckResult = { ok: true } | { ok: false; rule: string };

/** Keys of Kalshi market data. No public file may hold them. */
export const KALSHI_KEYS = [
  'ticker',
  'market_ticker',
  'event_ticker',
  'series_ticker',
  'title',
  'subtitle',
  'rules',
  'rules_primary',
  'yes_bid',
  'yes_ask',
  'no_bid',
  'no_ask',
  'last_price',
  'volume',
  'open_interest',
] as const;

/** Keys of sealed contents. Only a reveal file may hold them. */
export const SEALED_KEYS = [
  'p',
  'p_raw',
  'price',
  'side',
  'contracts',
  'rationale',
  'query',
  'strike',
  'result',
] as const;

const KALSHI = new Set<string>(KALSHI_KEYS);
const SEALED = new Set<string>(SEALED_KEYS);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false;
  const proto: unknown = Object.getPrototypeOf(v);
  return proto === Object.prototype || proto === null;
}

/** Visits every object key at any depth. The visitor returns a rule to stop the walk. */
function findKey(v: unknown, visit: (key: string, value: unknown) => string | null): string | null {
  if (Array.isArray(v)) {
    for (const item of v) {
      const found = findKey(item, visit);
      if (found) return found;
    }
    return null;
  }
  if (typeof v !== 'object' || v === null) return null;
  for (const [key, value] of Object.entries(v)) {
    const rule = visit(key, value) ?? findKey(value, visit);
    if (rule) return rule;
  }
  return null;
}

const fail = (rule: string): CheckResult => ({ ok: false, rule });

/** Checks one upload. The first rule that fails gives the result. */
export function checkUpload(path: string, data: unknown, nowMs: number): CheckResult {
  if (!FEED_PATH.test(path)) return fail('path');
  if (!isPlainObject(data) || data.schema !== 2) return fail('schema');

  const kalshi = findKey(data, (key) => (KALSHI.has(key) ? `kalshi-key:${key}` : null));
  if (kalshi) return fail(kalshi);

  const isDay = path.startsWith('days/');
  if (path === 'live.json' || isDay) {
    const sealed = findKey(data, (key, value) => {
      if (SEALED.has(key)) return `sealed-key:${key}`;
      if (key === 'searches' && Array.isArray(value)) return 'searches-list';
      return null;
    });
    if (sealed) return fail(sealed);
  }

  if (isDay && data.date !== path.slice(5, 15)) return fail('day-date');

  if (path.startsWith('reveals/')) {
    if (data.envelope !== path.slice(8, -5)) return fail('envelope-id');
    const opened = typeof data.opened_at === 'string' ? Date.parse(data.opened_at) : NaN;
    if (Number.isNaN(opened) || opened > nowMs + 120000) return fail('early-reveal');
  }

  return { ok: true };
}
