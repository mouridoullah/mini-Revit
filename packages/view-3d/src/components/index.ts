import type { RawMeshData } from '@tabax/geometry';
import type {
  ComponentMeshInput,
  ComponentTypeMeshInput,
  ComponentAssembly3D,
  CreateComponentAssemblyOptions,
} from './types.js';
import { createSanitaryAssembly, SANITARY_SUBTYPES } from './sanitary.js';
import { createKitchenAssembly, KITCHEN_SUBTYPES } from './kitchen.js';
import { createFurnitureAssembly } from './furniture.js';
import { createGlazingAssembly, GLAZING_SUBTYPES } from './glazing.js';
import { mergeAssemblyParts } from './assembly-helper.js';

/**
 * components/index — Dispatcher et ré-exports des composants LOD 200 / LOD 350
 *
 * Point d'entrée unique pour la génération des assemblages 3D d'équipements et mobilier.
 * Compatible ADR-026 (userData.elementId), ADR-050 (matériaux partagés) et ADR-072 (LOD 350).
 */

export type {
  ComponentMeshInput,
  ComponentTypeMeshInput,
  ComponentAssembly3D,
  ComponentAssemblyPart,
  ComponentInstanceAnchor,
  ComponentInstancePrototypeKey,
  ComponentMaterialRole,
  ComponentDetailLevel,
  CreateComponentAssemblyOptions,
} from './types.js';
export {
  getAllArchitecturalPrototypes,
  getArchitecturalPrototypeMesh,
} from './architectural-prototypes.js';

// Ré-exports spécialisés
export { createSanitaryAssembly, createSanitaryMesh, SANITARY_SUBTYPES } from './sanitary.js';
export { createKitchenAssembly, createKitchenMesh, KITCHEN_SUBTYPES } from './kitchen.js';
export { createFurnitureAssembly, createFurnitureMesh, FURNITURE_SUBTYPES } from './furniture.js';
export { createGlazingAssembly, createGlazingMesh, GLAZING_SUBTYPES } from './glazing.js';
export { mergeAssemblyParts } from './assembly-helper.js';

/**
 * Dispatcher principal pour la création de l'assemblage 3D multi-matériaux (LOD 350).
 */
export function createComponentAssembly(
  comp: ComponentMeshInput,
  compType: ComponentTypeMeshInput,
  levelElevation = 0,
  options?: CreateComponentAssemblyOptions,
): ComponentAssembly3D | null {
  const subType = compType.subType;
  if ((SANITARY_SUBTYPES as readonly string[]).includes(subType)) {
    return createSanitaryAssembly(comp, compType, levelElevation, options);
  }
  if ((KITCHEN_SUBTYPES as readonly string[]).includes(subType)) {
    return createKitchenAssembly(comp, compType, levelElevation, options);
  }
  if ((GLAZING_SUBTYPES as readonly string[]).includes(subType)) {
    return createGlazingAssembly(comp, compType, levelElevation, options);
  }
  return createFurnitureAssembly(comp, compType, levelElevation, options);
}

/**
 * Dispatcher legacy pour la création d'un RawMeshData mono-matériau combiné (rétrocompatibilité).
 */
export function createComponentMesh(
  comp: ComponentMeshInput,
  compType: ComponentTypeMeshInput,
  levelElevation = 0,
): RawMeshData | null {
  const assembly = createComponentAssembly(comp, compType, levelElevation);
  if (!assembly) return null;
  return mergeAssemblyParts(assembly.parts, comp.id);
}
