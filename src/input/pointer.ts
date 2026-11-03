// Connects the pointer to the room. Mouse: hover and the tooltip, and a click on an item or the
// floor. Touch: one finger pans, two fingers pinch to zoom, and a tap acts as a click.
import { Raycaster, Vector2, type Camera, type Object3D } from 'three';
import type { Exhibit } from '../room/exhibit';
import type { ItemId } from '../room/items';
import type { Tooltip } from '../room/tooltip';
import { createGestures } from './gestures';

export interface PointerHandlers {
  /** A click or a tap on an item. */
  open(id: ItemId): void;
  /** A click or a tap on the floor, or Esc. */
  floor(): void;
  /** True if hover can show now. */
  canHover(): boolean;
  /** A touch pan by (dx, dy) pixels. */
  pan(dx: number, dy: number): void;
  /** A pinch by the factor (above 1 zooms out) about the canvas point (x, y). */
  zoom(x: number, y: number, factor: number): void;
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

  /** A click or a tap at the screen point (x, y). */
  function press(x: number, y: number): void {
    const exhibit = pick(x, y);
    if (exhibit) handlers.open(exhibit.item.id);
    else handlers.floor();
  }

  // The gestures get canvas points, so a zoom keeps the right floor point in place.
  const local = (x: number, y: number): { x: number; y: number } => {
    const rect = canvas.getBoundingClientRect();
    return { x: x - rect.left, y: y - rect.top };
  };
  const gestures = createGestures({
    pan: (dx, dy) => handlers.pan(dx, dy),
    zoom: (x, y, factor) => handlers.zoom(x, y, factor),
    tap: (x, y) => {
      const rect = canvas.getBoundingClientRect();
      press(x + rect.left, y + rect.top);
    },
  });

  canvas.addEventListener('pointermove', (event) => {
    if (event.pointerType === 'touch') {
      const p = local(event.clientX, event.clientY);
      gestures.move(event.pointerId, p.x, p.y);
      return;
    }
    const next = handlers.canHover() ? pick(event.clientX, event.clientY) : null;
    setHovered(next);
    if (next) tooltip.show(next.item, event.clientX, event.clientY);
    else tooltip.hide();
  });

  canvas.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'touch') return;
    setHovered(null);
    tooltip.hide();
  });

  canvas.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch') {
      const p = local(event.clientX, event.clientY);
      gestures.down(event.pointerId, p.x, p.y);
      return;
    }
    down = { x: event.clientX, y: event.clientY };
  });

  canvas.addEventListener('pointerup', (event) => {
    if (event.pointerType === 'touch') {
      const p = local(event.clientX, event.clientY);
      gestures.up(event.pointerId, p.x, p.y);
      return;
    }
    const start = down;
    down = null;
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP) return;
    press(event.clientX, event.clientY);
  });

  canvas.addEventListener('pointercancel', (event) => {
    if (event.pointerType === 'touch') gestures.cancel(event.pointerId);
    else down = null;
  });

  addEventListener('keydown', (event) => {
    if (event.key === 'Escape') handlers.floor();
  });
}
