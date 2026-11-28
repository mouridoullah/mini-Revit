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
import type { MepAssembly3D } from '../mesh-generator/mep/assembly-types.js';
import type { ComponentAssembly3D } from '../components/types.js';
import { MepMaterialLibrary } from './MepMaterialLibrary.js';
import { ArchitecturalMaterialLibrary } from './ArchitecturalMaterialLibrary.js';
import { MepInstancePoolManager } from './MepInstancePoolManager.js';
import { ComponentInstancePoolManager } from './ComponentInstancePoolManager.js';

export class ArchitecturalMeshManager {
  private readonly meshes: Map<string, THREE.Mesh[]> = new Map();
  private readonly scene: THREE.Scene;
  private readonly materialLibrary: MepMaterialLibrary;
  private readonly architecturalMaterialLibrary: ArchitecturalMaterialLibrary;
  private readonly ownsMaterialLibrary: boolean;
  private readonly mepInstancePools: MepInstancePoolManager;
  private readonly componentInstancePools: ComponentInstancePoolManager;

  public constructor(
    scene: THREE.Scene,
    materialLibrary?: MepMaterialLibrary,
    archMaterialLibrary?: ArchitecturalMaterialLibrary,
  ) {
    this.scene = scene;
    this.ownsMaterialLibrary = !materialLibrary;
    this.materialLibrary = materialLibrary ?? new MepMaterialLibrary();
    this.architecturalMaterialLibrary = archMaterialLibrary ?? new ArchitecturalMaterialLibrary();
    this.mepInstancePools = new MepInstancePoolManager(scene, this.materialLibrary);
    this.componentInstancePools = new ComponentInstancePoolManager(
      scene,
      this.architecturalMaterialLibrary,
    );
  }

  public getArchitecturalMaterialLibrary(): ArchitecturalMaterialLibrary {
    return this.architecturalMaterialLibrary;
  }

  public getMepInstancePoolManager(): MepInstancePoolManager {
    return this.mepInstancePools;
  }

  public getComponentInstancePoolManager(): ComponentInstancePoolManager {
    return this.componentInstancePools;
  }

  public setInstanceHighlight(ids: Iterable<string>): void {
    this.mepInstancePools.setHighlight(ids);
    this.componentInstancePools.setHighlight(ids);
  }

  public beginInstanceBatch(): void {
    this.mepInstancePools.beginBatch();
    this.componentInstancePools.beginBatch();
  }

  public endInstanceBatch(): void {
    this.mepInstancePools.endBatch();
    this.componentInstancePools.endBatch();
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

    let closestDistance = Infinity;
    let closestId: string | null = null;

    for (const hit of hits) {
      if (activeClippingPlane && activeClippingPlane.distanceToPoint(hit.point) < 0) {
        continue;
      }
      const userDataId = hit.object.userData?.elementId as string | undefined;
      const meshName = hit.object.name;
      closestDistance = hit.distance;
      closestId = userDataId || meshName || null;
      break;
    }

    const mepInstHit = this.mepInstancePools.raycast(raycaster, activeClippingPlane);
    if (mepInstHit && mepInstHit.distance < closestDistance) {
      closestDistance = mepInstHit.distance;
      closestId = mepInstHit.elementId;
    }
    const compInstHit = this.componentInstancePools.raycast(raycaster, activeClippingPlane);
    if (compInstHit && compInstHit.distance < closestDistance) {
      return compInstHit.elementId;
    }
    return closestId;
  }

  public addMepAssembly(
    assembly: MepAssembly3D,
    activeClippingPlane?: THREE.Plane | null,
    sectionCapManager?: SectionCapManager | null,
  ): THREE.Mesh[] {
    const created: THREE.Mesh[] = [];
    for (const part of assembly.parts) {
      const material = this.materialLibrary.getMaterial(part.materialRole, part.color);
      const rawData: RawMeshData = {
        ...part.rawData,
        elementId: assembly.elementId,
        userData: {
          ...(part.rawData.userData ?? {}),
          elementId: assembly.elementId,
          category: assembly.category,
          materialRole: part.materialRole,
        },
      };
      created.push(
        this.addMesh(
          rawData,
          material,
          { isSharedMaterial: true, ownsMaterial: false },
          activeClippingPlane,
          sectionCapManager,
        ),
      );
    }
    if (assembly.instances.length > 0) {
      this.mepInstancePools.registerElementInstances(assembly.elementId, assembly.instances);
    }
    return created;
  }

  public addComponentAssembly(
    assembly: ComponentAssembly3D,
    activeClippingPlane?: THREE.Plane | null,
    sectionCapManager?: SectionCapManager | null,
  ): THREE.Mesh[] {
    const created: THREE.Mesh[] = [];
    for (const part of assembly.parts) {
      const material = this.architecturalMaterialLibrary.getMaterial(part.materialRole, part.color);
      const rawData: RawMeshData = {
        ...part.rawData,
        elementId: assembly.elementId,
        userData: {
          ...(part.rawData.userData ?? {}),
          elementId: assembly.elementId,
          category: assembly.category ?? 'component',
          family: assembly.family ?? assembly.category ?? 'component',
          subType: assembly.subType,
          materialRole: part.materialRole,
        },
      };
      created.push(
        this.addMesh(
          rawData,
          material,
          { isSharedMaterial: true, ownsMaterial: false },
          activeClippingPlane,
          sectionCapManager,
        ),
      );
    }
    if (assembly.instances && assembly.instances.length > 0) {
      this.componentInstancePools.registerElementInstances(assembly.elementId, assembly.instances);
    }
    return created;
  }

  public addOpeningGroup(
    group: THREE.Group,
    activeClippingPlane?: THREE.Plane | null,
  ): THREE.Mesh[] {
    const elementId = String(group.userData.elementId ?? group.name);
    const meshes: THREE.Mesh[] = [];
    group.traverse((child) => {
      if (child instanceof THREE.Mesh) {
        child.userData.elementId = elementId;
        if (activeClippingPlane) {
          const mat = child.material;
          if (Array.isArray(mat)) {
            mat.forEach((m) => {
              m.clippingPlanes = [activeClippingPlane];
              m.clipShadows = true;
            });
          } else if (mat) {
            mat.clippingPlanes = [activeClippingPlane];
            mat.clipShadows = true;
          }
        }
        meshes.push(child);
      }
    });

    this.scene.add(group);
    const firstMesh = meshes[0];
    if (firstMesh) {
      firstMesh.userData.parentGroupToRemove = group;
    }
    const existingList = this.meshes.get(elementId) ?? [];
    this.meshes.set(elementId, [...existingList, ...meshes]);
    return meshes;
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

    const category = String(mesh.userData.category ?? '');
    const materialRole = String(mesh.userData.materialRole ?? '');
    const isGlazing = materialRole === 'glass_clear' || materialRole === 'glass_tinted';
    // Arêtes d'architecture fines (walls, slabs, roofs) et exclusion stricte des vitrages et du mobilier des bouchons de coupe
    if (['wall', 'slab', 'roof'].includes(category) && !isGlazing) {
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
    } else if (
      ['duct', 'cableTray', 'mepEquipment'].includes(category) &&
      ['galvanized_steel', 'steel_ral7035', 'anodized_alu'].includes(materialRole)
    ) {
      const edges = new THREE.EdgesGeometry(geometry, 28);
      const lineMat = new THREE.LineBasicMaterial({
        color: 0x1e242d,
        transparent: true,
        opacity: 0.25,
      });
      if (activeClippingPlane) {
        lineMat.clippingPlanes = [activeClippingPlane];
      }
      const lines = new THREE.LineSegments(edges, lineMat);
      lines.name = `${rawData.elementId}-mep-edges`;
      lines.userData.ownsGeometryAndMaterial = true;
      mesh.add(lines);
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
    this.mepInstancePools.removeElementInstances(elementId);
    this.componentInstancePools.removeElementInstances(elementId);
    const meshList = this.meshes.get(elementId);
    if (!meshList || meshList.length === 0) {
      sectionCapManager?.unregisterMesh(elementId);
      return;
    }

    for (const mesh of meshList) {
      if (mesh.userData?.parentGroupToRemove) {
        this.scene.remove(mesh.userData.parentGroupToRemove);
      }
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
    this.mepInstancePools.applyClippingPlanes(planes);
    this.componentInstancePools.applyClippingPlanes(planes);
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
    this.mepInstancePools.dispose();
    this.componentInstancePools.dispose();
    if (this.ownsMaterialLibrary) {
      this.materialLibrary.dispose();
      this.architecturalMaterialLibrary.dispose();
    }
  }
}
