import './style.css';
import './switch.css';
import { startSwitch } from './switch';

const firmHost = document.getElementById('yaldaq');
// Dev only: ?badges shows all 16 staff badges of the YALDAQ firm in place of the site.
if (import.meta.env.DEV && firmHost && new URLSearchParams(location.search).has('badges')) {
  document.getElementById('nick')?.setAttribute('data-active', 'false');
  document.getElementById('view-toggle')?.setAttribute('hidden', '');
  firmHost.dataset.active = 'true';
  void import('./yaldaq/badge/gallery').then((m) => m.mountGallery(firmHost));
} else {
  startSwitch();
}
