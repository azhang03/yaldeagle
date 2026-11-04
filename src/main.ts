import './style.css';
import type { Pose } from './eagle/actions';
import { createAnimator } from './eagle/animator';
import { createBrain } from './eagle/brain';
import { startManualKeys } from './eagle/manual-keys';
import { buildEagle } from './eagle/model';
import { addMountMarkers } from './eagle/mount-markers';
import { attachPointer } from './input/pointer';
import { createRandom } from './lib/rng';
import { ROOM_BOUNDS, roomCoords, roomPoint } from './lib/room';
import { clampOffset, panBy, startOffset, zoomAt } from './lib/view';
import { buildPanel } from './panel/build';
import { panelContent } from './panel/content';
import { createExhibit } from './room/exhibit';
import { createGear } from './room/gear';
import { ITEM_CLEARANCE, ITEMS } from './room/items';
import { clampPlace } from './room/place';
import { createTooltip } from './room/tooltip';
import { createVisits } from './room/visit';
import { createCircleLine, createStage } from './stage/stage';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('The page has no #app element.');

const params = new URLSearchParams(location.search);
const stage = createStage(app, { outline: params.has('bounds') ? ROOM_BOUNDS : null });

const exhibits = ITEMS.map(createExhibit);
const exhibitById = new Map(exhibits.map((e) => [e.item.id, e]));
for (const exhibit of exhibits) stage.scene.add(exhibit.root);
// The eagle does not land near an item. A drag moves the circle with its item. The brain and the
// trips read this list, so they use the places of the moment.
const obstacles = ITEMS.map((item) => ({ ...roomPoint(item.u, item.v), radius: ITEM_CLEARANCE }));
const obstacleById = new Map(ITEMS.map((item, i) => [item.id, obstacles[i]]));
// ?bounds draws each circle on its item, so it moves with the item.
if (params.has('bounds')) {
  for (const exhibit of exhibits) exhibit.root.add(createCircleLine(ITEM_CLEARANCE));
}

const eagle = buildEagle();
stage.scene.add(eagle.root);
// The eagle starts with no gear. A visit to an earned item puts its gear on.
const gear = createGear(eagle, ITEMS);
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

const offset = startOffset(stage.aspect());

const host = document.querySelector<HTMLElement>('#panel-host');
if (!host) throw new Error('The page has no #panel-host element.');

const visits = createVisits({
  animator,
  brain,
  exhibits: exhibitById,
  obstacles,
  gear,
  host,
  offset,
  aspect: () => stage.aspect(),
  slow: params.has('slow'),
});
if (!brain) startManualKeys(animator, start, random, () => visits.mode() === 'wander');

// A click or a tap counts in wander, in a trip, and in focus. A click on the floor sends the eagle
// there while it wanders, and ends a visit in focus.
const tooltip = createTooltip();
const canAct = (): boolean => ['wander', 'running', 'focus'].includes(visits.mode());
// The overview moves only when the camera is in the overview.
const inOverview = (): boolean => visits.mode() === 'wander' || visits.mode() === 'running';
attachPointer(stage.canvas, stage.camera, exhibits, tooltip, {
  open: (id) => {
    if (!canAct()) return;
    void visits.open(id);
    tooltip.hide();
  },
  floor: (point) => {
    if (point && inOverview()) visits.runTo(point);
    else void visits.close();
    tooltip.hide();
  },
  canHover: canAct,
  // Touch pan and zoom.
  pan: (dx, dy) => {
    if (inOverview()) panBy(offset, dx, dy, stage.viewport(), stage.aspect());
  },
  zoom: (x, y, factor) => {
    if (inOverview()) zoomAt(offset, x, y, factor, stage.viewport(), stage.aspect());
  },
  // A drag moves an item, while the camera shows the overview.
  canDrag: inOverview,
  drag: (id, point) => {
    const exhibit = exhibitById.get(id);
    const obstacle = obstacleById.get(id);
    if (!exhibit || !obstacle) return;
    const { u, v } = roomCoords(point.x, point.z);
    const place = clampPlace(u, v);
    exhibit.moveTo(place.u, place.v);
    const p = roomPoint(place.u, place.v);
    obstacle.x = p.x;
    obstacle.z = p.z;
  },
});

// With ?debug, the dev console can reach these objects as `yaldeagle`.
if (params.has('debug')) {
  Reflect.set(window, 'yaldeagle', { stage, eagle, animator, brain, exhibits, visits, gear });
}

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

stage.start((dt) => {
  // The brain stops during a visit. The visit moves the eagle then.
  if (brain && visits.mode() === 'wander') {
    for (const action of brain.update(dt)) animator.play(action);
  }
  visits.update(dt);
  animator.update(dt);
  for (const exhibit of exhibits) exhibit.update(dt);
  gear.update(dt);
  // A resize can change the limits of the offset.
  clampOffset(offset, stage.aspect());
  stage.setView(visits.view());
});
