/**
 * Gestionnaire impératif des maquettes IFC externes fédérées dans Three.js.
 * Découplé du graphe de scène architectural natif.
 * Conforme à ADR-001, ADR-003 et gestion stricte des ressources WebGL.
 */

import * as THREE from 'three';
import { type FederatedModelVisual } from './types.js';

interface ManagedFederatedModel {
  id: string;
  group: THREE.Group;
  meshes: THREE.Mesh[];
  materials: THREE.MeshStandardMaterial[];
  geometries: THREE.BufferGeometry[];
}

export class FederatedIfcManager {
  private readonly rootGroup: THREE.Group = new THREE.Group();
  private readonly models: Map<string, ManagedFederatedModel> = new Map();

  public constructor() {
    this.rootGroup.name = 'FederatedIfcContainer';
  }

  public getRootGroup(): THREE.Group {
    return this.rootGroup;
  }

  /**
   * Ajoute ou met à jour une maquette fédérée dans la scène Three.js.
   */
  public addModel(visual: FederatedModelVisual): void {
    if (this.models.has(visual.id)) {
      this.removeModel(visual.id);
    }

    const modelGroup = new THREE.Group();
    modelGroup.name = `FederatedModel_${visual.id}`;

    if (visual.offset) {
      modelGroup.position.set(visual.offset.x, visual.offset.y, visual.offset.z);
    }
    modelGroup.visible = visual.visible !== false;

    const opacity = visual.opacity ?? 0.35;
    const wireframe = visual.wireframe ?? false;

    const meshes: THREE.Mesh[] = [];
    const materials: THREE.MeshStandardMaterial[] = [];
    const geometries: THREE.BufferGeometry[] = [];

    for (const item of visual.items) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute('position', new THREE.BufferAttribute(item.positions, 3));

      if (item.normals && item.normals.length === item.positions.length) {
        geometry.setAttribute('normal', new THREE.BufferAttribute(item.normals, 3));
      } else {
        geometry.computeVertexNormals();
      }

      if (item.indices && item.indices.length > 0) {
        geometry.setIndex(new THREE.BufferAttribute(item.indices, 1));
      }

      geometries.push(geometry);

      const color = item.color
        ? new THREE.Color(item.color.r, item.color.g, item.color.b)
        : new THREE.Color(0x94a3b8);

      const material = new THREE.MeshStandardMaterial({
        color,
        transparent: opacity < 1.0,
        opacity,
        wireframe,
        roughness: 0.65,
        metalness: 0.1,
        side: THREE.DoubleSide,
        depthWrite: opacity >= 0.85,
      });
      materials.push(material);

      const mesh = new THREE.Mesh(geometry, material);
      mesh.name = `IfcEntity_${visual.id}_${item.expressId}`;
      mesh.userData = {
        isFederated: true,
        modelId: visual.id,
        expressId: item.expressId,
      };

      modelGroup.add(mesh);
      meshes.push(mesh);
    }

    this.rootGroup.add(modelGroup);

    this.models.set(visual.id, {
      id: visual.id,
      group: modelGroup,
      meshes,
      materials,
      geometries,
    });
  }

  /**
   * Retire et libère toutes les ressources WebGL d'un modèle fédéré.
   */
  public removeModel(modelId: string): void {
    const managed = this.models.get(modelId);
    if (!managed) return;

    this.rootGroup.remove(managed.group);

    for (const geom of managed.geometries) {
      geom.dispose();
    }
    for (const mat of managed.materials) {
      mat.dispose();
    }

    while (managed.group.children.length > 0) {
      const child = managed.group.children[0];
      if (!child) break;
      managed.group.remove(child);
    }

    this.models.delete(modelId);
  }

  public setVisibility(modelId: string, visible: boolean): void {
    const managed = this.models.get(modelId);
    if (managed) {
      managed.group.visible = visible;
    }
  }

  public setOpacity(modelId: string, opacity: number): void {
    const managed = this.models.get(modelId);
    if (!managed) return;

    const clamped = Math.max(0.01, Math.min(1.0, opacity));
    for (const mat of managed.materials) {
      mat.opacity = clamped;
      mat.transparent = clamped < 1.0;
      mat.depthWrite = clamped >= 0.85;
      mat.needsUpdate = true;
    }
  }

  public setWireframe(modelId: string, wireframe: boolean): void {
    const managed = this.models.get(modelId);
    if (!managed) return;

    for (const mat of managed.materials) {
      mat.wireframe = wireframe;
      mat.needsUpdate = true;
    }
  }

  public setOffset(modelId: string, offset: { x: number; y: number; z: number }): void {
    const managed = this.models.get(modelId);
    if (managed) {
      managed.group.position.set(offset.x, offset.y, offset.z);
    }
  }

  public setSelectedEntity(modelId: string | null, expressId: number | null): void {
    for (const model of this.models.values()) {
      for (const mesh of model.meshes) {
        const material = mesh.material as THREE.MeshStandardMaterial;
        material.emissive.setHex(
          model.id === modelId && mesh.userData.expressId === expressId ? 0x3b82f6 : 0x000000,
        );
        material.emissiveIntensity = model.id === modelId && mesh.userData.expressId === expressId ? 0.7 : 0;
      }
    }
  }

  /**
   * Intersection par raycast sur les entités fédérées uniquement.
   */
  public pickEntity(raycaster: THREE.Raycaster): { modelId: string; expressId: number } | null {
    const candidateMeshes: THREE.Mesh[] = [];
    for (const model of this.models.values()) {
      if (model.group.visible) {
        candidateMeshes.push(...model.meshes);
      }
    }

    if (candidateMeshes.length === 0) return null;

    const hits = raycaster.intersectObjects(candidateMeshes, false);
    const firstHit = hits[0];
    if (firstHit && firstHit.object.userData?.isFederated) {
      return {
        modelId: firstHit.object.userData.modelId as string,
        expressId: firstHit.object.userData.expressId as number,
      };
    }

    return null;
  }

  /**
   * Libération intégrale lors de la fermeture de la scène.
   */
  public dispose(): void {
    const modelIds = Array.from(this.models.keys());
    for (const id of modelIds) {
      this.removeModel(id);
    }
    while (this.rootGroup.children.length > 0) {
      const child = this.rootGroup.children[0];
      if (!child) break;
      this.rootGroup.remove(child);
    }
  }
}
