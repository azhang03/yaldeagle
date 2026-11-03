// The panel text for one item. This file has no DOM and no Three.js.
// Section html escapes each item string. The plain fields are escaped when the panel renders.
import { AREAS } from '../room/areas';
import type { ItemDef } from '../room/items';

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
const STATS_HTML =
  '<div class="stats"><div><b>--</b><span>Matches</span></div><div><b>--</b><span>K/D</span></div>' +
  '<div><b>--</b><span>Win rate</span></div></div><p class="small">Layout only. No data yet.</p>';

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

export function panelContent(item: ItemDef): PanelContent {
  const area = AREAS[item.area];
  const sections = [{ heading: 'What it is', html: `<p>${escapeHtml(item.what)}</p>` }];
  if (item.stats) sections.push({ heading: 'Stats', html: STATS_HTML });
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
