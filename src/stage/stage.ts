// The empty white space: renderer, camera, light, ground, resize, and the frame loop.
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
  OrthographicCamera,
  PCFShadowMap,
  PlaneGeometry,
  Scene,
  ShadowMaterial,
  Timer,
  Vector3,
  WebGLRenderer,
} from 'three';
import { boundsPoint, viewBounds, type Bounds, type Margin } from '../lib/bounds';

const AZIMUTH = MathUtils.degToRad(30);
const ELEVATION = MathUtils.degToRad(38);
/** Half the view height in world units on a wide screen. */
const HALF_HEIGHT = 3;
/** Half the view width does not go below this. A narrow screen shows more height instead. */
const MIN_HALF_WIDTH = 2.5;
/**
 * Keeps the full eagle on the screen when its feet are on the bounds edge. The top margin is
 * larger because the body is above the feet (about 1.4 units tall, plus the hop).
 */
const MARGIN: Margin = { side: 0.8, top: 2, bottom: 0.6 };
/** The sun position relative to the point that it follows. */
const SUN_OFFSET = new Vector3(-3, 10, 5);
/** Half the size of the shadow camera. The shadow is sharp only inside it. */
const SHADOW_HALF = 4;
/** The largest time step for one frame, in seconds. */
const MAX_DT = 0.05;

export interface StageOptions {
  /** Draws the outline of the bounds on the ground. */
  readonly showBounds: boolean;
}

export interface Stage {
  readonly scene: Scene;
  /** The ground rectangle that the eagle can use. It changes when the window size changes. */
  bounds(): Bounds;
  /** Moves the sun and its shadow camera to the ground point (x, z). */
  follow(x: number, z: number): void;
  /** Starts the frame loop. Each frame calls `update` with the time step in seconds. */
  start(update: (dt: number) => void): void;
}

export function createStage(container: HTMLElement, options: StageOptions): Stage {
  const renderer = new WebGLRenderer({ antialias: true });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  container.appendChild(renderer.domElement);

  const scene = new Scene();
  scene.background = new Color('#ffffff');
  scene.add(new HemisphereLight('#ffffff', '#b8b0a2', 1.85));

  const sun = new DirectionalLight('#ffffff', 1.35);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  Object.assign(sun.shadow.camera, {
    left: -SHADOW_HALF,
    right: SHADOW_HALF,
    top: SHADOW_HALF,
    bottom: -SHADOW_HALF,
    near: 1,
    far: 30,
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

  // The camera looks at the ground origin and does not move.
  const camera = new OrthographicCamera();
  const distance = 30;
  camera.position.set(
    distance * Math.cos(ELEVATION) * Math.sin(AZIMUTH),
    distance * Math.sin(ELEVATION),
    distance * Math.cos(ELEVATION) * Math.cos(AZIMUTH),
  );
  camera.lookAt(0, 0, 0);
  camera.near = 0.1;
  camera.far = 100;

  const outline = options.showBounds ? createOutline() : null;
  if (outline) scene.add(outline.line);

  let bounds: Bounds;
  function resize(): void {
    // A hidden container has size 0. Use 1 so that the aspect stays finite.
    const width = Math.max(1, container.clientWidth);
    const height = Math.max(1, container.clientHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.setSize(width, height);
    const aspect = width / height;
    const halfHeight = Math.max(HALF_HEIGHT, MIN_HALF_WIDTH / aspect);
    const halfWidth = halfHeight * aspect;
    camera.left = -halfWidth;
    camera.right = halfWidth;
    camera.top = halfHeight;
    camera.bottom = -halfHeight;
    camera.updateProjectionMatrix();
    bounds = viewBounds(
      { x: 0, z: 0, azimuth: AZIMUTH, elevation: ELEVATION, halfWidth, halfHeight },
      MARGIN,
    );
    outline?.update(bounds);
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

  function follow(x: number, z: number): void {
    sun.target.position.set(x, 0, z);
    sun.position.set(x, 0, z).add(SUN_OFFSET);
  }
  follow(0, 0);

  function start(update: (dt: number) => void): void {
    const timer = new Timer();
    // With the document connected, the timer ignores the time while the tab is hidden.
    timer.connect(document);
    renderer.setAnimationLoop((time) => {
      timer.update(time);
      // The first step after a start or a hidden tab can be slightly below 0.
      update(MathUtils.clamp(timer.getDelta(), 0, MAX_DT));
      renderer.render(scene, camera);
    });
  }

  return { scene, bounds: () => bounds, follow, start };
}

/** A line on the ground around the bounds, for development. */
function createOutline(): { line: LineLoop; update(bounds: Bounds): void } {
  const positions = new BufferAttribute(new Float32Array(4 * 3), 3);
  const geometry = new BufferGeometry().setAttribute('position', positions);
  const line = new LineLoop(geometry, new LineBasicMaterial({ color: '#e0457b' }));
  const corners = [
    [-1, -1],
    [1, -1],
    [1, 1],
    [-1, 1],
  ] as const;
  return {
    line,
    update(bounds) {
      corners.forEach(([su, sv], i) => {
        const p = boundsPoint(bounds, su * bounds.halfU, sv * bounds.halfV);
        // Slightly above the ground, so the ground does not hide the line.
        positions.setXYZ(i, p.x, 0.01, p.z);
      });
      positions.needsUpdate = true;
      geometry.computeBoundingSphere();
    },
  };
}
