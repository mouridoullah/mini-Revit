/**
 * MepInstancePoolManager — Pools GPU THREE.InstancedMesh pour la quincaillerie MEP répétitive
 * (brides, boulons M10, colliers, tiges filetées, barreaux, presse-étoupes, charnières, ailettes).
 */

import type * as THREE from 'three';
import type {
  MepInstancePrototypeKey,
  MepMaterialRole,
} from '../mesh-generator/mep/assembly-types.js';
import { getMepPrototypeMesh } from '../mesh-generator/mep/prototypes.js';
import type { MepMaterialLibrary } from './MepMaterialLibrary.js';
import { GenericInstancePoolManager } from './InstancePoolBase.js';

export class MepInstancePoolManager extends GenericInstancePoolManager<
  MepInstancePrototypeKey,
  MepMaterialRole
> {
  public constructor(scene: THREE.Scene, materialLibrary: MepMaterialLibrary) {
    super({
      scene,
      poolPrefix: 'mep-instanced',
      getPrototypeMesh: getMepPrototypeMesh,
      getMaterial: (role, color) => materialLibrary.getMaterial(role, color),
      applyMaterialClippingPlanes: (planes) => materialLibrary.applyClippingPlanes(planes),
    });
  }
}
