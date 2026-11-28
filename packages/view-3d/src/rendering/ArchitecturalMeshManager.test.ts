import { describe, it, expect, vi } from 'vitest';
import * as THREE from 'three';
import { ArchitecturalMeshManager } from './ArchitecturalMeshManager.js';
import type { SectionCapManager } from './SectionCapManager.js';
import type { RawMeshData } from '@tabax/geometry';
import { ArchitecturalMeshAccumulator, v3 } from '../components/architectural-primitives.js';
import { composeMatrix4 } from '../mesh-generator/shared/primitives.js';

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

    const clipPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), 0);
    manager.applyClippingPlanes([clipPlane]);
    expect(defaultMat.clippingPlanes?.length).toBe(1);

    manager.dispose();
    expect(manager.getMeshCount()).toBe(0);
  });

  it('gère addComponentAssembly avec matériaux partagés, instances GPU, exclusion SectionCapManager et dispose propre', () => {
    const scene = new THREE.Scene();
    const manager = new ArchitecturalMeshManager(scene);
    const mockCapManager = {
      registerMesh: vi.fn(),
      unregisterMesh: vi.fn(),
    } as unknown as SectionCapManager;

    const accWall = new ArchitecturalMeshAccumulator();
    accWall.addBeveledBox(v3(0, 0, 50), v3(100, 20, 100), 2);
    const accGlass = new ArchitecturalMeshAccumulator();
    accGlass.addBeveledBox(v3(0, 0, 50), v3(80, 10, 80), 0);

    // 1. Mur structurel -> enregistré dans SectionCapManager
    manager.addComponentAssembly(
      {
        elementId: 'wall_cap',
        category: 'wall',
        family: 'wall',
        subType: 'partition_wall',
        parts: [{ rawData: accWall.toRawMeshData('wall_cap_body'), materialRole: 'plaster_interior' }],
      },
      null,
      mockCapManager,
    );
    expect(mockCapManager.registerMesh).toHaveBeenCalledTimes(1);

    // 2. Fenêtre / mobilier / vitrage -> JAMAIS enregistrés dans SectionCapManager, mais instances GPU enregistrées
    const meshes = manager.addComponentAssembly(
      {
        elementId: 'door_gpu_1',
        category: 'door',
        family: 'glazing',
        subType: 'door',
        parts: [
          { rawData: accWall.toRawMeshData('door_leaf'), materialRole: 'wood_oak' },
          { rawData: accGlass.toRawMeshData('door_glass'), materialRole: 'glass_clear' },
        ],
        instances: [
          {
            prototypeKey: 'door_handle',
            matrix: composeMatrix4(v3(0, 0, 1050), v3(1, 0, 0), v3(0, 1, 0), v3(0, 0, 1)),
            materialRole: 'chrome_hardware',
          },
        ],
      },
      null,
      mockCapManager,
    );

    // Pas de nouvel appel à registerMesh pour la porte ni le vitrage
    expect(mockCapManager.registerMesh).toHaveBeenCalledTimes(1);
    expect(meshes).toHaveLength(2);
    for (const m of meshes) {
      expect(m.userData.baseMaterial).toBe(m.material);
      expect(m.userData.isSharedMaterial).toBe(true);
      expect(m.userData.ownsMaterial).toBe(false);
    }

    const archPools = manager.getComponentInstancePoolManager();
    expect(archPools.getPoolCount()).toBe(1);
    expect(archPools.getTotalInstanceCount()).toBe(1);

    // 3. Propagation des plans de coupe sur l'ArchitecturalMaterialLibrary et les InstancedMesh
    const plane = new THREE.Plane(new THREE.Vector3(0, 0, -1), 1500);
    manager.applyClippingPlanes([plane]);
    for (const mat of manager.getArchitecturalMaterialLibrary().getSharedMaterials()) {
      expect(mat.clippingPlanes).toEqual([plane]);
    }

    // 4. Suppression et nettoyage déterministe
    manager.removeMesh('door_gpu_1', mockCapManager);
    expect(archPools.getPoolCount()).toBe(0);
    expect(archPools.getTotalInstanceCount()).toBe(0);
    expect(mockCapManager.unregisterMesh).toHaveBeenCalledWith('door_gpu_1');

    manager.dispose();
    expect(manager.getMeshCount()).toBe(0);
    expect(archPools.getPoolCount()).toBe(0);
  });
});
