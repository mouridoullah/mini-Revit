/**
 * packages/view-3d/src/mesh-generator/mep.ts
 *
 * Facade de ré-exportation vers packages/view-3d/src/mesh-generator/mep/ (ADR-072).
 * Le monolithe de 839 lignes a été scindé en sous-modules métier autonomes :
 * - colors.ts : Nuancier normalisé et palettes
 * - common.ts : Algèbre vectorielle 3D et accumulateur RawMeshData
 * - pipes.ts : Tuyauterie hydraulique / plomberie
 * - ducts.ts : Gaines aérauliques
 * - cable-trays.ts : Chemins de câbles
 * - fittings.ts : Raccords MEP
 * - equipment.ts : Équipements techniques
 * - batch.ts : Générateur par lot
 */

export {
  MEP_SYSTEM_COLORS,
  MEP_DOMAIN_FALLBACK_COLORS,
  DEFAULT_MEP_COLOR,
  getMepSystemColor,
  generatePipeMesh,
  generateDuctMesh,
  generateCableTrayMesh,
  generateFittingMesh,
  generateEquipmentMesh,
  generateMepMeshes,
  type MepStateForMesh,
} from './mep/index.js';
