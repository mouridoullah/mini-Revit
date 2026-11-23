/**
 * components/index — dispatcher et re-exports
 *
 * Ce module est le point d'entree unique pour la generation de composants 3D.
 * Il remplace components-3d.ts (desormais shim) et orchestre les sous-modules
 * sanitary, kitchen, furniture et glazing.
 *
 * Compatible ADR-026 (userData.elementId) et ADR-050 (materiaux partages).
 */

export type { ComponentMeshInput, ComponentTypeMeshInput } from './types.js';

// Re-exports specialises (utiles si on veut appeler un sous-module directement)
export { createSanitaryMesh, SANITARY_SUBTYPES } from './sanitary.js';
export { createKitchenMesh, KITCHEN_SUBTYPES } from './kitchen.js';
export { createFurnitureMesh, FURNITURE_SUBTYPES } from './furniture.js';
export { createGlazingMesh, GLAZING_SUBTYPES } from './glazing.js';
