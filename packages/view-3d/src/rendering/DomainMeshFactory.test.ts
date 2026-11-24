import { describe, it, expect } from 'vitest';
import { DomainMeshFactory } from './DomainMeshFactory.js';
import type { RawMeshData } from '@tabax/geometry';

describe('DomainMeshFactory (ADR-050, ADR-072)', () => {
  const dummyMesh: RawMeshData = {
    elementId: 'test_elem',
    role: 'full',
    positions: new Float32Array([0, 0, 0, 10, 0, 0, 10, 10, 0]),
    normals: new Float32Array([0, 0, 1, 0, 0, 1, 0, 0, 1]),
    indices: new Uint32Array([0, 1, 2]),
    boundingBox: {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 10, y: 10, z: 0 },
    },
  };

  it('initialise les matériaux de domaine architectural', () => {
    const factory = new DomainMeshFactory();

    expect(factory.slabMaterial).toBeDefined();
    expect(factory.stairMaterial).toBeDefined();
    expect(factory.roofMaterial).toBeDefined();
    expect(factory.sanitaryMaterial).toBeDefined();
    expect(factory.kitchenMaterial).toBeDefined();
    expect(factory.furnitureMaterial).toBeDefined();
    expect(factory.glazingMaterial).toBeDefined();

    expect(factory.getComponentMaterial('sanitary')).toBe(factory.sanitaryMaterial);
    expect(factory.getComponentMaterial('kitchen')).toBe(factory.kitchenMaterial);
    expect(factory.getComponentMaterial('furniture')).toBe(factory.furnitureMaterial);

    factory.dispose();
  });

  it('formate les métadonnées géométriques de dalle, escalier et toiture', () => {
    const factory = new DomainMeshFactory();

    const formattedSlab = factory.formatSlab('slab_1', dummyMesh);
    expect(formattedSlab.elementId).toBe('slab_1');
    expect(formattedSlab.userData?.category).toBe('slab');

    const formattedStair = factory.formatStair('stair_1', dummyMesh);
    expect(formattedStair.elementId).toBe('stair_1');
    expect(formattedStair.userData?.category).toBe('stair');

    const formattedRoof = factory.formatRoof('roof_1', dummyMesh);
    expect(formattedRoof.elementId).toBe('roof_1');
    expect(formattedRoof.userData?.category).toBe('roof');

    factory.dispose();
  });
});
