import './style.css';
import type { Pose } from './eagle/actions';
import { createAnimator } from './eagle/animator';
import { createBrain } from './eagle/brain';
import { startManualKeys } from './eagle/manual-keys';
import { buildEagle } from './eagle/model';
import { addMountMarkers } from './eagle/mount-markers';
import { createRandom } from './lib/rng';
import { createStage } from './stage/stage';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('The page has no #app element.');

const params = new URLSearchParams(location.search);
const stage = createStage(app, { showBounds: params.has('bounds') });

const eagle = buildEagle();
stage.scene.add(eagle.root);
if (params.has('mounts')) addMountMarkers(eagle);

// ?seed=N replays the same moves. Without it, the seed is random.
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isNaN(seedParam) ? Math.floor(Math.random() * 2 ** 32) : seedParam >>> 0;
console.info(`Seed ${seed}. Add ?seed=${seed} to the address to see the same moves again.`);
const random = createRandom(seed);

// Start at the center of the bounds, facing +x (90°).
const bounds = stage.bounds();
const start: Pose = { x: bounds.x, z: bounds.z, facing: 2 };
const animator = createAnimator(eagle, start);

// ?manual turns the brain off. Keys start each action instead (see manual-keys.ts).
const brain = params.has('manual') ? null : createBrain(random, bounds, start);
if (!brain) startManualKeys(animator, start, random);

// With ?debug, the dev console can reach these objects as `yaldeagle`.
if (params.has('debug')) Reflect.set(window, 'yaldeagle', { stage, eagle, animator, brain });

stage.start((dt) => {
  if (brain) {
    brain.setBounds(stage.bounds());
    for (const action of brain.update(dt)) animator.play(action);
  }
  animator.update(dt);
  stage.follow(eagle.root.position.x, eagle.root.position.z);
});
