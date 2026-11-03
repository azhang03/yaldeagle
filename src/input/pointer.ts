// Connects the pointer to the room: hover and the tooltip, and a click on an item or the floor.
import { Raycaster, Vector2, type Camera, type Object3D } from 'three';
import type { Exhibit } from '../room/exhibit';
import type { ItemId } from '../room/items';
import type { Tooltip } from '../room/tooltip';

export interface PointerHandlers {
  /** A click on an item. */
  open(id: ItemId): void;
  /** A click on the floor, or Esc. */
  floor(): void;
  /** True if hover can show now. */
  canHover(): boolean;
}

/** A press and a release further apart than this (CSS pixels) are not a click. */
const CLICK_SLOP = 6;

export function attachPointer(
  canvas: HTMLCanvasElement,
  camera: Camera,
  exhibits: readonly Exhibit[],
  tooltip: Tooltip,
  handlers: PointerHandlers,
): void {
  const raycaster = new Raycaster();
  const ndc = new Vector2();
  const byHit = new Map<Object3D, Exhibit>(exhibits.map((e) => [e.hit, e]));
  const hits = exhibits.map((e) => e.hit);
  let hovered: Exhibit | null = null;
  let down: { x: number; y: number } | null = null;

  /** The exhibit under the screen point, or null. Hidden exhibits do not count. */
  function pick(x: number, y: number): Exhibit | null {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    for (const hit of raycaster.intersectObjects(hits, false)) {
      const exhibit = byHit.get(hit.object);
      if (exhibit && !exhibit.isHidden()) return exhibit;
    }
    return null;
  }

  function setHovered(next: Exhibit | null): void {
    if (next === hovered) return;
    hovered?.setHover(false);
    next?.setHover(true);
    hovered = next;
    canvas.style.cursor = next ? 'pointer' : '';
  }

  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') return;
    const next = handlers.canHover() ? pick(event.clientX, event.clientY) : null;
    setHovered(next);
    if (next) tooltip.show(next.item, event.clientX, event.clientY);
    else tooltip.hide();
  });

  canvas.addEventListener('pointerleave', () => {
    setHovered(null);
    tooltip.hide();
  });

  canvas.addEventListener('pointerdown', (event) => {
    down = { x: event.clientX, y: event.clientY };
  });

  canvas.addEventListener('pointerup', (event) => {
    const start = down;
    down = null;
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP) return;
    const exhibit = pick(event.clientX, event.clientY);
    if (exhibit) handlers.open(exhibit.item.id);
    else handlers.floor();
  });

  addEventListener('keydown', (event) => {
    if (event.key === 'Escape') handlers.floor();
  });
}
