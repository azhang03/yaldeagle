// The colors of the eagle. The values come from the T2 mockup.
export const PALETTE = {
  /** Chest block, back block, and the feathers on the legs. */
  brown: '#55341d',
  wing: '#3e2514',
  /** Head and collar. */
  white: '#f2efe7',
  tail: '#e6e1d6',
  beak: '#f6b92f',
  /** The hooked tip of the beak. */
  hook: '#d98d15',
  feet: '#f6b92f',
  talon: '#3a3a3c',
  eye: '#1c1c1e',
} as const;

export type PaletteColor = keyof typeof PALETTE;
