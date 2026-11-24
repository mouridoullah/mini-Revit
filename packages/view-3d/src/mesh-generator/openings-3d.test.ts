import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { createWindowGroup, createDoorGroup } from './openings-3d.js';
import type { OpeningGeometryParams, WallGeometryParams, WallTypeGeometryParams } from './types.js';

describe('openings-3d (Menuiseries architecturales d exécution — ADR-072)', () => {
  const wall: WallGeometryParams = {
    id: 'wall_1',
    start: { x: 0, y: 0 },
    end: { x: 5000, y: 0 },
  };

  const wallType: WallTypeGeometryParams = {
    thickness: 200,
    height: 2800,
  };

  it('génère un groupe 3D complet pour une fenêtre avec cadre dormant, ouvrant, appui et vitrage', () => {
    const opening: OpeningGeometryParams = {
      id: 'win_1',
      kind: 'window',
      offsetAlong: 1500,
      width: 1200,
      height: 1400,
      sillHeight: 900,
    };

    const group = createWindowGroup(opening, wall, wallType, 0);
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.name).toBe('window-win_1');

    // Vérifie la présence des sous-maillages
    const meshes: THREE.Mesh[] = [];
    group.traverse((c) => {
      if (c instanceof THREE.Mesh) meshes.push(c);
    });
    expect(meshes.length).toBeGreaterThanOrEqual(4);

    // Vérifie userData.elementId sur chaque maillage (ADR-026)
    for (const m of meshes) {
      expect(m.userData.elementId).toBe('win_1');
    }

    // Vérifie la présence du vitrage MeshPhysicalMaterial
    const glassMesh = meshes.find((m) => m.material instanceof THREE.MeshPhysicalMaterial);
    expect(glassMesh).toBeDefined();
    expect((glassMesh!.material as THREE.MeshPhysicalMaterial).transmission).toBeGreaterThan(0.5);
  });

  it('génère un groupe 3D complet pour une porte avec huisserie, vantail et béquille chromée', () => {
    const opening: OpeningGeometryParams = {
      id: 'door_1',
      kind: 'door',
      offsetAlong: 800,
      width: 900,
      height: 2100,
      sillHeight: 0,
    };

    const group = createDoorGroup(opening, wall, wallType, 0);
    expect(group).toBeInstanceOf(THREE.Group);
    expect(group.name).toBe('door-door_1');

    const meshes: THREE.Mesh[] = [];
    group.traverse((c) => {
      if (c instanceof THREE.Mesh) meshes.push(c);
    });
    expect(meshes.length).toBeGreaterThanOrEqual(3);

    // Vérifie userData.elementId (ADR-026)
    for (const m of meshes) {
      expect(m.userData.elementId).toBe('door_1');
    }

    // Vérifie la présence de la béquille chromée (matériau chrome)
    const handleMesh = meshes.find((m) => (m.material as THREE.MeshStandardMaterial).metalness > 0.8);
    expect(handleMesh).toBeDefined();
    expect((handleMesh!.material as THREE.MeshStandardMaterial).metalness).toBeGreaterThan(0.8);
  });
});
