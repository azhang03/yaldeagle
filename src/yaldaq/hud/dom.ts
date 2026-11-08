// DOM helpers for the HUD.

const last = new WeakMap<HTMLElement, string>();

/** Writes html into el only when it changed, so buttons inside keep working between frames. */
export function setHTML(el: HTMLElement, html: string): void {
  if (last.get(el) === html) return;
  el.innerHTML = html;
  last.set(el, html);
}
