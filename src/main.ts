import './style.css';
import type { Pose } from './eagle/actions';
import { createAnimator } from './eagle/animator';
import { startManualKeys } from './eagle/manual-keys';
import { buildEagle } from './eagle/model';
import { addMountMarkers } from './eagle/mount-markers';
import { createStage } from './stage/stage';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('The page has no #app element.');

const params = new URLSearchParams(location.search);
const stage = createStage(app, { showBounds: params.has('bounds') });

const eagle = buildEagle();
stage.scene.add(eagle.root);
if (params.has('mounts')) addMountMarkers(eagle);

// Start at the center of the bounds, facing +x (90°).
const bounds = stage.bounds();
const start: Pose = { x: bounds.x, z: bounds.z, facing: 2 };
const animator = createAnimator(eagle, start);
startManualKeys(animator, start, Math.random);

// With ?debug, the dev console can reach these objects as `yaldeagle`.
if (params.has('debug')) Reflect.set(window, 'yaldeagle', { stage, eagle, animator });

stage.start((dt) => {
  animator.update(dt);
  stage.follow(eagle.root.position.x, eagle.root.position.z);
});
