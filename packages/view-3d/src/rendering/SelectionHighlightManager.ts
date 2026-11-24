/**
 * SelectionHighlightManager
 *
 * Gère la surbrillance visuelle des entités 3D sélectionnées (ADR-026, ADR-050).
 * Applique le matériau de sélection bleu (#2563eb) sur les maillages sélectionnés
 * et restaure fidèlement leur matériau de base d'origine lorsqu'ils sont désélectionnés.
 */

import * as THREE from 'three';

export class SelectionHighlightManager {
  private readonly highlightMaterial: THREE.MeshStandardMaterial;

  public constructor() {
    this.highlightMaterial = new THREE.MeshStandardMaterial({
      color: 0x2563eb,
      roughness: 0.4,
      metalness: 0.1,
      emissive: 0x2563eb,
      emissiveIntensity: 0.35,
    });
    (this.highlightMaterial as THREE.MeshStandardMaterial & { isSharedMaterial?: boolean }).isSharedMaterial = true;
  }

  public getHighlightMaterial(): THREE.MeshStandardMaterial {
    return this.highlightMaterial;
  }

  public setHighlight(
    ids: Iterable<string>,
    meshes: Map<string, THREE.Mesh[]>,
    defaultMaterial: THREE.Material,
  ): void {
    const idSet = new Set(ids);
    for (const [elementId, meshList] of meshes.entries()) {
      const isSelected = idSet.has(elementId);
      for (const mesh of meshList) {
        const baseMat = (mesh.userData?.baseMaterial as THREE.Material) ?? defaultMaterial;
        mesh.material = isSelected ? this.highlightMaterial : baseMat;
      }
    }
  }

  public dispose(): void {
    this.highlightMaterial.dispose();
  }
}
