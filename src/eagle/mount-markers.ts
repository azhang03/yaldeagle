// A small dot on each mount point, for development. The dots show through the body.
import { Mesh, MeshBasicMaterial, SphereGeometry } from 'three';
import type { Eagle } from './model';

export function addMountMarkers(eagle: Eagle): void {
  const geometry = new SphereGeometry(0.035, 12, 8);
  const material = new MeshBasicMaterial({ color: '#e0457b', depthTest: false });
  for (const mount of Object.values(eagle.mounts)) {
    const dot = new Mesh(geometry, material);
    // Draw the dots after the body, so that the body does not hide them.
    dot.renderOrder = 1;
    mount.add(dot);
  }
}
