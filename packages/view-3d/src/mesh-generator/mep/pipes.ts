/**
 * mesh-generator/mep/pipes — Tuyauterie hydraulique et plomberie 3D
 */

import type { RawMeshData } from '@tabax/geometry';
import type { PipeGeometryParams } from '../types.js';
import { RawMeshAccumulator, v3 } from './common.js';
import { getMepSystemColor } from './colors.js';

export function generatePipeMesh(pipe: PipeGeometryParams): RawMeshData {
  const acc = new RawMeshAccumulator();
  const radius = Math.max(1, pipe.diameter / 2);
  const p1 = v3(pipe.start.x, pipe.start.y, pipe.start.z);
  const p2 = v3(pipe.end.x, pipe.end.y, pipe.end.z);

  acc.addCylinder(p1, p2, radius, 16, true);

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
