/**
 * ClashOverlayManager
 *
 * Gère l'affichage en surimpression 3D des zones d'interférence et points d'impact
 * détectés par le moteur de Clash Detection (ADR-059, ADR-071, ADR-072).
 *
 * - Hard clash : boîte filaire rouge (0xef4444) avec volume translucide
 * - Clearance : boîte filaire ambre (0xf59e0b) avec volume translucide
 * - Point de contact : sphère filaire repère (rayon 35 mm)
 */

import * as THREE from 'three';
import type { ClashOverlayItem } from '../types.js';

export class ClashOverlayManager {
  private readonly group: THREE.Group = new THREE.Group();
  private readonly scene: THREE.Scene;

  public constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.group.name = '__clash_overlays__';
    scene.add(this.group);
  }

  public getGroup(): THREE.Group {
    return this.group;
  }

  public clear(): void {
    while (this.group.children.length > 0) {
      const child = this.group.children[0];
      if (!child) break;
      this.group.remove(child);
      if (child instanceof THREE.Mesh || child instanceof THREE.LineSegments) {
        child.geometry?.dispose();
        if (Array.isArray(child.material)) {
          child.material.forEach((m) => m.dispose());
        } else if (child.material) {
          child.material.dispose();
        }
      }
    }
  }

  public setClashOverlays(clashes: readonly ClashOverlayItem[]): void {
    this.clear();

    for (const clash of clashes) {
      const isHard = clash.severity === 'hard';
      const color = isHard ? 0xef4444 : 0xf59e0b;
      const min = clash.intersectionBox.min;
      const max = clash.intersectionBox.max;

      // Dimensions de la boîte d'interférence avec épaisseur minimale visible
      const dx = Math.max(Math.abs(max.x - min.x), 30);
      const dy = Math.max(Math.abs(max.y - min.y), 30);
      const dz = Math.max(Math.abs(max.z - min.z), 30);

      const cx = (min.x + max.x) / 2;
      const cy = (min.y + max.y) / 2;
      const cz = (min.z + max.z) / 2;

      // 1. Volume translucide
      const boxGeo = new THREE.BoxGeometry(dx, dy, dz);
      const boxMat = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.25,
        depthWrite: false,
      });
      const boxMesh = new THREE.Mesh(boxGeo, boxMat);
      boxMesh.position.set(cx, cy, cz);
      this.group.add(boxMesh);

      // 2. Arêtes filaires accentuées
      const edgesGeo = new THREE.EdgesGeometry(boxGeo);
      const lineMat = new THREE.LineBasicMaterial({ color });
      const lineSegments = new THREE.LineSegments(edgesGeo, lineMat);
      lineSegments.position.set(cx, cy, cz);
      this.group.add(lineSegments);

      // 3. Repère ponctuel au point de contact
      if (clash.point) {
        const sphereGeo = new THREE.SphereGeometry(35, 8, 8);
        const sphereMat = new THREE.MeshBasicMaterial({
          color,
          wireframe: true,
        });
        const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
        sphereMesh.position.set(clash.point.x, clash.point.y, clash.point.z);
        this.group.add(sphereMesh);
      }
    }
  }

  public dispose(): void {
    this.clear();
    this.scene.remove(this.group);
  }
}
