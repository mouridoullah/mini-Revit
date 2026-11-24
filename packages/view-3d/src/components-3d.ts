/**
 * packages/view-3d/src/components-3d.ts
 *
 * Facade de ré-exportation vers packages/view-3d/src/components/ (ADR-072).
 * Scindé pour la maintenabilité : sanitary, kitchen, furniture, glazing.
 */

export type { ComponentMeshInput, ComponentTypeMeshInput } from './components/types.js';
export {
  createComponentMesh,
  createSanitaryMesh,
  SANITARY_SUBTYPES,
  createKitchenMesh,
  KITCHEN_SUBTYPES,
  createFurnitureMesh,
  FURNITURE_SUBTYPES,
  createGlazingMesh,
  GLAZING_SUBTYPES,
} from './components/index.js';
