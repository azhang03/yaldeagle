// Connects the pointer to the room. Mouse: hover and the tooltip, a click on an item or the floor,
// and a drag of an item. Touch: one finger pans, two fingers pinch to zoom, a tap acts as a click,
// and a long press on an item starts its drag.
import { Plane, Raycaster, Vector2, Vector3, type Camera, type Object3D } from 'three';
import type { Exhibit } from '../room/exhibit';
import type { ItemId } from '../room/items';
import type { Tooltip } from '../room/tooltip';
import { createGestures } from './gestures';

export interface PointerHandlers {
  /** A click or a tap on an item. */
  open(id: ItemId): void;
  /** A click or a tap on the floor at the ground point, or Esc (then the point is null). */
  floor(point: { x: number; z: number } | null): void;
  /** True if hover can show now. */
  canHover(): boolean;
  /** A touch pan by (dx, dy) pixels. */
  pan(dx: number, dy: number): void;
  /** A pinch by the factor (above 1 zooms out) about the canvas point (x, y). */
  zoom(x: number, y: number, factor: number): void;
  /** True if an item can be dragged now. */
  canDrag(): boolean;
  /** A drag moves the item center to the ground point. */
  drag(id: ItemId, point: { x: number; z: number }): void;
}

/** A press and a release further apart than this (CSS pixels) are not a click. */
const CLICK_SLOP = 6;
/** A touch on an item for this long (ms) without a move starts a drag. */
const LONG_PRESS = 400;

/** An item that a pointer holds. `offset` keeps the point where the item was grabbed. */
interface Hold {
  readonly exhibit: Exhibit;
  readonly pointerId: number;
  readonly start: { x: number; y: number };
  readonly offset: { x: number; z: number };
}

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
  const ground = new Plane(new Vector3(0, 1, 0), 0);
  const hitPoint = new Vector3();
  let hovered: Exhibit | null = null;
  let down: { x: number; y: number } | null = null;

  /** Aims the ray through the screen point. */
  function aim(x: number, y: number): void {
    const rect = canvas.getBoundingClientRect();
    ndc.set(((x - rect.left) / rect.width) * 2 - 1, -((y - rect.top) / rect.height) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
  }

  /** The ground point under the screen point, or null if the ray misses the ground. */
  function groundAt(x: number, y: number): { x: number; z: number } | null {
    aim(x, y);
    const p = raycaster.ray.intersectPlane(ground, hitPoint);
    return p ? { x: p.x, z: p.z } : null;
  }

  /** The exhibit under the screen point, or null. Hidden exhibits do not count. */
  function pick(x: number, y: number): Exhibit | null {
    aim(x, y);
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
    else handlers.floor(groundAt(x, y));
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

  /** A press on an item that can become a drag, and the drag itself. */
  let hold: Hold | null = null;
  let dragging = false;
  let longPress: number | null = null;
  const touches = new Set<number>();

  function holdAt(exhibit: Exhibit, pointerId: number, x: number, y: number): Hold | null {
    const g = groundAt(x, y);
    if (!g) return null;
    const p = exhibit.root.position;
    return { exhibit, pointerId, start: { x, y }, offset: { x: p.x - g.x, z: p.z - g.z } };
  }

  function stopLongPress(): void {
    if (longPress !== null) window.clearTimeout(longPress);
    longPress = null;
  }

  function startDrag(): void {
    if (!hold) return;
    if (!handlers.canDrag()) {
      endHold();
      return;
    }
    dragging = true;
    stopLongPress();
    tooltip.hide();
    setHovered(hold.exhibit);
    canvas.style.cursor = 'grabbing';
  }

  function moveDrag(x: number, y: number): void {
    // A visit can start during a drag (for example, one that waited for a trip). It ends the drag.
    if (!handlers.canDrag()) {
      endHold();
      return;
    }
    const g = hold && groundAt(x, y);
    if (!hold || !g) return;
    handlers.drag(hold.exhibit.item.id, { x: g.x + hold.offset.x, z: g.z + hold.offset.z });
  }

  function endHold(): void {
    stopLongPress();
    if (dragging) setHovered(null);
    hold = null;
    dragging = false;
  }

  const moved = (h: Hold, x: number, y: number): boolean =>
    Math.hypot(x - h.start.x, y - h.start.y) > CLICK_SLOP;

  canvas.addEventListener('pointermove', (event) => {
    const { clientX: x, clientY: y } = event;
    if (hold?.pointerId === event.pointerId) {
      if (dragging) {
        moveDrag(x, y);
        return;
      }
      if (moved(hold, x, y)) {
        // A mouse drag starts with the move. A touch that moves before the long press pans.
        if (event.pointerType === 'touch') endHold();
        else {
          canvas.setPointerCapture(event.pointerId);
          startDrag();
          moveDrag(x, y);
          return;
        }
      }
    }
    if (event.pointerType === 'touch') {
      const p = local(x, y);
      gestures.move(event.pointerId, p.x, p.y);
      return;
    }
    const next = handlers.canHover() ? pick(x, y) : null;
    setHovered(next);
    if (next) tooltip.show(next.item, x, y);
    else tooltip.hide();
  });

  canvas.addEventListener('pointerleave', (event) => {
    if (event.pointerType === 'touch' || dragging) return;
    setHovered(null);
    tooltip.hide();
  });

  canvas.addEventListener('pointerdown', (event) => {
    const { clientX: x, clientY: y } = event;
    const exhibit = handlers.canDrag() ? pick(x, y) : null;
    if (event.pointerType === 'touch') {
      touches.add(event.pointerId);
      // During a touch drag, other fingers do nothing: no pan, no pinch, and no tap.
      if (dragging) return;
      const p = local(x, y);
      gestures.down(event.pointerId, p.x, p.y);
      if (touches.size > 1) {
        // A second finger is a pinch, not a drag.
        endHold();
        return;
      }
      hold = exhibit && holdAt(exhibit, event.pointerId, x, y);
      if (hold) {
        const id = event.pointerId;
        longPress = window.setTimeout(() => {
          longPress = null;
          if (hold?.pointerId !== id || !handlers.canDrag()) return;
          // The gestures stop for this finger, so it gives no pan and no tap.
          gestures.cancel(id);
          startDrag();
          navigator.vibrate?.(15);
        }, LONG_PRESS);
      }
      return;
    }
    down = { x, y };
    hold = exhibit && holdAt(exhibit, event.pointerId, x, y);
  });

  canvas.addEventListener('pointerup', (event) => {
    const wasDrag = dragging && hold?.pointerId === event.pointerId;
    if (hold?.pointerId === event.pointerId) endHold();
    if (event.pointerType === 'touch') {
      touches.delete(event.pointerId);
      if (wasDrag) return;
      const p = local(event.clientX, event.clientY);
      gestures.up(event.pointerId, p.x, p.y);
      return;
    }
    const start = down;
    down = null;
    if (wasDrag) {
      canvas.style.cursor = '';
      return;
    }
    if (!start || Math.hypot(event.clientX - start.x, event.clientY - start.y) > CLICK_SLOP) return;
    press(event.clientX, event.clientY);
  });

  canvas.addEventListener('pointercancel', (event) => {
    if (hold?.pointerId === event.pointerId) endHold();
    if (event.pointerType === 'touch') {
      touches.delete(event.pointerId);
      gestures.cancel(event.pointerId);
    } else down = null;
  });

  // A long press on a touch screen can open the page menu. The canvas has none.
  canvas.addEventListener('contextmenu', (event) => event.preventDefault());

  addEventListener('keydown', (event) => {
    if (event.key === 'Escape') handlers.floor(null);
  });
}
