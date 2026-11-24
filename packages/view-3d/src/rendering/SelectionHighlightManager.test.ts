import { describe, it, expect } from 'vitest';
import * as THREE from 'three';
import { SelectionHighlightManager } from './SelectionHighlightManager.js';

describe('SelectionHighlightManager (ADR-026, ADR-050)', () => {
  it('crée un matériau émissif bleu partagé', () => {
    const manager = new SelectionHighlightManager();
    const mat = manager.getHighlightMaterial();

    expect(mat).toBeDefined();
    expect(mat.color.getHex()).toBe(0x2563eb);
    expect(mat.emissive.getHex()).toBe(0x2563eb);
    expect((mat as THREE.MeshStandardMaterial & { isSharedMaterial?: boolean }).isSharedMaterial).toBe(true);
    manager.dispose();
  });

  it('applique la surbrillance sur les maillages sélectionnés et restaure le matériau de base', () => {
    const manager = new SelectionHighlightManager();
    const defaultMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const customMat = new THREE.MeshBasicMaterial({ color: 0x888888 });

    const mesh1 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), defaultMat);
    mesh1.userData.elementId = 'elem_1';
    mesh1.userData.baseMaterial = defaultMat;

    const mesh2 = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), customMat);
    mesh2.userData.elementId = 'elem_2';
    mesh2.userData.baseMaterial = customMat;

    const meshes = new Map<string, THREE.Mesh[]>([
      ['elem_1', [mesh1]],
      ['elem_2', [mesh2]],
    ]);

    // 1. Sélectionner elem_1
    manager.setHighlight(['elem_1'], meshes, defaultMat);
    expect(mesh1.material).toBe(manager.getHighlightMaterial());
    expect(mesh2.material).toBe(customMat);

    // 2. Vider la sélection
    manager.setHighlight([], meshes, defaultMat);
    expect(mesh1.material).toBe(defaultMat);
    expect(mesh2.material).toBe(customMat);

    manager.dispose();
  });
});
