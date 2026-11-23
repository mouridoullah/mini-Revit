/**
 * mesh-generator/mep/index — re-exports depuis le module mep principal
 *
 * Ce fichier constitue le point d'entree du sous-dossier mep/.
 * Il re-exporte toutes les fonctions et types publics de ../mep.ts
 * en les organisant par domaine metier (pipes, ducts, cable-trays, fittings, equipment).
 *
 * Les sous-modules specifiques peuvent etre importes individuellement :
 *   import { generatePipeMesh } from '@tabax/view-3d/mesh-generator/mep/pipes'
 * ou via ce barrel :
 *   import { generatePipeMesh } from '@tabax/view-3d/mesh-generator/mep'
 */

// Couleurs et utilitaires
export {
  MEP_SYSTEM_COLORS,
  MEP_DOMAIN_FALLBACK_COLORS,
  DEFAULT_MEP_COLOR,
  getMepSystemColor,
} from '../mep.js';

// Tuyauterie
export { generatePipeMesh } from './pipes.js';

// Gaines aerauliques
export { generateDuctMesh } from './ducts.js';

// Chemins de cables
export { generateCableTrayMesh } from './cable-trays.js';

// Raccords
export { generateFittingMesh } from './fittings.js';

// Equipements
export { generateEquipmentMesh } from './equipment.js';

// Batch
export { generateMepMeshes } from '../mep.js';
export type { MepStateForMesh } from '../mep.js';
