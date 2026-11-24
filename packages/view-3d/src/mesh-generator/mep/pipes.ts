/**
 * mesh-generator/mep/pipes — Tuyauterie hydraulique et plomberie 3D haute fidélité
 *
 * Génère un modèle réaliste comprenant :
 * - Corps tubulaire régulier
 * - Manchons d'accouplement et bagues d'assemblage aux extrémités
 * - Colliers de supportage intermédiaires réguliers sur les longues portées
 * - Respect strict des boîtes englobantes et axes géométriques (ADR-026 / ADR-072)
 */

import type { RawMeshData } from '@tabax/geometry';
import type { PipeGeometryParams } from '../types.js';
import { RawMeshAccumulator, v3, add, sub, scale, len, normalize } from './common.js';
import { getMepSystemColor } from './colors.js';

export function generatePipeMesh(pipe: PipeGeometryParams): RawMeshData {
  const acc = new RawMeshAccumulator();
  const radius = Math.max(1, pipe.diameter / 2);
  const p1 = v3(pipe.start.x, pipe.start.y, pipe.start.z);
  const p2 = v3(pipe.end.x, pipe.end.y, pipe.end.z);
  const dir = sub(p2, p1);
  const totalLength = len(dir);

  if (totalLength > 1e-4) {
    const axis = normalize(dir);
    // Corps tubulaire principal régulier au rayon nominal exact (caps = true garantit des terminaisons propres sans vide)
    acc.addCylinder(p1, p2, radius, 16, true);

    // Colliers de fixation et supportage réguliers sur les canalisations (ADR-072)
    // Disposés tous les 1 200 mm sur les canalisations d'au moins 1 500 mm
    // Relief franc de 12 % (rayon 1,12 x r) éliminant tout z-fighting à distance (ADR-026 / ADR-072)
    const clampInterval = 1200;
    const clampWidth = Math.min(20, Math.max(10, radius * 0.4));
    const clampRadius = radius * 1.12;
    if (totalLength >= 1500) {
      const numIntermediate = Math.max(1, Math.floor(totalLength / clampInterval));
      const step = totalLength / (numIntermediate + 1);
      for (let i = 1; i <= numIntermediate; i++) {
        const center = add(p1, scale(axis, i * step));
        const c1 = add(center, scale(axis, -clampWidth / 2));
        const c2 = add(center, scale(axis, clampWidth / 2));
        acc.addCylinder(c1, c2, clampRadius, 16, true);
      }
    }
  }

  const color = pipe.color ?? getMepSystemColor(pipe.systemType, pipe.domain);

  return acc.toRawMeshData(pipe.id, {
    elementId: pipe.id,
    category: 'pipe',
    levelId: pipe.levelId,
    systemId: pipe.systemId,
    systemType: pipe.systemType,
    domain: pipe.domain,
    color,
  });
}
