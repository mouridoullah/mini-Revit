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
export { generatePipeMesh } from './pipes.js';

// Gaines aérauliques
export { generateDuctMesh } from './ducts.js';

// Chemins de câbles
export { generateCableTrayMesh } from './cable-trays.js';

// Raccords
export { generateFittingMesh } from './fittings.js';

// Équipements
export { generateEquipmentMesh } from './equipment.js';

// Batch
export { generateMepMeshes, type MepStateForMesh } from './batch.js';
