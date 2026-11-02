import './style.css';
import { buildEagle } from './eagle/model';
import { addMountMarkers } from './eagle/mount-markers';
import { createStage } from './stage/stage';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('The page has no #app element.');

const params = new URLSearchParams(location.search);
const stage = createStage(app, { showBounds: params.has('bounds') });

const eagle = buildEagle();
// Face +x (90°), close to the three-quarter view of the mockup. F4 sets the facing.
eagle.root.rotation.y = Math.PI / 2;
stage.scene.add(eagle.root);
if (params.has('mounts')) addMountMarkers(eagle);
// With ?debug, the dev console can reach the stage and the eagle as `yaldeagle`.
if (params.has('debug')) Reflect.set(window, 'yaldeagle', { stage, eagle });

stage.start(() => {
  stage.follow(eagle.root.position.x, eagle.root.position.z);
});
