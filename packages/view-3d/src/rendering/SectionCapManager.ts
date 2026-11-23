/**
 * SectionCapManager
 *
 * Gère les bouchons de coupe stencil pour les volumes architecturaux.
 * Quand un plan de coupe est actif, les volumes tranchés affichent une face
 * solide gris anthracite (#1e222a) sur la section — sans rendu de la face arrière.
 *
 * Approche : pour chaque mesh architectural, on crée un mesh jumeau "cap"
 * en mode BackSide avec un MeshStandardMaterial spécial qui ne s'affiche
 * que là où le plan coupe le volume.
 *
 * Compatible ADR-063 (plan de coupe) et ADR-050 (matériaux partagés).
 */

import * as THREE from 'three';

export class SectionCapManager {
  private readonly scene: THREE.Scene;
  private readonly capGroup: THREE.Group = new THREE.Group();
  private readonly capMaterial: THREE.MeshStandardMaterial;
  /** Map elementId -> mesh cap stencil */
  private readonly caps: Map<string, THREE.Mesh[]> = new Map();
  private activePlane: THREE.Plane | null = null;

  public constructor(scene: THREE.Scene) {
    this.scene = scene;

    this.capMaterial = new THREE.MeshStandardMaterial({
      color: 0x1e222a,
      roughness: 0.9,
      metalness: 0.0,
      side: THREE.BackSide,
    });
    (this.capMaterial as THREE.MeshStandardMaterial & { isSharedMaterial?: boolean }).isSharedMaterial = true;

    this.capGroup.name = '__section_caps__';
    scene.add(this.capGroup);
  }

  /**
   * Active le plan de coupe et applique les bouchons sur tous les caps enregistrés.
   */
  public setClippingPlane(plane: THREE.Plane | null): void {
    this.activePlane = plane;
    const planes = plane ? [plane] : [];

    this.capMaterial.clippingPlanes = planes;
    this.capMaterial.needsUpdate = true;

    // Propager aux caps existants
    for (const capList of this.caps.values()) {
      for (const cap of capList) {
        cap.visible = plane !== null;
        if (Array.isArray(cap.material)) {
          cap.material.forEach((m) => {
            m.clippingPlanes = planes;
            m.needsUpdate = true;
          });
        } else {
          cap.material.clippingPlanes = planes;
          cap.material.needsUpdate = true;
        }
      }
    }
  }

  /**
   * Enregistre un mesh et crée son cap stencil.
   * À appeler chaque fois qu'un mesh architectural est ajouté à la scène.
   */
  public registerMesh(mesh: THREE.Mesh, elementId: string): void {
    const cap = new THREE.Mesh(mesh.geometry, this.capMaterial);
    cap.name = `${elementId}--cap`;
    cap.position.copy(mesh.position);
    cap.rotation.copy(mesh.rotation);
    cap.scale.copy(mesh.scale);
    cap.visible = this.activePlane !== null;
    if (this.activePlane) {
      cap.material.clippingPlanes = [this.activePlane];
    }
    // Les caps suivent le mesh parent via le groupe de scène
    this.capGroup.add(cap);
    const list = this.caps.get(elementId) ?? [];
    list.push(cap);
    this.caps.set(elementId, list);
  }

  /**
   * Supprime les caps associés à un elementId.
   */
  public unregisterMesh(elementId: string): void {
    const list = this.caps.get(elementId);
    if (!list) return;
    for (const cap of list) {
      this.capGroup.remove(cap);
      // La géométrie est partagée avec le mesh source — on ne la dispose pas ici.
    }
    this.caps.delete(elementId);
  }

  public dispose(): void {
    this.scene.remove(this.capGroup);
    this.capMaterial.dispose();
    this.caps.clear();
  }
}
