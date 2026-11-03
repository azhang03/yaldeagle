// The items in the room. This is the one home of the item data. This file has no Three.js and no
// DOM.
import type { AreaId } from './areas';

export type ItemId =
  | 'fe'
  | 'pe'
  | 'pls'
  | 'qsd'
  | 'leed'
  | 'leedap'
  | 'storm'
  | 'se'
  | 'work'
  | 'viewpoint'
  | 'bronco'
  | 'cs2'
  | 'kerchief'
  | 'eagle';

export interface ItemDef {
  readonly id: ItemId;
  readonly area: AreaId;
  /** The place in room coordinates (see `roomPoint`). */
  readonly u: number;
  readonly v: number;
}

/** The radius of the floor patch under each item. */
export const PATCH_RADIUS = 1.2;
/** The eagle's feet stay at least this far from the center of each item. */
export const ITEM_CLEARANCE = 0.75;

export const ITEMS: readonly ItemDef[] = [
  { id: 'fe', area: 'licenses', u: -4.2, v: -3.0 },
  { id: 'pe', area: 'licenses', u: -1.3, v: -2.6 },
  { id: 'pls', area: 'licenses', u: 1.6, v: -3.2 },
  { id: 'qsd', area: 'licenses', u: 4.4, v: -2.7 },
  { id: 'leed', area: 'licenses', u: -4.6, v: -6.0 },
  { id: 'leedap', area: 'licenses', u: -1.8, v: -5.5 },
  { id: 'storm', area: 'licenses', u: 1.0, v: -6.1 },
  { id: 'se', area: 'licenses', u: 3.8, v: -5.4 },
  { id: 'work', area: 'work', u: -6.0, v: 0.4 },
  { id: 'viewpoint', area: 'esports', u: 4.8, v: 0.2 },
  { id: 'bronco', area: 'esports', u: 7.0, v: 1.8 },
  { id: 'cs2', area: 'esports', u: 4.4, v: 3.0 },
  { id: 'kerchief', area: 'scouts', u: -2.0, v: 4.2 },
  { id: 'eagle', area: 'scouts', u: 0.9, v: 4.8 },
];
