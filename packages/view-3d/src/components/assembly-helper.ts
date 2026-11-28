/**
 * components/assembly-helper — Utilitaires de fusion et d'orientation d'assemblages architecturaux
 */

import type { RawMeshData } from '@tabax/geometry';
import type { ComponentAssemblyPart, ComponentMaterialRole } from './types.js';

export function createAssemblyPart(
  rawData: RawMeshData,
  materialRole: ComponentMaterialRole,
  color?: string,
): ComponentAssemblyPart {
  return {
    rawData,
    materialRole,
    color,
  };
}

/**
 * Fusionne les différentes pièces d'un assemblage en un unique RawMeshData combiné.
 * Assure la compatibilité ascendante avec les consommateurs 3D mono-matériaux (ADR-026).
 */
export function mergeAssemblyParts(
  parts: readonly ComponentAssemblyPart[],
  elementId: string,
): RawMeshData | null {
  if (parts.length === 0) return null;

  let totalPos = 0;
  let totalIdx = 0;
  for (const p of parts) {
    totalPos += p.rawData.positions.length;
    totalIdx += p.rawData.indices.length;
  }
  if (totalPos === 0 || totalIdx === 0) return null;

  const positions = new Float32Array(totalPos);
  const normals = new Float32Array(totalPos);
  const uvs = new Float32Array((totalPos / 3) * 2);
  const indices = new Uint32Array(totalIdx);

  let posOffset = 0;
  let idxOffset = 0;
  let vertexOffset = 0;

  let minX = Infinity;
  let minY = Infinity;
  let minZ = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  let maxZ = -Infinity;

  for (const part of parts) {
    const raw = part.rawData;
    positions.set(raw.positions, posOffset);
    normals.set(raw.normals, posOffset);
    if (raw.uvs) {
      uvs.set(raw.uvs, (posOffset / 3) * 2);
    }

    for (let i = 0; i < raw.indices.length; i++) {
      indices[idxOffset + i] = (raw.indices[i] ?? 0) + vertexOffset;
    }

    const bbox = raw.boundingBox;
    if (bbox) {
      if (bbox.min.x < minX) minX = bbox.min.x;
      if (bbox.min.y < minY) minY = bbox.min.y;
      if (bbox.min.z < minZ) minZ = bbox.min.z;
      if (bbox.max.x > maxX) maxX = bbox.max.x;
      if (bbox.max.y > maxY) maxY = bbox.max.y;
      if (bbox.max.z > maxZ) maxZ = bbox.max.z;
    }

    idxOffset += raw.indices.length;
    vertexOffset += raw.positions.length / 3;
    posOffset += raw.positions.length;
  }

  const min = { x: minX, y: minY, z: minZ };
  const max = { x: maxX, y: maxY, z: maxZ };

  return {
    elementId,
    role: 'full',
    positions,
    normals,
    uvs,
    indices,
    boundingBox: { min, max },
    bounds: { min, max },
  } as unknown as RawMeshData;
}
