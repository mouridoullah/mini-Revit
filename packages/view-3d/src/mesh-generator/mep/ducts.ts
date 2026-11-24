/**
 * mesh-generator/mep/ducts — Gaines aérauliques 3D haute fidélité (circulaires et rectangulaires)
 *
 * Intègre les cadres de brides transversales d'assemblage en tôle galvanisée
 * et manchons à lèvres d'étanchéité réguliers, respectant strictement les cotes AABB (ADR-072).
 */

import type { RawMeshData } from '@tabax/geometry';
import type { DuctGeometryParams } from '../types.js';
import { RawMeshAccumulator, v3, add, sub, scale, len, normalize } from './common.js';
import { getMepSystemColor } from './colors.js';

export function generateDuctMesh(duct: DuctGeometryParams): RawMeshData {
  const acc = new RawMeshAccumulator();
  const p1 = v3(duct.start.x, duct.start.y, duct.start.z);
  const p2 = v3(duct.end.x, duct.end.y, duct.end.z);
  const dir = sub(p2, p1);
  const totalLength = len(dir);

  if (totalLength > 1e-4) {
    const axis = normalize(dir);

    if (duct.shape === 'round') {
      const radius = Math.max(1, (duct.diameter ?? 200) / 2);
      // Corps tubulaire circulaire
      acc.addCylinder(p1, p2, radius * 0.97, 16, true);

      // Manchons circulaires à brides d'étanchéité
      if (totalLength >= 150) {
        const flangeWidth = Math.min(30, totalLength * 0.08);
        // Bride de début
        acc.addCylinder(p1, add(p1, scale(axis, flangeWidth)), radius, 16, true);
        // Bride de fin
        acc.addCylinder(add(p2, scale(axis, -flangeWidth)), p2, radius, 16, true);

        // Brides intermédiaires tous les 1 200 mm
        const flangeInterval = 1200;
        if (totalLength > flangeInterval) {
          const numIntermediate = Math.floor(totalLength / flangeInterval);
          const step = totalLength / (numIntermediate + 1);
          for (let i = 1; i <= numIntermediate; i++) {
            const center = add(p1, scale(axis, i * step));
            const c1 = add(center, scale(axis, -flangeWidth / 2));
            const c2 = add(center, scale(axis, flangeWidth / 2));
            acc.addCylinder(c1, c2, radius, 16, true);
          }
        }
      }
    } else {
      const width = Math.max(1, duct.width ?? 300);
      const height = Math.max(1, duct.height ?? 200);

      // Corps de gaine rectangulaire
      acc.addBoxAlongAxis(p1, p2, width * 0.97, height * 0.97, true);

      // Cadres de brides rectangulaires d'assemblage en tôle
      if (totalLength >= 150) {
        const flangeWidth = Math.min(25, totalLength * 0.06);
        // Cadre de début
        acc.addBoxAlongAxis(p1, add(p1, scale(axis, flangeWidth)), width, height, true);
        // Cadre de fin
        acc.addBoxAlongAxis(add(p2, scale(axis, -flangeWidth)), p2, width, height, true);

        // Cadres intermédiaires tous les 1 200 mm
        const flangeInterval = 1200;
        if (totalLength > flangeInterval) {
          const numIntermediate = Math.floor(totalLength / flangeInterval);
          const step = totalLength / (numIntermediate + 1);
          for (let i = 1; i <= numIntermediate; i++) {
            const center = add(p1, scale(axis, i * step));
            const c1 = add(center, scale(axis, -flangeWidth / 2));
            const c2 = add(center, scale(axis, flangeWidth / 2));
            acc.addBoxAlongAxis(c1, c2, width, height, true);
          }
        }
      }
    }
  }

  const color = duct.color ?? getMepSystemColor(duct.systemType, duct.domain);

  return acc.toRawMeshData(duct.id, {
    elementId: duct.id,
    category: 'duct',
    shape: duct.shape,
    levelId: duct.levelId,
    systemId: duct.systemId,
    systemType: duct.systemType,
    domain: duct.domain,
    color,
  });
}
