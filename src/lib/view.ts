// Camera views: the overview of the room, the close view of a visit, and the flights between
// them. This file has no Three.js and no DOM.
import { easeInOutCubic, smoothstep } from './ease';
import { ROOM_AZIMUTH, roomPoint } from './room';

const deg = (d: number): number => (d * Math.PI) / 180;

/** One perspective camera view. All views and flights use this type. */
export interface CameraView {
  /** The point that the camera looks at. */
  readonly target: { x: number; y: number; z: number };
  /** Camera angle around y, in radians. At 0 the camera is on +z of the target. */
  readonly azimuth: number;
  /** Camera angle above the ground, in radians. */
  readonly elevation: number;
  /** The vertical field of view, in degrees. */
  readonly fov: number;
  /** Half the view height at the target, in world units. */
  readonly halfHeight: number;
}

/** The distance from the camera to the target. */
function distance(view: CameraView): number {
  return view.halfHeight / Math.tan(deg(view.fov) / 2);
}

export function cameraPosition(view: CameraView): { x: number; y: number; z: number } {
  const d = distance(view);
  const flat = d * Math.cos(view.elevation);
  return {
    x: view.target.x + flat * Math.sin(view.azimuth),
    y: view.target.y + d * Math.sin(view.elevation),
    z: view.target.z + flat * Math.cos(view.azimuth),
  };
}

/**
 * The near and far planes. They stay close around the room, so the depth is exact and flat parts
 * do not flicker in the far overview.
 */
export function nearFar(view: CameraView): { near: number; far: number } {
  const d = distance(view);
  return { near: Math.max(0.05, d - 15), far: d + 40 };
}

/** The overview position and zoom. Zoom 1 shows the whole room. */
export interface OverviewOffset {
  u: number;
  v: number;
  zoom: number;
}

/**
 * The overview: a narrow angle from far away, so it looks almost like a flat camera. The half
 * height does not go below `minHalfHeight`.
 */
export const OVERVIEW = { elevation: deg(38), fov: 10, minHalfHeight: 2.2 } as const;

/** The half height that shows the whole room at this aspect (width / height). */
export function fitHalfHeight(aspect: number): number {
  return Math.max(5.1, 8.6 / aspect);
}

export function overview(aspect: number, o: OverviewOffset): CameraView {
  const p = roomPoint(o.u, o.v);
  return {
    target: { x: p.x, y: 0.35, z: p.z },
    azimuth: ROOM_AZIMUTH,
    elevation: OVERVIEW.elevation,
    fov: OVERVIEW.fov,
    halfHeight: Math.max(OVERVIEW.minHalfHeight, fitHalfHeight(aspect) * o.zoom),
  };
}

/** The limits of the overview offset: the center stays in the room bounds. */
const OFFSET_LIMITS = { u0: -7, u1: 7.8, v0: -7.2, v1: 5.8 } as const;

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/**
 * Moves the offset back inside its limits. The zoom shows at most the whole room (1) and at least
 * the smallest half height.
 */
export function clampOffset(o: OverviewOffset, aspect: number): void {
  o.zoom = clamp(o.zoom, OVERVIEW.minHalfHeight / fitHalfHeight(aspect), 1);
  o.u = clamp(o.u, OFFSET_LIMITS.u0, OFFSET_LIMITS.u1);
  o.v = clamp(o.v, OFFSET_LIMITS.v0, OFFSET_LIMITS.v1);
}

/**
 * The overview offset at the start. A tall screen starts closer, so the items are big enough to
 * tap.
 */
export function startOffset(aspect: number): OverviewOffset {
  if (aspect >= 1) return { u: 0.5, v: -0.5, zoom: 1 };
  const o = { u: 0.5, v: 0, zoom: 3.8 / aspect / fitHalfHeight(aspect) };
  clampOffset(o, aspect);
  return o;
}

export interface Viewport {
  readonly width: number;
  readonly height: number;
}

/** The world units for one screen pixel at the target. The overview is almost flat. */
function unitsPerPixel(o: OverviewOffset, viewport: Viewport, aspect: number): number {
  return (2 * overview(aspect, o).halfHeight) / viewport.height;
}

/** Pans the overview by (dx, dy) screen pixels, so the floor follows the finger. */
export function panBy(
  o: OverviewOffset,
  dx: number,
  dy: number,
  viewport: Viewport,
  aspect: number,
): void {
  const k = unitsPerPixel(o, viewport, aspect);
  o.u -= dx * k;
  // The floor is seen at a slant, so a pixel up the screen is a longer step on the floor.
  o.v -= (dy * k) / Math.sin(OVERVIEW.elevation);
  clampOffset(o, aspect);
}

/** Zooms by the factor (above 1 zooms out) and keeps the floor point under (x, y) in place. */
export function zoomAt(
  o: OverviewOffset,
  x: number,
  y: number,
  factor: number,
  viewport: Viewport,
  aspect: number,
): void {
  const k0 = unitsPerPixel(o, viewport, aspect);
  o.zoom *= factor;
  clampOffset(o, aspect);
  const k1 = unitsPerPixel(o, viewport, aspect);
  o.u += (x - viewport.width / 2) * (k0 - k1);
  o.v += ((y - viewport.height / 2) * (k0 - k1)) / Math.sin(OVERVIEW.elevation);
  clampOffset(o, aspect);
}

/**
 * The close view of a visit: a wide angle near the ground, like a person who looks at the item.
 * `side` is the distance from the item to the eagle spot. `span` is the width of the item and the
 * eagle, with room around them. `gazeY` is the height of the point between them.
 */
export const CLOSE = { fov: 40, elevation: deg(13), side: 1.05, span: 3, gazeY: 0.7 } as const;

/**
 * The close view of an item from the camera azimuth. On a wide screen (aspect 1 or more), the item
 * and the eagle fill the left half, and the panel the right half. On a tall screen, they show
 * above the panel.
 */
export function closeView(
  item: { readonly x: number; readonly z: number },
  azimuth: number,
  aspect: number,
): CameraView {
  const rx = Math.cos(azimuth);
  const rz = -Math.sin(azimuth);
  // G: the middle of the item and the eagle spot.
  const g = {
    x: item.x + rx * (CLOSE.side / 2),
    y: CLOSE.gazeY,
    z: item.z + rz * (CLOSE.side / 2),
  };
  let halfHeight: number;
  let target: { x: number; y: number; z: number };
  if (aspect >= 1) {
    halfHeight = CLOSE.span / 0.8 / aspect;
    // G at the middle of the left half.
    const shift = 0.5 * halfHeight * aspect;
    target = { x: g.x + rx * shift, y: g.y, z: g.z + rz * shift };
  } else {
    halfHeight = Math.max(CLOSE.span / 1.5 / aspect, 1.95);
    // G at 38% of the half height above the screen center.
    target = { ...g, y: g.y - 0.38 * halfHeight };
  }
  return { target, azimuth, elevation: CLOSE.elevation, fov: CLOSE.fov, halfHeight };
}

/**
 * The view at the part u (0 to 1) of a flight between two views. All values move together with
 * an ease in and out, and the half height moves on a log scale. On the way `down`, the elevation
 * starts late, so the camera first moves in, then drops to the ground.
 */
export function flight(from: CameraView, to: CameraView, u: number, down: boolean): CameraView {
  const k = easeInOutCubic(Math.min(1, Math.max(0, u)));
  const kElevation = down ? smoothstep((u - 0.2) / 0.8) : k;
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  const turn = Math.atan2(Math.sin(to.azimuth - from.azimuth), Math.cos(to.azimuth - from.azimuth));
  return {
    target: {
      x: lerp(from.target.x, to.target.x, k),
      y: lerp(from.target.y, to.target.y, k),
      z: lerp(from.target.z, to.target.z, k),
    },
    azimuth: from.azimuth + turn * k,
    elevation: lerp(from.elevation, to.elevation, kElevation),
    fov: lerp(from.fov, to.fov, k),
    halfHeight: Math.exp(lerp(Math.log(from.halfHeight), Math.log(to.halfHeight), k)),
  };
}
