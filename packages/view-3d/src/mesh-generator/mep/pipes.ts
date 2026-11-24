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
    // Corps principal
    acc.addCylinder(p1, p2, radius * 0.96, 16, true);

    // Bagues de renfort / Manchons d'extrémité et colliers intermédiaires
    if (totalLength >= 120) {
      const collarLength = Math.min(25, totalLength * 0.1);
      // Manchon de départ (en retrait de 10 mm pour éviter les chevauchements de raccords)
      const pStart1 = add(p1, scale(axis, 10));
      const pStart2 = add(p1, scale(axis, 10 + collarLength));
      acc.addCylinder(pStart1, pStart2, radius, 16, true);

      // Manchon d'arrivée
      const pEnd1 = add(p2, scale(axis, -(10 + collarLength)));
      const pEnd2 = add(p2, scale(axis, -10));
      acc.addCylinder(pEnd1, pEnd2, radius, 16, true);

      // Colliers de fixation intermédiaires tous les 1 500 mm
      const collarInterval = 1500;
      if (totalLength > collarInterval) {
        const numIntermediate = Math.floor(totalLength / collarInterval);
        const step = totalLength / (numIntermediate + 1);
        for (let i = 1; i <= numIntermediate; i++) {
          const center = add(p1, scale(axis, i * step));
          const c1 = add(center, scale(axis, -collarLength / 2));
          const c2 = add(center, scale(axis, collarLength / 2));
          acc.addCylinder(c1, c2, radius, 16, true);
        }
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
