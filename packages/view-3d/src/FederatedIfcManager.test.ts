import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { FederatedIfcManager } from './FederatedIfcManager.js';

describe('FederatedIfcManager', () => {
  it('highlights one federated entity and clears the previous selection', () => {
    const manager = new FederatedIfcManager();
    manager.addModel({
      id: 'fed-model',
      name: 'Reference',
      items: [
        { expressId: 10, positions: new Float32Array([0, 0, 0, 1, 0, 0, 0, 1, 0]) },
        { expressId: 20, positions: new Float32Array([0, 0, 1, 1, 0, 1, 0, 1, 1]) },
      ],
    });

    const group = manager.getRootGroup().children[0] as THREE.Group;
    const first = group.children[0] as THREE.Mesh;
    const second = group.children[1] as THREE.Mesh;
    const firstMaterial = first.material as THREE.MeshStandardMaterial;
    const secondMaterial = second.material as THREE.MeshStandardMaterial;

    manager.setSelectedEntity('fed-model', 10);
    expect(firstMaterial.emissive.getHex()).toBe(0x3b82f6);
    expect(secondMaterial.emissive.getHex()).toBe(0x000000);

    manager.setSelectedEntity('fed-model', 20);
    expect(firstMaterial.emissive.getHex()).toBe(0x000000);
    expect(secondMaterial.emissive.getHex()).toBe(0x3b82f6);

    manager.setSelectedEntity(null, null);
    expect(secondMaterial.emissive.getHex()).toBe(0x000000);
    manager.dispose();
  });
});
