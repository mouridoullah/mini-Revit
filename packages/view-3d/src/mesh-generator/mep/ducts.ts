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
      // Corps tubulaire circulaire fermé aux extrémités (caps = true élimine l'effet de vide en terminaison)
      acc.addCylinder(p1, p2, radius, 16, true);

      // Manchons circulaires à brides d'étanchéité avec relief franc (rayon 1,08 x r)
      if (totalLength >= 150) {
        const flangeWidth = Math.min(30, totalLength * 0.08);
        const flangeRadius = radius * 1.08;
        // Bride de début
        acc.addCylinder(p1, add(p1, scale(axis, flangeWidth)), flangeRadius, 16, false);
        // Bride de fin
        acc.addCylinder(add(p2, scale(axis, -flangeWidth)), p2, flangeRadius, 16, false);

        // Brides intermédiaires tous les 1 200 mm
        const flangeInterval = 1200;
        if (totalLength > flangeInterval) {
          const numIntermediate = Math.floor(totalLength / flangeInterval);
          const step = totalLength / (numIntermediate + 1);
          for (let i = 1; i <= numIntermediate; i++) {
            const center = add(p1, scale(axis, i * step));
            const c1 = add(center, scale(axis, -flangeWidth / 2));
            const c2 = add(center, scale(axis, flangeWidth / 2));
            acc.addCylinder(c1, c2, flangeRadius, 16, false);
          }
        }
      }
    } else {
      const width = Math.max(1, duct.width ?? 300);
      const height = Math.max(1, duct.height ?? 200);

      // Corps de gaine rectangulaire fermé (caps = true garantit des plénums et bouches opaques)
      acc.addBoxAlongAxis(p1, p2, width, height, true);

      // Cadres de brides rectangulaires d'assemblage en tôle avec relief franc (+6 %)
      if (totalLength >= 150) {
        const flangeWidth = Math.min(25, totalLength * 0.06);
        const flangeW = width * 1.06;
        const flangeH = height * 1.06;
        // Cadre de début
        acc.addBoxAlongAxis(p1, add(p1, scale(axis, flangeWidth)), flangeW, flangeH, false);
        // Cadre de fin
        acc.addBoxAlongAxis(add(p2, scale(axis, -flangeWidth)), p2, flangeW, flangeH, false);

        // Cadres intermédiaires tous les 1 200 mm
        const flangeInterval = 1200;
        if (totalLength > flangeInterval) {
          const numIntermediate = Math.floor(totalLength / flangeInterval);
          const step = totalLength / (numIntermediate + 1);
          for (let i = 1; i <= numIntermediate; i++) {
            const center = add(p1, scale(axis, i * step));
            const c1 = add(center, scale(axis, -flangeWidth / 2));
            const c2 = add(center, scale(axis, flangeWidth / 2));
            acc.addBoxAlongAxis(c1, c2, flangeW, flangeH, false);
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
