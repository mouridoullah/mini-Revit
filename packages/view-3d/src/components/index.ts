import type { RawMeshData } from '@tabax/geometry';
import type { ComponentMeshInput, ComponentTypeMeshInput } from './types.js';
import { createSanitaryMesh, SANITARY_SUBTYPES } from './sanitary.js';
import { createKitchenMesh, KITCHEN_SUBTYPES } from './kitchen.js';
import { createFurnitureMesh } from './furniture.js';
import { createGlazingMesh, GLAZING_SUBTYPES } from './glazing.js';

/**
 * components/index — dispatcher et re-exports
 *
 * Ce module est le point d'entree unique pour la generation de composants 3D.
 * Il remplace components-3d.ts (desormais shim de 20 lignes) et orchestre
 * les sous-modules sanitary, kitchen, furniture et glazing.
 *
 * Compatible ADR-026 (userData.elementId) et ADR-050 (materiaux partages).
 */

export type { ComponentMeshInput, ComponentTypeMeshInput } from './types.js';

// Re-exports specialises
export { createSanitaryMesh, SANITARY_SUBTYPES } from './sanitary.js';
export { createKitchenMesh, KITCHEN_SUBTYPES } from './kitchen.js';
export { createFurnitureMesh, FURNITURE_SUBTYPES } from './furniture.js';
export { createGlazingMesh, GLAZING_SUBTYPES } from './glazing.js';

/**
 * Dispatcher principal pour la creation du maillage 3D d'un composant architectural ou mobilier.
 */
export function createComponentMesh(
  comp: ComponentMeshInput,
  compType: ComponentTypeMeshInput,
  levelElevation: number = 0,
): RawMeshData | null {
  const subType = compType.subType;
  if ((SANITARY_SUBTYPES as readonly string[]).includes(subType)) {
    return createSanitaryMesh(comp, compType, levelElevation);
  }
  if ((KITCHEN_SUBTYPES as readonly string[]).includes(subType)) {
    return createKitchenMesh(comp, compType, levelElevation);
  }
  if ((GLAZING_SUBTYPES as readonly string[]).includes(subType)) {
    return createGlazingMesh(comp, compType, levelElevation);
  }
  return createFurnitureMesh(comp, compType, levelElevation);
}
