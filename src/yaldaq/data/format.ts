// Times and text formats of the YALDAQ view. All times are UTC. No DOM and no Three.js.

export const DAY_MS = 864e5;

/** An ISO time in ms. */
export const ms = (isoTime: string): number => Date.parse(isoTime);

/** A time in ms as ISO UTC, with no ms part: "2026-11-07T05:09:09Z". */
export const iso = (t: number): string => new Date(t).toISOString().replace('.000Z', 'Z');

/** The UTC day of a time, as YYYY-MM-DD. */
export const dayOf = (t: number): string => iso(t).slice(0, 10);

/** 00:00 UTC of a YYYY-MM-DD day, in ms. */
export const dayStart = (day: string): number => ms(`${day}T00:00:00Z`);

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const two = (n: number): string => String(n).padStart(2, '0');

/** "05:09" or "05:09:12" (seconds = true). */
export function fmtClock(t: number, seconds = false): string {
  const d = new Date(t);
  const hm = `${two(d.getUTCHours())}:${two(d.getUTCMinutes())}`;
  return seconds ? `${hm}:${two(d.getUTCSeconds())}` : hm;
}

/** "Sat 7 Nov". */
export function fmtDay(t: number): string {
  const d = new Date(t);
  return `${WEEKDAYS[d.getUTCDay()] ?? ''} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()] ?? ''}`;
}

/** "Sat 7 Nov, 05:09 UTC". */
export function fmtWhen(t: number, seconds = false): string {
  return `${fmtDay(t)}, ${fmtClock(t, seconds)} UTC`;
}

/** A length of time: "2 h 11 min", "4 min 20 s", "12 s". */
export function fmtDur(d: number): string {
  const s = Math.max(0, Math.round(d / 1000));
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min${s % 60 && m < 10 ? ` ${s % 60} s` : ''}`;
  const h = Math.floor(m / 60);
  if (h < 48) return `${h} h${m % 60 ? ` ${m % 60} min` : ''}`;
  return `${Math.floor(h / 24)} d ${h % 24} h`;
}

/** A countdown: "1:12:05" (h:mm:ss), or "4:05" under an hour. */
export function fmtCountdown(d: number): string {
  const s = Math.max(0, Math.ceil(d / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  return h ? `${h}:${two(m)}:${two(s % 60)}` : `${m}:${two(s % 60)}`;
}

/** "$0.07", "$1.83", "$10". */
export function fmtUSD(x: number, digits = 2): string {
  return `$${Number.isInteger(x) && digits === 2 && x >= 10 ? x : x.toFixed(digits)}`;
}

/** A probability as a percent: "14%", "0.5%". */
export function fmtP(p: number): string {
  const v = p * 100;
  return `${v < 1 && v > 0 ? v.toFixed(1) : Math.round(v)}%`;
}
