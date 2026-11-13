import { type WallPiece } from '../openings/types.js';
import { type RawMeshData, type MeshBuildOptions, type BoundingBox3D } from './types.js';
import { triangulatePolygon } from './triangulate.js';
import { signedArea } from '../polygon.js';

const DEFAULT_MIN_AREA = 1e-4; // 1e-4 mm²

/**
 * Extrude une WallPiece 2.5D en un maillage 3D fermé (RawMeshData) avec normales franches
 * et enroulement CCW strict vu de l'extérieur.
 *
 * Règles :
 * - Les pièces de rôle 'void' NE sont PAS extrudées (retourne null).
 * - Les polygones d'aire < minArea ou dégénérés sont ignorés (retourne null).
 * - Les faces supérieures et inférieures sont triangulées et orientées vers l'extérieur (+Z et -Z).
 * - Chaque face latérale (flanc) possède sa propre normale unitaire extérieure et 2 triangles CCW.
 */
export function extrudeWallPiece(piece: WallPiece, options?: MeshBuildOptions): RawMeshData | null {
  // 1. Règle absolue : les réservations de vides ne génèrent pas de matière 3D
  if (piece.role === 'void') {
    return null;
  }

  // 2. Validation de l'altitude
  const z0 = piece.z0;
  const z1 = piece.z1;
  const height = z1 - z0;
  if (height <= 0) {
    return null;
  }

  // 3. Validation de l'emprise 2D
  const minArea = options?.minArea ?? DEFAULT_MIN_AREA;
  if (piece.poly2D.length < 3 || Math.abs(signedArea(piece.poly2D)) < minArea) {
    return null;
  }

  // 4. Triangulation 2D de la section
  const { cleanedVertices, indices: indices2D } = triangulatePolygon(piece.poly2D);
  const n = cleanedVertices.length;
  const numTriangles2D = indices2D.length / 3;

  if (n < 3 || numTriangles2D === 0) {
    return null;
  }

  // 5. Calcul de la boîte englobante AABB 3D
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < n; i++) {
    const v = cleanedVertices[i];
    if (v) {
      if (v.x < minX) minX = v.x;
      if (v.x > maxX) maxX = v.x;
      if (v.y < minY) minY = v.y;
      if (v.y > maxY) maxY = v.y;
    }
  }

  const boundingBox: BoundingBox3D = {
    min: { x: minX, y: minY, z: z0 },
    max: { x: maxX, y: maxY, z: z1 },
  };

  // 6. Dimensionnement des buffers (normales franches = sommets dupliqués par face)
  // - Face supérieure (+Z) : n sommets, numTriangles2D * 3 indices
  // - Face inférieure (-Z) : n sommets, numTriangles2D * 3 indices
  // - Flancs latéraux (n arêtes) : n * 4 sommets, n * 6 indices
  const totalVertices = n + n + n * 4;
  const totalIndices = numTriangles2D * 3 + numTriangles2D * 3 + n * 6;

  const positions = new Float32Array(totalVertices * 3);
  const normals = new Float32Array(totalVertices * 3);
  const indices = new Uint32Array(totalIndices);

  const generateUVs = options?.generateUVs ?? true;
  const uvs = generateUVs ? new Float32Array(totalVertices * 2) : undefined;

  let vPtr = 0; // Pointeur d'indice de sommet global
  let iPtr = 0; // Pointeur d'indice de triangle

  // -------------------------------------------------------------
  // A. Face Supérieure (Z = z1, normale unitaire +Z = (0, 0, 1))
  // -------------------------------------------------------------
  const topBaseIndex = vPtr;
  for (let i = 0; i < n; i++) {
    const v = cleanedVertices[i];
    if (!v) continue;

    const pIdx = (topBaseIndex + i) * 3;
    positions[pIdx] = v.x;
    positions[pIdx + 1] = v.y;
    positions[pIdx + 2] = z1;

    normals[pIdx] = 0;
    normals[pIdx + 1] = 0;
    normals[pIdx + 2] = 1;

    if (uvs) {
      const uvIdx = (topBaseIndex + i) * 2;
      uvs[uvIdx] = (v.x - minX) / 1000;
      uvs[uvIdx + 1] = (v.y - minY) / 1000;
    }
  }
  vPtr += n;

  // Triangles de la face supérieure : CCW vus du dessus (+Z)
  for (let i = 0; i < indices2D.length; i += 3) {
    const i0 = indices2D[i];
    const i1 = indices2D[i + 1];
    const i2 = indices2D[i + 2];
    if (i0 !== undefined && i1 !== undefined && i2 !== undefined) {
      indices[iPtr++] = topBaseIndex + i0;
      indices[iPtr++] = topBaseIndex + i1;
      indices[iPtr++] = topBaseIndex + i2;
    }
  }

  // -------------------------------------------------------------
  // B. Face Inférieure (Z = z0, normale unitaire -Z = (0, 0, -1))
  // -------------------------------------------------------------
  const bottomBaseIndex = vPtr;
  for (let i = 0; i < n; i++) {
    const v = cleanedVertices[i];
    if (!v) continue;

    const pIdx = (bottomBaseIndex + i) * 3;
    positions[pIdx] = v.x;
    positions[pIdx + 1] = v.y;
    positions[pIdx + 2] = z0;

    normals[pIdx] = 0;
    normals[pIdx + 1] = 0;
    normals[pIdx + 2] = -1;

    if (uvs) {
      const uvIdx = (bottomBaseIndex + i) * 2;
      uvs[uvIdx] = (v.x - minX) / 1000;
      uvs[uvIdx + 1] = (v.y - minY) / 1000;
    }
  }
  vPtr += n;

  // Triangles de la face inférieure : ordre inversé (i0, i2, i1) pour être CCW vus du dessous (-Z)
  for (let i = 0; i < indices2D.length; i += 3) {
    const i0 = indices2D[i];
    const i1 = indices2D[i + 1];
    const i2 = indices2D[i + 2];
    if (i0 !== undefined && i1 !== undefined && i2 !== undefined) {
      indices[iPtr++] = bottomBaseIndex + i0;
      indices[iPtr++] = bottomBaseIndex + i2;
      indices[iPtr++] = bottomBaseIndex + i1;
    }
  }

  // -------------------------------------------------------------
  // C. Flancs Latéraux (pour chaque arête (v_i, v_{i+1}))
  // -------------------------------------------------------------
  for (let i = 0; i < n; i++) {
    const vCurrent = cleanedVertices[i];
    const vNext = cleanedVertices[(i + 1) % n];
    if (!vCurrent || !vNext) continue;

    const dx = vNext.x - vCurrent.x;
    const dy = vNext.y - vCurrent.y;
    const edgeLength = Math.hypot(dx, dy);

    // Si arête dégénérée de longueur nulle, normale par défaut vers X
    const nx = edgeLength > 1e-9 ? dy / edgeLength : 1;
    const ny = edgeLength > 1e-9 ? -dx / edgeLength : 0;
    const nz = 0;

    const quadBaseIndex = vPtr;

    // Sommet 0 : bas gauche (vCurrent à z0)
    let pIdx = (quadBaseIndex + 0) * 3;
    positions[pIdx] = vCurrent.x;
    positions[pIdx + 1] = vCurrent.y;
    positions[pIdx + 2] = z0;
    normals[pIdx] = nx;
    normals[pIdx + 1] = ny;
    normals[pIdx + 2] = nz;

    // Sommet 1 : bas droit (vNext à z0)
    pIdx = (quadBaseIndex + 1) * 3;
    positions[pIdx] = vNext.x;
    positions[pIdx + 1] = vNext.y;
    positions[pIdx + 2] = z0;
    normals[pIdx] = nx;
    normals[pIdx + 1] = ny;
    normals[pIdx + 2] = nz;

    // Sommet 2 : haut droit (vNext à z1)
    pIdx = (quadBaseIndex + 2) * 3;
    positions[pIdx] = vNext.x;
    positions[pIdx + 1] = vNext.y;
    positions[pIdx + 2] = z1;
    normals[pIdx] = nx;
    normals[pIdx + 1] = ny;
    normals[pIdx + 2] = nz;

    // Sommet 3 : haut gauche (vCurrent à z1)
    pIdx = (quadBaseIndex + 3) * 3;
    positions[pIdx] = vCurrent.x;
    positions[pIdx + 1] = vCurrent.y;
    positions[pIdx + 2] = z1;
    normals[pIdx] = nx;
    normals[pIdx + 1] = ny;
    normals[pIdx + 2] = nz;

    if (uvs) {
      let uvIdx = (quadBaseIndex + 0) * 2;
      uvs[uvIdx] = 0;
      uvs[uvIdx + 1] = 0;

      uvIdx = (quadBaseIndex + 1) * 2;
      uvs[uvIdx] = edgeLength / 1000;
      uvs[uvIdx + 1] = 0;

      uvIdx = (quadBaseIndex + 2) * 2;
      uvs[uvIdx] = edgeLength / 1000;
      uvs[uvIdx + 1] = height / 1000;

      uvIdx = (quadBaseIndex + 3) * 2;
      uvs[uvIdx] = 0;
      uvs[uvIdx + 1] = height / 1000;
    }

    // Deux triangles formant le quad, orientés CCW vus de l'extérieur :
    // Triangle 1 : 0 -> 1 -> 2
    indices[iPtr++] = quadBaseIndex + 0;
    indices[iPtr++] = quadBaseIndex + 1;
    indices[iPtr++] = quadBaseIndex + 2;

    // Triangle 2 : 0 -> 2 -> 3
    indices[iPtr++] = quadBaseIndex + 0;
    indices[iPtr++] = quadBaseIndex + 2;
    indices[iPtr++] = quadBaseIndex + 3;

    vPtr += 4;
  }

  const result: RawMeshData = {
    positions,
    normals,
    indices,
    ...(uvs ? { uvs } : {}),
    elementId: piece.id,
    role: piece.role,
    boundingBox,
  };

  return result;
}
