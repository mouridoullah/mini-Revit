import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ArchitecturalGridManager } from './ArchitecturalGridManager.js';

describe('ArchitecturalGridManager (ADR-072)', () => {
  it('instancie la grille sur le plan horizontal architectural XY', () => {
    const scene = new THREE.Scene();
    const manager = new ArchitecturalGridManager(scene, 10000, 10);
    const grid = manager.getGridHelper();

    expect(grid).toBeDefined();
    expect(scene.children).toContain(grid);
    expect(grid.rotation.x).toBeCloseTo(Math.PI / 2);

    manager.dispose(scene);
    expect(scene.children).not.toContain(grid);
  });

  it('permet de modifier la couleur de fond et les couleurs de la grille', () => {
    const scene = new THREE.Scene();
    const manager = new ArchitecturalGridManager(scene, 10000, 10);

    manager.setBackground(scene, 0x112233, [0x445566, 0x778899]);
    expect((scene.background as THREE.Color).getHex()).toBe(0x112233);

    manager.dispose(scene);
  });
});
