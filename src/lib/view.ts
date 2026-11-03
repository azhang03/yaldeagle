// Camera views: the overview of the room. This file has no Three.js and no DOM.
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

/** The overview offset at the start. */
export function startOffset(_aspect: number): OverviewOffset {
  return { u: 0.5, v: -0.5, zoom: 1 };
}
