// The small text box at the pointer: the item title and its state.
import type { ItemDef, ItemStatus } from './items';

export interface Tooltip {
  /** Shows the text of the item near the screen point (x, y), in CSS pixels. */
  show(item: ItemDef, x: number, y: number): void;
  hide(): void;
}

const TEXT: Readonly<Record<ItemStatus, string>> = {
  earned: 'Click to look closer.',
  progress: 'In progress. Nick is working on it.',
  locked: 'Locked. Nick has not earned this yet.',
};

export function createTooltip(): Tooltip {
  const tip = document.createElement('div');
  tip.id = 'tip';
  document.body.append(tip);
  return {
    show(item, x, y) {
      const title = document.createElement('b');
      title.textContent = item.title;
      const line = document.createElement('span');
      line.textContent = TEXT[item.status];
      if (item.status === 'locked') line.className = 'locked';
      tip.replaceChildren(title, line);
      tip.style.display = 'block';
      tip.style.left = `${Math.min(x + 14, innerWidth - 240)}px`;
      tip.style.top = `${y + 16}px`;
    },
    hide() {
      tip.style.display = 'none';
    },
  };
}
