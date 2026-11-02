import './style.css';
import { BoxGeometry, Mesh, MeshLambertMaterial } from 'three';
import { createStage } from './stage/stage';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('The page has no #app element.');

const params = new URLSearchParams(location.search);
const stage = createStage(app, { showBounds: params.has('bounds') });

// A box with the size of the eagle. F3 replaces it with the eagle model.
const eagle = new Mesh(new BoxGeometry(1, 1.4, 0.8), new MeshLambertMaterial({ color: '#55341d' }));
eagle.position.y = 0.7;
eagle.castShadow = true;
stage.scene.add(eagle);

stage.start(() => {
  stage.follow(eagle.position.x, eagle.position.z);
});
