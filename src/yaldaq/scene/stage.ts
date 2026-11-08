// The stage of the firm: the renderer, the lights, the shadow ground, the camera with its
// overview and flights, picking, and pointer input. A port of the trial's shared/scene.js
// createStage. The firm has its own canvas, so its pointer listeners stay on that canvas.
import {
  Color,
  DirectionalLight,
  HemisphereLight,
  type Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Raycaster,
  Scene,
  ShadowMaterial,
  Mesh,
  Vector2,
  Vector3,
  WebGLRenderer,
} from 'three';
import { AZ, EL, at, clamp, clamp01, deg, lerpAngle } from './kit';

/** The floor rectangle that the overview shows, in room units. top: the height of the tallest models. */
export interface Rect {
  u0: number;
  u1: number;
  v0: number;
  v1: number;
  top?: number;
}
/** Screen space in px that overlays cover. */
export interface Insets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}
/** A camera view. h is half the view height at the target. */
export interface CameraState {
  target: Vector3;
  az: number;
  el: number;
  fov: number;
  h: number;
}
/** The data of a marked object. */
export interface HitInfo {
  subject: string;
}
export type TapHandler = (data: HitInfo | null, ev: PointerEvent) => void;

export interface FirmStage {
  renderer: WebGLRenderer;
  scene: Scene;
  /** The lights and the shadow ground. The page may tint the lights or hide the ground. */
  hemi: HemisphereLight;
  sun: DirectionalLight;
  ground: Mesh;
  camera: PerspectiveCamera;
  canvas: HTMLCanvasElement;
  cam: CameraState;
  ov: { u: number; v: number; zoom: number };
  overview(): CameraState;
  /** Makes the view the resting view, with no flight. */
  rest(view?: () => CameraState): void;
  /** Flies the camera to the view that `to()` returns, then rests there. */
  flyTo(to: () => CameraState, dur?: number): Promise<void>;
  flying(): boolean;
  resting(): () => CameraState;
  panBy(dx: number, dy: number): void;
  /** Zooms by f (above 1 zooms out) and keeps the floor point under (x, y) in place. */
  zoomAt(x: number, y: number, f: number): void;
  /** Zoom 1 (the whole rect) with no pan. */
  resetView(): void;
  setRect(r: Partial<Rect>): void;
  setInsets(i: Partial<Insets>): void;
  size(): { width: number; height: number };
  addHit(obj: Object3D, data: HitInfo): void;
  /** Unmarks an object that leaves the scene, so a tap can no longer find it. */
  removeHit(obj: Object3D): void;
  pick(clientX: number, clientY: number): HitInfo | null;
  /** The nearest world point of obj under a screen point (client px), or null. */
  hitPoint(clientX: number, clientY: number, obj: Object3D): Vector3 | null;
  onTap(fn: TapHandler): void;
  /** Canvas px of a world point. `behind` is true when the point is behind the camera. */
  toScreen(p: Vector3): { x: number; y: number; behind: boolean };
  /** Runs update(dt, t) each frame, then renders. dt is in seconds, at most 0.05. */
  start(update: (dt: number, t: number) => void): void;
  /** false stops the frame loop. true starts it again (no effect before start). */
  setRunning(running: boolean): void;
}

interface Flight {
  from: CameraState;
  to: () => CameraState;
  t: number;
  dur: number;
  resolve: () => void;
}

const MAX_DT = 0.05;

function readHit(o: Object3D): HitInfo | undefined {
  const h: unknown = o.userData.hit;
  return h && typeof h === 'object' ? (h as HitInfo) : undefined;
}

/**
 * Makes the stage in `container` (it must have a size; the canvas fills it).
 * opts.rect: the floor rectangle of the overview. opts.insets: the screen space that overlays
 * cover; the overview fits the rect into the rest. opts.panZoom: a drag pans, a pinch or the
 * wheel zooms.
 */
export function createFirmStage(
  container: HTMLElement,
  opts: { rect: Rect; insets?: Partial<Insets>; panZoom?: boolean },
): FirmStage {
  const panZoom = opts.panZoom ?? true;
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  container.appendChild(renderer.domElement);
  const canvas = renderer.domElement;
  canvas.style.display = 'block';
  canvas.style.touchAction = 'none';

  const scene = new Scene();
  scene.background = new Color('#ffffff');
  const hemi = new HemisphereLight('#ffffff', '#b8b0a2', 1.85);
  scene.add(hemi);
  const sun = new DirectionalLight('#ffffff', 1.35);
  sun.position.set(-3, 10, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -13,
    right: 13,
    top: 13,
    bottom: -13,
    near: 1,
    far: 40,
  });
  sun.shadow.radius = 3;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.01;
  scene.add(sun, sun.target);
  // The ground shows only shadows, so it has the same white as the background and no seam.
  const ground = new Mesh(new PlaneGeometry(200, 200), new ShadowMaterial({ opacity: 0.13 }));
  ground.rotation.x = -Math.PI / 2;
  ground.receiveShadow = true;
  scene.add(ground);

  const camera = new PerspectiveCamera(10, 1, 0.05, 400);
  const cam: CameraState = { target: new Vector3(), az: AZ, el: EL, fov: 10, h: 4 };
  let width = 1;
  let height = 1;
  let room: Required<Rect> = { ...opts.rect, top: opts.rect.top ?? 1.6 };
  let pads: Insets = { top: 0, right: 0, bottom: 0, left: 0, ...opts.insets };

  function placeCamera(): void {
    const d = cam.h / Math.tan(deg(cam.fov) / 2);
    camera.position.set(
      cam.target.x + d * Math.cos(cam.el) * Math.sin(cam.az),
      cam.target.y + d * Math.sin(cam.el),
      cam.target.z + d * Math.cos(cam.el) * Math.cos(cam.az),
    );
    camera.lookAt(cam.target);
    camera.fov = cam.fov;
    camera.aspect = width / height;
    // Near and far planes close around the room keep the depth exact.
    camera.near = Math.max(0.05, d - 20);
    camera.far = d + 40;
    camera.updateProjectionMatrix();
  }

  // The overview fits the rect into the free part of the canvas. ov.zoom 1 shows the whole
  // rect. ov.u and ov.v move the view.
  const ov = { u: 0, v: 0, zoom: 1 };
  const MIN_H = 1.6;
  /** Half the view height that fits the rect into the free part of the canvas. */
  function fitH(): number {
    const freeW = Math.max(40, width - pads.left - pads.right);
    const freeH = Math.max(40, height - pads.top - pads.bottom);
    // The camera angle is narrow, so the view is almost flat: a floor depth dv shows as
    // dv * sin(EL) on the screen, and a height dy as dy * cos(EL).
    const needV = (room.v1 - room.v0) * Math.sin(EL) + room.top * Math.cos(EL) + 0.5;
    const needU = room.u1 - room.u0 + 0.6;
    return Math.max((needV / 2) * (height / freeH), ((needU / 2) * height) / freeW);
  }
  function unitsPerPx(): number {
    return (2 * overview().h) / height;
  }
  function overview(): CameraState {
    const h = Math.max(MIN_H, fitH() * ov.zoom);
    const k = (2 * h) / height;
    // The free part of the canvas is off center when the insets differ. Move the target so the
    // rect is in the middle of the free part.
    const du = ((pads.right - pads.left) / 2) * k;
    const dv = (((pads.bottom - pads.top) / 2) * k) / Math.sin(EL);
    const cu = (room.u0 + room.u1) / 2 + ov.u + du;
    const cv = (room.v0 + room.v1) / 2 + ov.v + dv;
    // Lift the target to half the model height. Then the tall models at the back fit too.
    return { target: at(cu, cv, room.top / 2), az: AZ, el: EL, fov: 10, h };
  }
  function clampView(): void {
    ov.zoom = clamp(ov.zoom, MIN_H / fitH(), 1);
    const su = (room.u1 - room.u0) / 2;
    const sv = (room.v1 - room.v0) / 2;
    ov.u = clamp(ov.u, -su, su);
    ov.v = clamp(ov.v, -sv, sv);
    if (ov.zoom >= 0.999) {
      ov.u = 0;
      ov.v = 0;
    }
  }
  function panBy(dx: number, dy: number): void {
    const k = unitsPerPx();
    ov.u -= dx * k;
    ov.v -= (dy * k) / Math.sin(EL);
    clampView();
  }
  function zoomAt(x: number, y: number, f: number): void {
    const k0 = unitsPerPx();
    ov.zoom *= f;
    clampView();
    const k1 = unitsPerPx();
    const cx = pads.left + (width - pads.left - pads.right) / 2;
    const cy = pads.top + (height - pads.top - pads.bottom) / 2;
    ov.u += (x - cx) * (k0 - k1);
    ov.v += ((y - cy) * (k0 - k1)) / Math.sin(EL);
    clampView();
  }

  // The resting view is a function, so it follows resizes. A flight goes between two views.
  let restView: () => CameraState = overview;
  let flight: Flight | null = null;
  function flyTo(to: () => CameraState, dur = 1.2): Promise<void> {
    if (flight) flight.resolve();
    return new Promise((resolve) => {
      flight = { from: { ...cam, target: cam.target.clone() }, to, t: 0, dur, resolve };
      restView = to;
    });
  }
  function updateCamera(dt: number): void {
    if (flight) {
      flight.t += dt;
      const u = clamp01(flight.t / flight.dur);
      const a = flight.from;
      const b = flight.to();
      const k = u < 0.5 ? 4 * u ** 3 : 1 - (-2 * u + 2) ** 3 / 2;
      cam.target.lerpVectors(a.target, b.target, k);
      cam.az = lerpAngle(a.az, b.az, k);
      cam.el = a.el + (b.el - a.el) * k;
      cam.fov = a.fov + (b.fov - a.fov) * k;
      cam.h = Math.exp(Math.log(a.h) + (Math.log(b.h) - Math.log(a.h)) * k);
      if (u >= 1) {
        const r = flight.resolve;
        flight = null;
        r();
      }
    } else {
      const v = restView();
      cam.az = v.az;
      cam.el = v.el;
      cam.fov = v.fov;
      cam.h = v.h;
      cam.target.copy(v.target);
    }
    placeCamera();
  }

  function resize(): void {
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(width, height);
    clampView();
    updateCamera(0);
    renderer.render(scene, camera);
  }
  new ResizeObserver(resize).observe(container);

  // Picking. addHit marks an object. pick() finds the nearest marked object under a point.
  const hits: Object3D[] = [];
  const ray = new Raycaster();
  const ndc = new Vector2();
  function addHit(obj: Object3D, data: HitInfo): void {
    obj.userData.hit = data;
    hits.push(obj);
  }
  function removeHit(obj: Object3D): void {
    const i = hits.indexOf(obj);
    if (i >= 0) hits.splice(i, 1);
  }
  function pick(clientX: number, clientY: number): HitInfo | null {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    for (const h of ray.intersectObjects(hits, true)) {
      // A hit counts only when the object and all its parents show.
      let shown = true;
      for (let p: Object3D | null = h.object; p; p = p.parent)
        if (!p.visible && p !== h.object) shown = false;
      if (!shown) continue;
      for (let o: Object3D | null = h.object; o; o = o.parent) {
        const hit = readHit(o);
        if (hit) return hit;
      }
    }
    return null;
  }
  function hitPoint(clientX: number, clientY: number, obj: Object3D): Vector3 | null {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.intersectObject(obj, true)[0]?.point ?? null;
  }

  // Pointer input. A tap (or a click) calls the tap handlers. A drag pans, a pinch or the wheel
  // zooms. On a mouse, the cursor shows when a marked object is under it.
  const tapHandlers: TapHandler[] = [];
  const touches = new Map<number, { x: number; y: number }>();
  let down: { x: number; y: number; moved: boolean } | null = null;
  let pinched = false;
  canvas.addEventListener('pointerdown', (ev) => {
    down = { x: ev.clientX, y: ev.clientY, moved: false };
    touches.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (touches.size > 1) pinched = true;
    canvas.setPointerCapture?.(ev.pointerId);
  });
  canvas.addEventListener('pointermove', (ev) => {
    const prev = touches.get(ev.pointerId);
    if (!prev) {
      if (ev.pointerType === 'mouse')
        canvas.style.cursor = pick(ev.clientX, ev.clientY) ? 'pointer' : '';
      return;
    }
    const now = { x: ev.clientX, y: ev.clientY };
    if (down && Math.hypot(now.x - down.x, now.y - down.y) > 6) down.moved = true;
    if (panZoom && !flight && restView === overview) {
      if (touches.size === 1 && down?.moved) {
        panBy(now.x - prev.x, now.y - prev.y);
      } else if (touches.size === 2) {
        const other = [...touches].find(([id]) => id !== ev.pointerId)?.[1];
        if (other) {
          const r = canvas.getBoundingClientRect();
          const mid0 = { x: (prev.x + other.x) / 2 - r.left, y: (prev.y + other.y) / 2 - r.top };
          const mid1 = { x: (now.x + other.x) / 2 - r.left, y: (now.y + other.y) / 2 - r.top };
          const d0 = Math.hypot(prev.x - other.x, prev.y - other.y);
          const d1 = Math.hypot(now.x - other.x, now.y - other.y);
          if (d1 > 10) zoomAt(mid1.x, mid1.y, d0 / d1);
          panBy(mid1.x - mid0.x, mid1.y - mid0.y);
        }
      }
    }
    touches.set(ev.pointerId, now);
  });
  function endPointer(ev: PointerEvent): void {
    touches.delete(ev.pointerId);
    if (!touches.size) setTimeout(() => (pinched = false));
  }
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerup', (ev) => {
    const wasPinch = pinched;
    endPointer(ev);
    if (wasPinch || !down || down.moved) return;
    const data = pick(ev.clientX, ev.clientY);
    for (const fn of tapHandlers) fn(data, ev);
  });
  if (panZoom) {
    canvas.addEventListener(
      'wheel',
      (ev) => {
        if (flight || restView !== overview) return;
        ev.preventDefault();
        const r = canvas.getBoundingClientRect();
        zoomAt(ev.clientX - r.left, ev.clientY - r.top, Math.exp(ev.deltaY * 0.0015));
      },
      { passive: false },
    );
  }

  const tmp = new Vector3();
  function toScreen(p: Vector3): { x: number; y: number; behind: boolean } {
    tmp.copy(p).project(camera);
    return { x: ((tmp.x + 1) / 2) * width, y: ((1 - tmp.y) / 2) * height, behind: tmp.z > 1 };
  }

  resize();

  // The frame loop. start() stores it, so setRunning(true) can start it again.
  let frame: (() => void) | null = null;
  let last = 0;

  return {
    renderer,
    scene,
    hemi,
    sun,
    ground,
    camera,
    canvas,
    cam,
    ov,
    overview,
    rest(view = overview) {
      flight = null;
      restView = view;
    },
    flyTo,
    flying: () => !!flight,
    resting: () => restView,
    panBy,
    zoomAt,
    resetView() {
      ov.u = 0;
      ov.v = 0;
      ov.zoom = 1;
    },
    setRect(r) {
      room = { ...room, ...r };
      clampView();
    },
    setInsets(i) {
      pads = { ...pads, ...i };
      clampView();
    },
    size: () => ({ width, height }),
    addHit,
    removeHit,
    pick,
    hitPoint,
    onTap: (fn) => {
      tapHandlers.push(fn);
    },
    toScreen,
    start(update) {
      last = performance.now();
      frame = () => {
        const now = performance.now();
        const dt = Math.min((now - last) / 1000, MAX_DT);
        last = now;
        update(dt, now / 1000);
        updateCamera(dt);
        renderer.render(scene, camera);
      };
      renderer.setAnimationLoop(frame);
    },
    setRunning(running) {
      if (!running) {
        renderer.setAnimationLoop(null);
        return;
      }
      if (!frame) return;
      // The first step after a pause starts from now, not from the time of the pause.
      last = performance.now();
      renderer.setAnimationLoop(frame);
    },
  };
}
