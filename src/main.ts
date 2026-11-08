import './style.css';
import { startNick } from './room/nick';

const firmHost = document.getElementById('yaldaq');
// Dev only: ?firm shows the YALDAQ firm in place of Nick's room.
if (import.meta.env.DEV && firmHost && new URLSearchParams(location.search).has('firm')) {
  document.getElementById('nick')?.setAttribute('data-active', 'false');
  firmHost.dataset.active = 'true';
  void import('./yaldaq/entry').then((m) =>
    m.mountFirm(firmHost, { onVisitChange: () => {} }).setActive(true),
  );
} else {
  startNick({ onVisitChange: () => {} });
}
