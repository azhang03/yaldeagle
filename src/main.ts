import './style.css';
import type { Pose } from './eagle/actions';
import { createAnimator } from './eagle/animator';
import { createBrain } from './eagle/brain';
import { startManualKeys } from './eagle/manual-keys';
import { buildEagle } from './eagle/model';
import { addMountMarkers } from './eagle/mount-markers';
import { attachPointer } from './input/pointer';
import { createRandom } from './lib/rng';
import { ROOM_BOUNDS, roomPoint } from './lib/room';
import { overview, startOffset } from './lib/view';
import { buildPanel } from './panel/build';
import { panelContent } from './panel/content';
import { createExhibit } from './room/exhibit';
import { addGear } from './room/gear';
import { ITEM_CLEARANCE, ITEMS } from './room/items';
import { createTooltip } from './room/tooltip';
import { createStage } from './stage/stage';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('The page has no #app element.');

const params = new URLSearchParams(location.search);
// The eagle does not land near an item.
const obstacles = ITEMS.map((item) => ({ ...roomPoint(item.u, item.v), radius: ITEM_CLEARANCE }));
const stage = createStage(app, {
  outline: params.has('bounds') ? { bounds: ROOM_BOUNDS, circles: obstacles } : null,
});

const exhibits = ITEMS.map(createExhibit);
for (const exhibit of exhibits) stage.scene.add(exhibit.root);

const eagle = buildEagle();
stage.scene.add(eagle.root);
addGear(eagle, ITEMS);
if (params.has('mounts')) addMountMarkers(eagle);

// ?seed=N replays the same moves. Without it, the seed is random.
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isNaN(seedParam) ? Math.floor(Math.random() * 2 ** 32) : seedParam >>> 0;
console.info(`Seed ${seed}. Add ?seed=${seed} to the address to see the same moves again.`);
const random = createRandom(seed);

// Start near the middle of the room, facing +x (90°).
const start: Pose = { ...roomPoint(0, 0.6), facing: 2 };
const animator = createAnimator(eagle, start);

// ?manual turns the brain off. Keys start each action instead (see manual-keys.ts).
const brain = params.has('manual') ? null : createBrain(random, ROOM_BOUNDS, obstacles, start);
if (!brain) startManualKeys(animator, start, random);

const offset = startOffset(stage.aspect());

// With ?debug, the dev console can reach these objects as `yaldeagle`.
if (params.has('debug')) {
  Reflect.set(window, 'yaldeagle', { stage, eagle, animator, brain, exhibits });
}

const host = document.querySelector<HTMLElement>('#panel-host');
if (!host) throw new Error('The page has no #panel-host element.');

// ?panel=<id> opens the panel of one item at once, without a visit. Esc or × closes it.
const panelId = params.get('panel');
if (panelId !== null) {
  const item = ITEMS.find((it) => it.id === panelId);
  if (item) {
    const close = (): void => void panel.demolish();
    const panel = buildPanel(host, panelContent(item), {
      speed: params.has('slow') ? 0.25 : 1,
      onClose: close,
    });
    addEventListener('keydown', (event) => {
      if (event.key === 'Escape') close();
    });
  } else {
    console.warn(`Unknown item "${panelId}" in ?panel.`);
  }
}

// Hover and the tooltip. A click starts a visit after the visit batch.
attachPointer(stage.canvas, stage.camera, exhibits, createTooltip(), {
  open: () => undefined,
  floor: () => undefined,
  canHover: () => true,
});

stage.start((dt) => {
  if (brain) for (const action of brain.update(dt)) animator.play(action);
  animator.update(dt);
  for (const exhibit of exhibits) exhibit.update(dt);
  stage.setView(overview(stage.aspect(), offset));
});
