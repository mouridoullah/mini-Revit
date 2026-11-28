/**
 * packages/view-3d/src/components-3d.ts
 *
 * Facade de ré-exportation vers packages/view-3d/src/components/ (ADR-072).
 * Scindé pour la maintenabilité : sanitary, kitchen, furniture, glazing.
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
} from './components/types.js';

export {
  createComponentMesh,
  createComponentAssembly,
  getAllArchitecturalPrototypes,
  getArchitecturalPrototypeMesh,
  createSanitaryMesh,
  createSanitaryAssembly,
  SANITARY_SUBTYPES,
  createKitchenMesh,
  createKitchenAssembly,
  KITCHEN_SUBTYPES,
  createFurnitureMesh,
  createFurnitureAssembly,
  FURNITURE_SUBTYPES,
  createGlazingMesh,
  createGlazingAssembly,
  GLAZING_SUBTYPES,
  mergeAssemblyParts,
} from './components/index.js';
