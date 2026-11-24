/**
 * ArchitecturalMeshManager
 *
 * Gère le registre, l'instanciation, la mise à jour atomique par lot (batch),
 * le nettoyage mémoire et les arêtes fines des maillages architecturaux 3D (ADR-018, ADR-026, ADR-072).
 */

import * as THREE from 'three';
import { type RawMeshData } from '@tabax/geometry';
import { MeshAdapter } from '../MeshAdapter.js';
import type { SectionCapManager } from './SectionCapManager.js';

export class ArchitecturalMeshManager {
  private readonly meshes: Map<string, THREE.Mesh[]> = new Map();
  private readonly scene: THREE.Scene;

  public constructor(scene: THREE.Scene) {
    this.scene = scene;
  }

  public getMeshesMap(): Map<string, THREE.Mesh[]> {
    return this.meshes;
  }

  public getMeshes(elementId: string): readonly THREE.Mesh[] {
    return this.meshes.get(elementId) ?? [];
  }

  public getAllMeshes(): THREE.Mesh[] {
    const all: THREE.Mesh[] = [];
    for (const list of this.meshes.values()) {
      all.push(...list);
    }
    return all;
  }

  public getMeshCount(): number {
    let count = 0;
    for (const list of this.meshes.values()) {
      count += list.length;
    }
    return count;
  }

  public computeBounds(): THREE.Box3 {
    const bounds = new THREE.Box3();
    for (const list of this.meshes.values()) {
      for (const mesh of list) {
        bounds.expandByObject(mesh);
      }
    }
    return bounds;
  }

  public raycastNDC(
    ndcX: number,
    ndcY: number,
    camera: THREE.Camera,
    activeClippingPlane?: THREE.Plane | null,
  ): string | null {
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(new THREE.Vector2(ndcX, ndcY), camera);
    const candidateMeshes = this.getAllMeshes();
    const hits = raycaster.intersectObjects(candidateMeshes, false);
    for (const hit of hits) {
      if (activeClippingPlane && activeClippingPlane.distanceToPoint(hit.point) < 0) {
        continue;
      }
      const userDataId = hit.object.userData?.elementId as string | undefined;
      const meshName = hit.object.name;
      return userDataId || meshName || null;
    }
    return null;
  }

  public addMesh(
    rawData: RawMeshData,
    material: THREE.Material,
    materialOptions?: { ownsMaterial?: boolean; isSharedMaterial?: boolean },
    activeClippingPlane?: THREE.Plane | null,
    sectionCapManager?: SectionCapManager | null,
  ): THREE.Mesh {
    const geometry = MeshAdapter.fromRawMeshData(rawData);
    const mat = material;

    if (activeClippingPlane) {
      const planes = [activeClippingPlane];
      if (Array.isArray(mat)) {
        mat.forEach((m) => {
          m.clippingPlanes = planes;
          m.clipShadows = true;
        });
      } else {
        mat.clippingPlanes = planes;
        mat.clipShadows = true;
      }
    }

    const mesh = new THREE.Mesh(geometry, mat);
    mesh.name = rawData.elementId;
    mesh.userData = {
      elementId: rawData.elementId,
      role: rawData.role,
      baseMaterial: mat,
      ...(rawData.userData ?? {}),
      ...(materialOptions ?? {}),
    };

    // Arêtes d'architecture fines (walls, slabs, roofs)
    if (['wall', 'slab', 'roof'].includes(String(mesh.userData.category ?? ''))) {
      const edges = new THREE.EdgesGeometry(geometry, 15);
      const lineMat = new THREE.LineBasicMaterial({ color: 0x2b303b });
      if (activeClippingPlane) {
        lineMat.clippingPlanes = [activeClippingPlane];
      }
      const lines = new THREE.LineSegments(edges, lineMat);
      lines.name = `${rawData.elementId}-architectural-edges`;
      lines.userData.ownsGeometryAndMaterial = true;
      mesh.add(lines);
      sectionCapManager?.registerMesh(mesh, rawData.elementId);
    }

    this.scene.add(mesh);

    const existingList = this.meshes.get(rawData.elementId) ?? [];
    existingList.push(mesh);
    this.meshes.set(rawData.elementId, existingList);

    return mesh;
  }

  public removeMesh(
    elementId: string,
    sectionCapManager?: SectionCapManager | null,
    isInternalMaterial?: (mat: THREE.Material) => boolean,
  ): void {
    const meshList = this.meshes.get(elementId);
    if (!meshList || meshList.length === 0) return;

    for (const mesh of meshList) {
      this.scene.remove(mesh);
      this.disposeArchitecturalEdges(mesh);
      mesh.geometry.dispose();

      // Protection des matériaux partagés ou non possédés (S2-3, ADR-050)
      if (mesh.userData?.ownsMaterial === false || mesh.userData?.isSharedMaterial === true) {
        continue;
      }

      const baseMat = mesh.userData?.baseMaterial as THREE.Material | undefined;
      const matsToDispose = new Set<THREE.Material>();

      const checkAndAdd = (mat: THREE.Material | THREE.Material[] | undefined) => {
        if (!mat) return;
        const list = Array.isArray(mat) ? mat : [mat];
        for (const m of list) {
          if (!isInternalMaterial || !isInternalMaterial(m)) {
            matsToDispose.add(m);
          }
        }
      };

      checkAndAdd(mesh.material);
      checkAndAdd(baseMat);

      for (const m of matsToDispose) {
        m.dispose();
      }
    }

    this.meshes.delete(elementId);
    sectionCapManager?.unregisterMesh(elementId);
  }

  public applyClippingPlanes(planes: THREE.Plane[]): void {
    for (const meshList of this.meshes.values()) {
      for (const mesh of meshList) {
        if (Array.isArray(mesh.material)) {
          mesh.material.forEach((m) => {
            m.clippingPlanes = planes;
            m.clipShadows = true;
          });
        } else if (mesh.material) {
          mesh.material.clippingPlanes = planes;
          mesh.material.clipShadows = true;
        }
        for (const child of mesh.children) {
          if ('material' in child && child.material) {
            const cMat = (child as THREE.Mesh | THREE.LineSegments).material;
            if (Array.isArray(cMat)) {
              cMat.forEach((m) => {
                m.clippingPlanes = planes;
              });
            } else {
              cMat.clippingPlanes = planes;
            }
          }
        }
      }
    }
  }

  public disposeArchitecturalEdges(mesh: THREE.Mesh): void {
    for (const child of [...mesh.children]) {
      if (child.userData?.ownsGeometryAndMaterial !== true) continue;
      mesh.remove(child);
      if (child instanceof THREE.LineSegments) {
        child.geometry.dispose();
        const materials = Array.isArray(child.material) ? child.material : [child.material];
        materials.forEach((material) => material.dispose());
      }
    }
  }

  public dispose(isInternalMaterial?: (mat: THREE.Material) => boolean): void {
    for (const elementId of [...this.meshes.keys()]) {
      this.removeMesh(elementId, null, isInternalMaterial);
    }
    this.meshes.clear();
  }
}
