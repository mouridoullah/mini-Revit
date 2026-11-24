/**
 * ArchitecturalGridManager
 *
 * Gère la grille de sol horizontale XY (Z = 0), ses couleurs majeures/mineures
 * et l'arrière-plan de la scène 3D (ADR-072).
 */

import * as THREE from 'three';

export class ArchitecturalGridManager {
  private readonly gridHelper: THREE.GridHelper;
  private readonly gridMajorVertexMask: readonly boolean[];

  public constructor(scene: THREE.Scene, gridSize = 20000, gridDivisions = 20) {
    this.gridHelper = new THREE.GridHelper(gridSize, gridDivisions, 0x566070, 0x3a404c);
    const gridColors = this.gridHelper.geometry.getAttribute('color');
    const majorColor = new THREE.Color(0x566070);
    const minorColor = new THREE.Color(0x3a404c);
    this.gridMajorVertexMask = Array.from({ length: gridColors.count }, (_, index) => {
      const r = gridColors.getX(index);
      const g = gridColors.getY(index);
      const b = gridColors.getZ(index);
      const majorDistance = Math.hypot(r - majorColor.r, g - majorColor.g, b - majorColor.b);
      const minorDistance = Math.hypot(r - minorColor.r, g - minorColor.g, b - minorColor.b);
      return majorDistance < minorDistance;
    });

    // Bascule de la grille du plan XZ standard Three.js vers le plan XY architectural
    this.gridHelper.rotation.x = Math.PI / 2;
    scene.add(this.gridHelper);
  }

  public getGridHelper(): THREE.GridHelper {
    return this.gridHelper;
  }

  public setBackground(
    scene: THREE.Scene,
    background: THREE.ColorRepresentation,
    gridColors: readonly [THREE.ColorRepresentation, THREE.ColorRepresentation],
  ): void {
    scene.background = new THREE.Color(background);
    const colors = this.gridHelper.geometry.getAttribute('color');
    const majorColor = new THREE.Color(gridColors[0]);
    const minorColor = new THREE.Color(gridColors[1]);
    for (let index = 0; index < colors.count; index++) {
      const color = this.gridMajorVertexMask[index] ? majorColor : minorColor;
      colors.setXYZ(index, color.r, color.g, color.b);
    }
    colors.needsUpdate = true;
  }

  public dispose(scene: THREE.Scene): void {
    scene.remove(this.gridHelper);
    this.gridHelper.geometry.dispose();
    if (Array.isArray(this.gridHelper.material)) {
      this.gridHelper.material.forEach((m) => m.dispose());
    } else {
      this.gridHelper.material.dispose();
    }
  }
}
