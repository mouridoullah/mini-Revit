/**
 * ComponentInstancePoolManager — Pools GPU THREE.InstancedMesh pour les pièces répétitives
 * d'architecture et de mobilier (potelets de garde-corps, poignées de portes/meubles, charnières, piétements).
 */

import type * as THREE from 'three';
import type {
  ComponentInstancePrototypeKey,
  ComponentMaterialRole,
} from '../components/types.js';
import { getArchitecturalPrototypeMesh } from '../components/architectural-prototypes.js';
import type { ArchitecturalMaterialLibrary } from './ArchitecturalMaterialLibrary.js';
import { GenericInstancePoolManager } from './InstancePoolBase.js';

export class ComponentInstancePoolManager extends GenericInstancePoolManager<
  ComponentInstancePrototypeKey,
  ComponentMaterialRole
> {
  public constructor(scene: THREE.Scene, materialLibrary: ArchitecturalMaterialLibrary) {
    super({
      scene,
      poolPrefix: 'arch-instanced',
      getPrototypeMesh: getArchitecturalPrototypeMesh,
      getMaterial: (role, color) => materialLibrary.getMaterial(role, color),
      applyMaterialClippingPlanes: (planes) => materialLibrary.applyClippingPlanes(planes),
    });
  }
}
