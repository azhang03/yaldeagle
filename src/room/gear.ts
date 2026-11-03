// The earned gear on the eagle mounts.
import type { Eagle } from '../eagle/model';
import type { ItemDef } from './items';
import { createKit, createPaint } from './kit';
import { MODELS, PARTS } from './models';

/** Puts the gear of each earned item with a `worn` entry on its eagle mount. */
export function addGear(eagle: Eagle, items: readonly ItemDef[]): void {
  const paint = createPaint();
  for (const item of items) {
    const worn = item.worn;
    if (item.status !== 'earned' || !worn) continue;
    const kit = createKit(paint);
    (worn.part === 'model' ? MODELS[item.id] : PARTS[worn.part])(kit);
    eagle.mounts[worn.mount].add(kit.group);
    kit.group.position.set(...worn.pos);
    kit.group.rotation.set(...(worn.rot ?? [0, 0, 0]));
    kit.group.scale.setScalar(worn.scale);
  }
}
