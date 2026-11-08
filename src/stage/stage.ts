// The white room: renderer, camera, light, ground, resize, and the frame loop.
import {
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  HemisphereLight,
  LineBasicMaterial,
  LineLoop,
  MathUtils,
  Mesh,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  Timer,
  WebGLRenderer,
} from 'three';
import { boundsPoint, type Bounds } from '../lib/bounds';
import { cameraPosition, nearFar, type CameraView } from '../lib/view';

/** Half the size of the shadow camera. It covers the whole room. */
const SHADOW_HALF = 13;
/** The largest time step for one frame, in seconds. */
const MAX_DT = 0.05;

export interface StageOptions {
  /** Draws the bounds on the ground, for development. Null draws nothing. */
  readonly outline: Bounds | null;
}

export interface Stage {
  readonly scene: Scene;
  readonly camera: PerspectiveCamera;
  readonly canvas: HTMLCanvasElement;
  /** Places the camera at the view. */
  setView(view: CameraView): void;
  /** The container width divided by its height. */
  aspect(): number;
  /** The container size in CSS pixels. */
  viewport(): { width: number; height: number };
  /** Starts the frame loop. Each frame calls `update` with the time step in seconds. */
  start(update: (dt: number) => void): void;
  /** Stops or starts the frame loop again. Before `start`, true does nothing. */
  setRunning(running: boolean): void;
}

export function createStage(container: HTMLElement, options: StageOptions): Stage {
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  // Clipping planes cut the items that are in progress.
  renderer.localClippingEnabled = true;
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color('#ffffff');
  scene.add(new HemisphereLight('#ffffff', '#b8b0a2', 1.85));

  // The sun stays over the room, so its shadow camera covers the whole room.
  const sun = new DirectionalLight('#ffffff', 1.35);
  sun.position.set(-3, 10, 5);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -SHADOW_HALF,
    right: SHADOW_HALF,
    top: SHADOW_HALF,
    bottom: -SHADOW_HALF,
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

  const camera = new PerspectiveCamera();
  if (options.outline) scene.add(createOutline(options.outline));

  let width = 1;
  let height = 1;
  let lastView: CameraView | null = null;

  function setView(view: CameraView): void {
    lastView = view;
    const p = cameraPosition(view);
    camera.position.set(p.x, p.y, p.z);
    camera.lookAt(view.target.x, view.target.y, view.target.z);
    const { near, far } = nearFar(view);
    camera.fov = view.fov;
    camera.aspect = width / height;
    camera.near = near;
    camera.far = far;
    camera.updateProjectionMatrix();
  }

  function resize(): void {
    // A hidden container has size 0. Use 1 so that the aspect stays finite.
    width = Math.max(1, container.clientWidth);
    height = Math.max(1, container.clientHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(width, height);
    if (lastView) setView(lastView);
    // setSize clears the canvas after the frame was drawn. Draw again, so a resize does not
    // show a blank frame.
    renderer.render(scene, camera);
  }
  resize();
  new ResizeObserver(resize).observe(container);
  // A move to a screen with a different pixel ratio does not change the container size, so the
  // observer does not see it. This media query does. It matches only one ratio, so make a new
  // one after each change.
  function watchPixelRatio(): void {
    matchMedia(`(resolution: ${devicePixelRatio}dppx)`).addEventListener(
      'change',
      () => {
        resize();
        watchPixelRatio();
      },
      { once: true },
    );
  }
  watchPixelRatio();

  let frame: ((time: number) => void) | null = null;

  function start(update: (dt: number) => void): void {
    const timer = new Timer();
    // With the document connected, the timer ignores the time while the tab is hidden.
    timer.connect(document);
    frame = (time) => {
      timer.update(time);
      // The first step after a start, a pause, or a hidden tab can be large or slightly below 0.
      update(MathUtils.clamp(timer.getDelta(), 0, MAX_DT));
      renderer.render(scene, camera);
    };
    renderer.setAnimationLoop(frame);
  }

  function setRunning(running: boolean): void {
    if (!frame) return;
    renderer.setAnimationLoop(running ? frame : null);
  }

  return {
    scene,
    camera,
    canvas: renderer.domElement,
    setView,
    aspect: () => width / height,
    viewport: () => ({ width, height }),
    start,
    setRunning,
  };
}

// The outline lines for development. They are above the patches and the floor rings, so those do
// not hide the lines.
const outlineMaterial = new LineBasicMaterial({ color: '#e0457b' });
const OUTLINE_Y = 0.03;

/** A line on the ground around the bounds, for development. */
function createOutline(bounds: Bounds): LineLoop {
  const y = OUTLINE_Y;
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const;
  const box = new LineLoop(
    loopGeometry(
      corners.map(([su, sv]) => {
        const p = boundsPoint(bounds, su * bounds.halfU, sv * bounds.halfV);
        return [p.x, y, p.z];
      }),
    ),
    outlineMaterial,
  );
  return box;
}

/** A line on the ground around the point (0, 0), for development. Add it to a moving object. */
export function createCircleLine(radius: number): LineLoop {
  const segments = 48;
  const points: [number, number, number][] = [];
  for (let i = 0; i < segments; i++) {
    const a = (i / segments) * 2 * Math.PI;
    points.push([radius * Math.cos(a), OUTLINE_Y, radius * Math.sin(a)]);
  }
  return new LineLoop(loopGeometry(points), outlineMaterial);
}

function loopGeometry(points: readonly (readonly [number, number, number])[]): BufferGeometry {
  return new BufferGeometry().setAttribute(
    'position',
    new BufferAttribute(new Float32Array(points.flat()), 3),
  );
}
