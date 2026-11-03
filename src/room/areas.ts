// The four areas of the room and their colors. This file has no Three.js and no DOM.

export type AreaId = 'licenses' | 'work' | 'esports' | 'scouts';

export interface Area {
  readonly name: string;
  /** The strong color: the floor ring of an item and the panel. */
  readonly color: string;
  /** The light color of the floor patch. */
  readonly tint: string;
}

export const AREAS: Readonly<Record<AreaId, Area>> = {
  licenses: { name: 'Licenses', color: '#e0a010', tint: '#fcf3dc' },
  work: { name: 'Work', color: '#3f74c9', tint: '#e8f0fc' },
  esports: { name: 'Esports', color: '#7a4fe0', tint: '#f0e9fe' },
  scouts: { name: 'Eagle Scouts', color: '#4f8a35', tint: '#eaf3e4' },
};
