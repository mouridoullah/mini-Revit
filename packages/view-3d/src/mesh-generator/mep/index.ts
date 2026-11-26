/**
 * mesh-generator/mep/index — barrel et re-exports modulaires MEP
 *
 * Découpé selon ADR-072 en sous-modules métier autonomes :
 * - colors : Nuancier normalisé et palettes
 * - common : Algèbre vectorielle 3D et accumulateur RawMeshData
 * - pipes : Canalisations et tuyauteries
 * - ducts : Gaines aérauliques
 * - cable-trays : Chemins de câbles
 * - fittings : Raccords (coudes, tés, croix, réductions, bouchons)
 * - equipment : Équipements techniques
 * - batch : Générateur par lot
 */

// Couleurs et utilitaires
export {
  MEP_SYSTEM_COLORS,
  MEP_DOMAIN_FALLBACK_COLORS,
  DEFAULT_MEP_COLOR,
  getMepSystemColor,
} from './colors.js';

// Tuyauterie
export { generatePipeMesh, createPipeAssembly3D } from './pipes.js';

// Gaines aérauliques
export { generateDuctMesh, createDuctAssembly3D } from './ducts.js';

// Chemins de câbles
export { generateCableTrayMesh, createCableTrayAssembly3D } from './cable-trays.js';

// Raccords
export { generateFittingMesh } from './fittings.js';
export { createMepFittingAssembly3D } from './fittings-assembly.js';

// Équipements & terminaux
export { generateEquipmentMesh } from './equipment.js';
export { createMepEquipmentAssembly3D } from './equipment-assembly.js';
export { createAirDiffuserAssembly } from './hvac-terminals.js';
export { createValveAssembly, createCheckValveAssembly } from './valves.js';
export { createJunctionBoxAssembly, createElectricalPanelAssembly } from './electrical.js';
export type { MepDetailLevel, MepAssemblyOptions } from './assembly-builder-helpers.js';

// Contrat multi-matériaux, primitives chanfreinées & prototypes InstancedMesh (LOD 350)
export {
  composeMatrix4,
  type MepMaterialRole,
  type MepInstancePrototypeKey,
  type MepAssemblyPart,
  type MepInstanceAnchor,
  type MepAssembly3D,
} from './assembly-types.js';
export { UvMeshAccumulator } from './primitives.js';
export { getAllMepPrototypes, getMepPrototypeMesh } from './prototypes.js';

// Dispatcher & Batch
export { generateMepMeshes, type MepStateForMesh } from './batch.js';
export {
  createMepAssembly3D,
  generateMepAssemblies,
  type MepElementGeometryInput,
} from './dispatcher.js';
