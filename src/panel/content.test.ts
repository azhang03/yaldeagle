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
  it('gives the fe sections, the try button, and the confirm text', () => {
    expect(headings('fe')).toEqual(['What it is', 'History', 'On the eagle']);
    const c = panelContent(item('fe'));
    expect(c.tryIt).toBe(true);
    expect(c.confirm).toBe('The year he passed.');
  });

  it('gives the pe sections', () => {
    expect(headings('pe')).toEqual(['What it is', 'History', 'How he earns it', 'On the eagle']);
  });

  it('gives the pls sections and the locked lead', () => {
    expect(headings('pls')).toEqual(['What it is', 'How he earns it', 'On the eagle']);
    expect(panelContent(item('pls')).lead).toBe('Nick has not earned this yet.');
  });

  it('gives the cs2 sections', () => {
    expect(headings('cs2')).toEqual(['What it is', 'Stats', 'On the eagle']);
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

  it('gives the work sections without the try button', () => {
    expect(headings('work')).toEqual(['What it is', 'History', 'On the eagle']);
    expect(panelContent(item('work')).tryIt).toBe(false);
  });

  it('escapes the item text in the html', () => {
    const c = panelContent({ ...item('fe'), what: 'a < b' });
    expect(c.sections[0]?.html).toContain('a &lt; b');
  });
});
