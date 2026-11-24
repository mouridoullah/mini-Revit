import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { ArchitecturalMeshManager } from './ArchitecturalMeshManager.js';
import type { RawMeshData } from '@tabax/geometry';

describe('ArchitecturalMeshManager (ADR-018, ADR-026, ADR-072)', () => {
  const dummyMesh: RawMeshData = {
    elementId: 'wall_1',
    role: 'full',
    positions: new Float32Array([
      0, 0, 0,
      100, 0, 0,
      100, 100, 0,
      0, 100, 0,
    ]),
    normals: new Float32Array([
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
      0, 0, 1,
    ]),
    indices: new Uint32Array([0, 1, 2, 0, 2, 3]),
    boundingBox: {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 100, y: 100, z: 0 },
    },
  };

  it('gère l’enregistrement, le calcul de limites et le nettoyage de maillages', () => {
    const scene = new THREE.Scene();
    const manager = new ArchitecturalMeshManager(scene);
    const defaultMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });

    const mesh = manager.addMesh(dummyMesh, defaultMat);
    expect(mesh).toBeDefined();
    expect(manager.getMeshCount()).toBe(1);
    expect(manager.getMeshes('wall_1').length).toBe(1);

    const bounds = manager.computeBounds();
    expect(bounds.min.x).toBe(0);
    expect(bounds.max.x).toBe(100);

    manager.removeMesh('wall_1');
    expect(manager.getMeshCount()).toBe(0);
    expect(manager.getMeshes('wall_1').length).toBe(0);

    manager.dispose();
  });

  it('permet le remplacement de géométrie et l’application de plans de coupe', () => {
    const scene = new THREE.Scene();
    const manager = new ArchitecturalMeshManager(scene);
    const defaultMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });

    manager.addMesh(dummyMesh, defaultMat);
    expect(manager.getMeshCount()).toBe(1);

    // Remplacement
    manager.removeMesh('wall_1');
    const updatedMesh: RawMeshData = {
      ...dummyMesh,
      positions: new Float32Array([
        0, 0, 0,
        200, 0, 0,
        200, 200, 0,
        0, 200, 0,
      ]),
      boundingBox: {
        min: { x: 0, y: 0, z: 0 },
        max: { x: 200, y: 200, z: 0 },
      },
    };
    manager.addMesh(updatedMesh, defaultMat);
    expect(manager.getMeshCount()).toBe(1);

    const bounds = manager.computeBounds();
    expect(bounds.max.x).toBe(200);

    // Plan de coupe
    const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    manager.applyClippingPlanes([clipPlane]);
    expect(defaultMat.clippingPlanes?.length).toBe(1);

    manager.dispose();
    expect(manager.getMeshCount()).toBe(0);
  });
});
