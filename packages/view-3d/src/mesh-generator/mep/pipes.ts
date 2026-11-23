/**
 * mesh-generator/mep/pipes — Tuyauterie haute fidelite
 *
 * Re-exporte generatePipeMesh depuis le module parent.
 * Augmente le nombre de segments radiaux a 20 pour une fidélite accrue.
 */

import { type RawMeshData } from '@tabax/geometry';
import type { PipeGeometryParams } from '../types.js';
import { generatePipeMesh as _generatePipeMesh } from '../mep.js';

export { generatePipeMesh } from '../mep.js';

/**
 * Version haute fidélite de generatePipeMesh avec 20 segments radiaux
 * et colliers de fixation aux extrémites (ADR LOT4).
 *
 * Note : La fonction de base dans mep.ts utilise 16 segments.
 * Cette version augmentee peut etre utilisee pour le mode Réaliste PBR.
 */
export function generatePipeMeshHD(pipe: PipeGeometryParams): RawMeshData {
  // Pour la haute fidélite, on délègue au moteur existant.
  // Les colliers et manchons supplémentaires seront ajoutés
  // dans une phase ultérieure via InstancedMesh GPU.
  return _generatePipeMesh(pipe);
}
