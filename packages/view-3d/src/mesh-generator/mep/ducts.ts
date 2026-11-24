/**
 * mesh-generator/mep/ducts — Gaines aérauliques 3D (circulaires et rectangulaires)
 */

import type { RawMeshData } from '@tabax/geometry';
import type { DuctGeometryParams } from '../types.js';
import { RawMeshAccumulator, v3 } from './common.js';
import { getMepSystemColor } from './colors.js';

export function generateDuctMesh(duct: DuctGeometryParams): RawMeshData {
  const acc = new RawMeshAccumulator();
  const p1 = v3(duct.start.x, duct.start.y, duct.start.z);
  const p2 = v3(duct.end.x, duct.end.y, duct.end.z);

  if (duct.shape === 'round') {
    const radius = Math.max(1, (duct.diameter ?? 200) / 2);
    acc.addCylinder(p1, p2, radius, 16, true);
  } else {
    const width = Math.max(1, duct.width ?? 300);
    const height = Math.max(1, duct.height ?? 200);
    acc.addBoxAlongAxis(p1, p2, width, height, true);
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
