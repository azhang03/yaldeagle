// The earned gear on the eagle mounts. The eagle starts with no gear. A visit to an earned item
// puts its gear on, and the gear stays until the page loads again.
import type { Group } from 'three';
import type { Eagle } from '../eagle/model';
import { easeOutBack } from '../lib/ease';
import type { ItemDef, ItemId } from './items';
import { createKit, createPaint } from './kit';
import { MODELS, PARTS } from './models';

export interface Gear {
  /**
   * Puts the gear of the item on the eagle with a short grow-in. Does nothing if the item is not
   * earned, has no gear, or its gear is already on.
   */
  equip(id: ItemId): void;
  update(dt: number): void;
}

/** The time of the grow-in, in seconds. */
const GROW = 0.35;

/** Builds the gear of each earned item with a `worn` entry on its eagle mount, hidden. */
export function createGear(eagle: Eagle, items: readonly ItemDef[]): Gear {
  const paint = createPaint();
  const pieces = new Map<ItemId, { group: Group; scale: number; t: number | null }>();
  for (const item of items) {
    const worn = item.worn;
    if (item.status !== 'earned' || !worn) continue;
    const kit = createKit(paint);
    (worn.part === 'model' ? MODELS[item.id] : PARTS[worn.part])(kit);
    eagle.mounts[worn.mount].add(kit.group);
    kit.group.position.set(...worn.pos);
    kit.group.rotation.set(...(worn.rot ?? [0, 0, 0]));
    kit.group.visible = false;
    // t is the time since the grow-in started, or null while the gear is off.
    pieces.set(item.id, { group: kit.group, scale: worn.scale, t: null });
  }

  return {
    equip(id) {
      const piece = pieces.get(id);
      if (!piece || piece.t !== null) return;
      piece.t = 0;
      piece.group.visible = true;
      piece.group.scale.setScalar(0);
    },
    update(dt) {
      for (const piece of pieces.values()) {
        if (piece.t === null || piece.t >= GROW) continue;
        piece.t = Math.min(GROW, piece.t + dt);
        // A grow that goes a little past the full size and comes back, so the gear pops on.
        piece.group.scale.setScalar(piece.scale * easeOutBack(piece.t / GROW));
      }
    },
  };
}
