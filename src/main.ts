import './style.css';
import { startNick } from './room/nick';

const firmHost = document.getElementById('yaldaq');
const params = new URLSearchParams(location.search);
const showFirm = (): void => {
  document.getElementById('nick')?.setAttribute('data-active', 'false');
  if (firmHost) firmHost.dataset.active = 'true';
};
// Dev only: ?badges shows all 16 staff badges, and ?firm shows the YALDAQ firm in place of
// Nick's room.
if (import.meta.env.DEV && firmHost && params.has('badges')) {
  showFirm();
  void import('./yaldaq/badge/gallery').then((m) => m.mountGallery(firmHost));
} else if (import.meta.env.DEV && firmHost && params.has('firm')) {
  showFirm();
  void import('./yaldaq/entry').then((m) =>
    m.mountFirm(firmHost, { onVisitChange: () => {} }).setActive(true),
  );
} else {
  startNick({ onVisitChange: () => {} });
}
