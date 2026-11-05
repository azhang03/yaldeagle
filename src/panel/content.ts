// The panel text for one item. This file has no DOM and no Three.js.
// Section html escapes each item string. The plain fields are escaped when the panel renders.
import { AREAS } from '../room/areas';
import type { ItemDef, Peak } from '../room/items';
import type { StatKey } from '../stats/cs2';
import { LEETIFY_HOME, LEETIFY_PROFILE } from '../stats/leetify';
import { STEAM_PROFILE } from '../stats/steam';

export interface PanelContent {
  area: { name: string; color: string };
  itemName: string;
  title: string;
  status: 'earned' | 'progress' | 'locked';
  statusLabel: 'Earned' | 'In progress' | 'Locked';
  lead: string;
  confirm?: string;
  sections: { heading: string; html: string }[];
  tryIt: boolean;
}

const STATUS_LABEL = { earned: 'Earned', progress: 'In progress', locked: 'Locked' } as const;
const LOCKED_LEAD = 'Nick has not earned this yet.';
/** The Leetify badge from their logo pack (public/leetify/), at its 270 by 112 shape. */
const LEETIFY_BADGE =
  '<img src="/leetify/data-provided-by-leetify.png" alt="Data provided by Leetify" width="77" height="32">';

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Replaces the HTML special characters in a string. */
export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (ch) => ESCAPES[ch] ?? ch);
}

const list = (xs: readonly string[]): string =>
  `<ul>${xs.map((x) => `<li>${escapeHtml(x)}</li>`).join('')}</ul>`;

const link = (href: string, text: string, cls = ''): string =>
  `<a${cls ? ` class="${cls}"` : ''} href="${href}" target="_blank" rel="noopener">${text}</a>`;

/** A box that shows dashes until the panel fills it (see `fill` in build.ts). */
const box = (key: StatKey, label: string): string =>
  `<div><b data-stat="${key}">--</b><span>${label}</span></div>`;

/** Three groups: CS2 from Leetify, lifetime totals from Steam, and the peaks from the item. */
function statsHtml(peaks: readonly Peak[]): string {
  const group = (heading: string, boxes: string, foot = ''): string =>
    `<div class="pb-stat-group"><h4>${heading}</h4><div class="stats">${boxes}</div>${foot}</div>`;
  return (
    group(
      'CS2',
      box('cs2Matches', 'Matches') +
        box('cs2WinRate', 'Win Rate') +
        box('cs2Rating', 'Leetify Rating') +
        box('cs2Aim', 'Aim'),
      `<p class="pb-credit">${link(LEETIFY_HOME, LEETIFY_BADGE)}${link(LEETIFY_PROFILE, 'View on Leetify', 'pb-leetify')}</p>`,
    ) +
    group(
      'Lifetime',
      box('kd', 'K/D') +
        box('headshots', 'Headshots') +
        box('matches', 'Matches') +
        box('hours', 'Hours'),
      `<p class="pb-credit">Steam totals, with his CS:GO years. ${link(STEAM_PROFILE, 'Steam profile')}</p>`,
    ) +
    group('Peaks', peaks.map(peakBox).join(''))
  );
}

/** A peak: the rank icon (if any) next to the rank, and the label under them. */
function peakBox(p: Peak): string {
  const icon = p.icon
    ? `<img src="${escapeHtml(p.icon.src)}" alt="" width="${p.icon.width}" height="${p.icon.height}">`
    : '';
  return `<div><b>${icon}${escapeHtml(p.value)}</b><span>${escapeHtml(p.label)}</span></div>`;
}

export function panelContent(item: ItemDef): PanelContent {
  const area = AREAS[item.area];
  const sections = [{ heading: 'What it is', html: `<p>${escapeHtml(item.what)}</p>` }];
  if (item.stats) sections.push({ heading: 'Stats', html: statsHtml(item.stats.peaks) });
  if (item.history && item.status !== 'locked')
    sections.push({ heading: 'History', html: list(item.history) });
  if (item.earn && item.status !== 'earned')
    sections.push({ heading: 'How he earns it', html: list(item.earn) });
  sections.push({ heading: 'On the eagle', html: `<p>${escapeHtml(item.wearText)}</p>` });
  return {
    area: { name: area.name, color: area.color },
    itemName: item.name,
    title: item.title,
    status: item.status,
    statusLabel: STATUS_LABEL[item.status],
    lead: item.status === 'locked' ? LOCKED_LEAD : item.line,
    confirm: item.confirm,
    sections,
    tryIt: !!item.tryIt,
  };
}
