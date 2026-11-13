import { type WallPiece } from '../openings/types.js';
import { type RawMeshData, type MeshBuildOptions, type BoundingBox3D } from './types.js';
import { extrudeWallPiece } from './extrude.js';

export interface HostWallInput {
  readonly id: string;
}

/**
 * Construit la collection de maillages 3D (un RawMeshData par WallPiece non-void) pour un mur donné.
 */
export function buildWallMesh(
  _wall: HostWallInput,
  pieces: readonly WallPiece[],
  options?: MeshBuildOptions,
): RawMeshData[] {
  const meshes: RawMeshData[] = [];

  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i];
    if (!piece || piece.role === 'void') continue;

    const mesh = extrudeWallPiece(piece, options);
    if (mesh) {
      meshes.push(mesh);
    }
  }

  return meshes;
}

/**
 * Construit un maillage 3D agrégé unique pour le mur entier, fusionnant toutes les pièces
 * en un seul ensemble de buffers continus (positions, normales, indices) pour un rendu Three.js
 * optimal en 1 seul draw call.
 */
export function buildWallMeshAggregated(
  wall: HostWallInput,
  pieces: readonly WallPiece[],
  options?: MeshBuildOptions,
): RawMeshData {
  const subMeshes = buildWallMesh(wall, pieces, options);

  if (subMeshes.length === 0) {
    const emptyBox: BoundingBox3D = {
      min: { x: 0, y: 0, z: 0 },
      max: { x: 0, y: 0, z: 0 },
    };
    return {
      positions: new Float32Array(0),
      normals: new Float32Array(0),
      indices: new Uint32Array(0),
      elementId: wall.id,
      role: 'full',
      boundingBox: emptyBox,
    };
  }

  // Calcul des dimensions totales combinées
  let totalVertexCount = 0;
  let totalIndexCount = 0;
  let hasUVs = true;

  for (const m of subMeshes) {
    totalVertexCount += m.positions.length / 3;
    totalIndexCount += m.indices.length;
    if (!m.uvs) hasUVs = false;
  }

  const positions = new Float32Array(totalVertexCount * 3);
  const normals = new Float32Array(totalVertexCount * 3);
  const indices = new Uint32Array(totalIndexCount);
  const uvs = hasUVs ? new Float32Array(totalVertexCount * 2) : undefined;

  let vOffset = 0;
  let pPtr = 0;
  let nPtr = 0;
  let iPtr = 0;
  let uvPtr = 0;

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;

  for (const m of subMeshes) {
    // Fusion des positions et normales
    positions.set(m.positions, pPtr);
    normals.set(m.normals, nPtr);

    if (uvs && m.uvs) {
      uvs.set(m.uvs, uvPtr);
      uvPtr += m.uvs.length;
    }

    // Ré-indexation des triangles avec le décalage de sommets
    const subVertexCount = m.positions.length / 3;
    for (let i = 0; i < m.indices.length; i++) {
      const idx = m.indices[i];
      if (idx !== undefined) {
        indices[iPtr++] = vOffset + idx;
      }
    }

    // Mise à jour de la boîte englobante globale
    if (m.boundingBox.min.x < minX) minX = m.boundingBox.min.x;
    if (m.boundingBox.max.x > maxX) maxX = m.boundingBox.max.x;
    if (m.boundingBox.min.y < minY) minY = m.boundingBox.min.y;
    if (m.boundingBox.max.y > maxY) maxY = m.boundingBox.max.y;
    if (m.boundingBox.min.z < minZ) minZ = m.boundingBox.min.z;
    if (m.boundingBox.max.z > maxZ) maxZ = m.boundingBox.max.z;

    vOffset += subVertexCount;
    pPtr += m.positions.length;
    nPtr += m.normals.length;
  }

  const boundingBox: BoundingBox3D = {
    min: { x: minX, y: minY, z: minZ },
    max: { x: maxX, y: maxY, z: maxZ },
  };

  return {
    positions,
    normals,
    indices,
    ...(uvs ? { uvs } : {}),
    elementId: wall.id,
    role: 'full',
    boundingBox,
  };
}
