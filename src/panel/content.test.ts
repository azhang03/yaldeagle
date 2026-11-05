import { describe, expect, it } from 'vitest';
import { ITEMS } from '../room/items';
import type { ItemDef, ItemId } from '../room/items';
import { STAT_KEYS } from '../stats/cs2';
import { panelContent } from './content';

function item(id: ItemId): ItemDef {
  const found = ITEMS.find((it) => it.id === id);
  if (!found) throw new Error(`No item ${id}`);
  return found;
}

const headings = (id: ItemId): string[] => panelContent(item(id)).sections.map((s) => s.heading);

describe('panelContent', () => {
  it('gives an earned item with gear its highlights and the eagle section', () => {
    expect(headings('fe')).toEqual(['About', 'Highlights', 'On the eagle']);
  });

  it('gives an item in progress its highlights and its requirements', () => {
    expect(headings('pe')).toEqual(['About', 'Highlights', 'Requirements']);
  });

  it('gives a locked item its requirements and the locked lead', () => {
    expect(headings('pls')).toEqual(['About', 'Requirements']);
    expect(panelContent(item('pls')).lead).toBe('Not earned yet. It is on his path.');
    expect(panelContent(item('fe')).lead).toBe(item('fe').line);
  });

  it('shows no highlights while locked and no requirements after the item is earned', () => {
    const both = { ...item('pe'), history: ['h'], earn: ['e'] };
    expect(panelContent({ ...both, status: 'locked' }).sections.map((s) => s.heading)).toEqual([
      'About',
      'Requirements',
    ]);
    expect(panelContent({ ...both, status: 'earned' }).sections.map((s) => s.heading)).toEqual([
      'About',
      'Highlights',
    ]);
  });

  it('gives the cs2 sections', () => {
    expect(headings('cs2')).toEqual(['About', 'Stats']);
  });

  it('gives a box for each stat that the loader fills, and escapes the peaks', () => {
    const cs2 = item('cs2');
    const html = panelContent({
      ...cs2,
      stats: { peaks: [{ label: 'A & B', value: '<b>' }] },
    }).sections.find((s) => s.heading === 'Stats')?.html;
    for (const key of STAT_KEYS) expect(html).toContain(`data-stat="${key}"`);
    expect(html).toContain('<b>&lt;b&gt;</b><span>A &amp; B</span>');
  });

  it('escapes the item text in the html', () => {
    const c = panelContent({ ...item('fe'), what: 'a < b' });
    expect(c.sections[0]?.html).toContain('a &lt; b');
  });
});
