import {
  vec2,
  triangulatePolygonWithHoles,
  type RawMeshData,
  type Vec2,
} from '@tabax/geometry';
import type { StairGeometryParams, StairTypeGeometryParams } from './types.js';

/**
 * Génère le maillage 3D brut (RawMeshData) d'un escalier droit paramétrique (ADR-048).
 * Produit un maillage solide crénelé étanche (Euler V - E + F = 2) en 1 seul draw call
 * comprenant les marches supérieures (+Z), les contremarches (-u), le mur arrière (+u),
 * la base inférieure (-Z) et les deux flancs latéraux (+-n).
 */
export function createStairMesh(
  stair: StairGeometryParams,
  stairType?: StairTypeGeometryParams,
): RawMeshData | null {
  const z0 = stair.bottomElevation ?? 0;
  const z1 = stair.topElevation ?? z0 + 2800;
  const deltaZ = z1 - z0;
  if (deltaZ <= 0) return null;

  const dx = stair.end.x - stair.start.x;
  const dy = stair.end.y - stair.start.y;
  const len = Math.hypot(dx, dy);
  if (len <= 1e-4) return null;

  const width = stair.widthOverride ?? stairType?.width ?? 900;
  if (width <= 0) return null;

  // 1. Découpage altimétrique en N contremarches
  const numberOfSteps = Math.min(30, Math.max(3, Math.round(deltaZ / 175)));
  const stepHeight = deltaZ / numberOfSteps;
  const stepDepth = len / numberOfSteps;

  const ux = dx / len;
  const uy = dy / len;
  const nx = -uy;
  const ny = ux;
  const halfW = width / 2;

  const numQuads = 2 * numberOfSteps + 2;
  const flankVertsCount = 2 * numberOfSteps + 2;
  const flankTrisCount = 2 * numberOfSteps;
  const totalVerts = numQuads * 4 + 2 * flankVertsCount;
  const totalIndices = numQuads * 6 + 2 * flankTrisCount * 3;

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const indices = new Uint32Array(totalIndices);

  let vOffset = 0;
  let iOffset = 0;

  const addQuad = (
    p0: { x: number; y: number; z: number },
    p1: { x: number; y: number; z: number },
    p2: { x: number; y: number; z: number },
    p3: { x: number; y: number; z: number },
    normal: { x: number; y: number; z: number },
  ) => {
    const baseV = vOffset;
    const pts = [p0, p1, p2, p3];
    for (let k = 0; k < 4; k++) {
      const pt = pts[k];
      if (!pt) continue;
      const idx = (baseV + k) * 3;
      positions[idx] = pt.x;
      positions[idx + 1] = pt.y;
      positions[idx + 2] = pt.z;

      normals[idx] = normal.x;
      normals[idx + 1] = normal.y;
      normals[idx + 2] = normal.z;

      uvs[(baseV + k) * 2] = pt.x / 1000;
      uvs[(baseV + k) * 2 + 1] = pt.y / 1000;
    }
    vOffset += 4;

    indices[iOffset++] = baseV;
    indices[iOffset++] = baseV + 1;
    indices[iOffset++] = baseV + 2;

    indices[iOffset++] = baseV;
    indices[iOffset++] = baseV + 2;
    indices[iOffset++] = baseV + 3;
  };

  // 1. Contremarches verticales (Risers, normale -u)
  for (let i = 0; i < numberOfSteps; i++) {
    const s = i * stepDepth;
    const zLow = z0 + i * stepHeight;
    const zHigh = z0 + (i + 1) * stepHeight;

    const mx = stair.start.x + ux * s;
    const my = stair.start.y + uy * s;

    addQuad(
      { x: mx + nx * halfW, y: my + ny * halfW, z: zLow },
      { x: mx - nx * halfW, y: my - ny * halfW, z: zLow },
      { x: mx - nx * halfW, y: my - ny * halfW, z: zHigh },
      { x: mx + nx * halfW, y: my + ny * halfW, z: zHigh },
      { x: -ux, y: -uy, z: 0 },
    );
  }

  // 2. Marches horizontales (Treads, normale +Z)
  for (let i = 0; i < numberOfSteps; i++) {
    const s0 = i * stepDepth;
    const s1 = (i + 1) * stepDepth;
    const z = z0 + (i + 1) * stepHeight;

    const m0x = stair.start.x + ux * s0;
    const m0y = stair.start.y + uy * s0;
    const m1x = stair.start.x + ux * s1;
    const m1y = stair.start.y + uy * s1;

    addQuad(
      { x: m0x - nx * halfW, y: m0y - ny * halfW, z },
      { x: m1x - nx * halfW, y: m1y - ny * halfW, z },
      { x: m1x + nx * halfW, y: m1y + ny * halfW, z },
      { x: m0x + nx * halfW, y: m0y + ny * halfW, z },
      { x: 0, y: 0, z: 1 },
    );
  }

  // 3. Dos vertical (Back quad à s = len, normale +u)
  {
    const mx = stair.start.x + ux * len;
    const my = stair.start.y + uy * len;

    addQuad(
      { x: mx - nx * halfW, y: my - ny * halfW, z: z0 },
      { x: mx + nx * halfW, y: my + ny * halfW, z: z0 },
      { x: mx + nx * halfW, y: my + ny * halfW, z: z1 },
      { x: mx - nx * halfW, y: my - ny * halfW, z: z1 },
      { x: ux, y: uy, z: 0 },
    );
  }

  // 4. Base inférieure (Bottom quad à z = z0, normale -Z)
  {
    const m0x = stair.start.x;
    const m0y = stair.start.y;
    const m1x = stair.start.x + ux * len;
    const m1y = stair.start.y + uy * len;

    addQuad(
      { x: m0x - nx * halfW, y: m0y - ny * halfW, z: z0 },
      { x: m0x + nx * halfW, y: m0y + ny * halfW, z: z0 },
      { x: m1x + nx * halfW, y: m1y + ny * halfW, z: z0 },
      { x: m1x - nx * halfW, y: m1y - ny * halfW, z: z0 },
      { x: 0, y: 0, z: -1 },
    );
  }

  // 5. Flancs latéraux (Triangulation 2D plane sans T-junctions pour Euler = 2)
  const profile2D: Vec2[] = [];
  profile2D.push(vec2(0, z0));
  for (let i = 0; i < numberOfSteps; i++) {
    profile2D.push(vec2(i * stepDepth, z0 + (i + 1) * stepHeight));
    profile2D.push(vec2((i + 1) * stepDepth, z0 + (i + 1) * stepHeight));
  }
  profile2D.push(vec2(len, z0));

  const { vertices: flankVerts, indices: flankIndices } = triangulatePolygonWithHoles(
    profile2D,
    [],
  );

  // 5a. Flanc droit (+n)
  const rightStartV = vOffset;
  for (let i = 0; i < flankVerts.length; i++) {
    const fv = flankVerts[i];
    if (!fv) continue;
    const s = fv.x;
    const z = fv.y;
    const wx = stair.start.x + ux * s + nx * halfW;
    const wy = stair.start.y + uy * s + ny * halfW;

    const idx = (rightStartV + i) * 3;
    positions[idx] = wx;
    positions[idx + 1] = wy;
    positions[idx + 2] = z;

    normals[idx] = nx;
    normals[idx + 1] = ny;
    normals[idx + 2] = 0;

    uvs[(rightStartV + i) * 2] = wx / 1000;
    uvs[(rightStartV + i) * 2 + 1] = wy / 1000;
  }
  vOffset += flankVerts.length;

  for (let i = 0; i < flankIndices.length; i += 3) {
    const i0 = flankIndices[i];
    const i1 = flankIndices[i + 1];
    const i2 = flankIndices[i + 2];
    if (i0 === undefined || i1 === undefined || i2 === undefined) continue;

    const v0 = flankVerts[i0];
    const v1 = flankVerts[i1];
    const v2 = flankVerts[i2];
    if (!v0 || !v1 || !v2) continue;

    // Dans le repère 3D (u, n, z) avec Z-up et normale extérieure +n :
    // (u x z) = -n. Donc pour pointer vers +n, l'ordre des sommets dans le plan (s, z) doit être CW (crossSZ < 0).
    const crossSZ = (v1.x - v0.x) * (v2.y - v0.y) - (v1.y - v0.y) * (v2.x - v0.x);
    if (crossSZ < 0) {
      indices[iOffset++] = rightStartV + i0;
      indices[iOffset++] = rightStartV + i1;
      indices[iOffset++] = rightStartV + i2;
    } else {
      indices[iOffset++] = rightStartV + i0;
      indices[iOffset++] = rightStartV + i2;
      indices[iOffset++] = rightStartV + i1;
    }
  }

  // 5b. Flanc gauche (-n)
  const leftStartV = vOffset;
  for (let i = 0; i < flankVerts.length; i++) {
    const fv = flankVerts[i];
    if (!fv) continue;
    const s = fv.x;
    const z = fv.y;
    const wx = stair.start.x + ux * s - nx * halfW;
    const wy = stair.start.y + uy * s - ny * halfW;

    const idx = (leftStartV + i) * 3;
    positions[idx] = wx;
    positions[idx + 1] = wy;
    positions[idx + 2] = z;

    normals[idx] = -nx;
    normals[idx + 1] = -ny;
    normals[idx + 2] = 0;

    uvs[(leftStartV + i) * 2] = wx / 1000;
    uvs[(leftStartV + i) * 2 + 1] = wy / 1000;
  }
  vOffset += flankVerts.length;

  for (let i = 0; i < flankIndices.length; i += 3) {
    const i0 = flankIndices[i];
    const i1 = flankIndices[i + 1];
    const i2 = flankIndices[i + 2];
    if (i0 === undefined || i1 === undefined || i2 === undefined) continue;

    const v0 = flankVerts[i0];
    const v1 = flankVerts[i1];
    const v2 = flankVerts[i2];
    if (!v0 || !v1 || !v2) continue;

    const crossSZ = (v1.x - v0.x) * (v2.y - v0.y) - (v1.y - v0.y) * (v2.x - v0.x);
    // Normale opposée (-n) : orienter vers l'extérieur gauche (crossSZ > 0)
    if (crossSZ > 0) {
      indices[iOffset++] = leftStartV + i0;
      indices[iOffset++] = leftStartV + i1;
      indices[iOffset++] = leftStartV + i2;
    } else {
      indices[iOffset++] = leftStartV + i0;
      indices[iOffset++] = leftStartV + i2;
      indices[iOffset++] = leftStartV + i1;
    }
  }

  // Bounding box AABB
  const cornerPoints = [
    { x: stair.start.x - nx * halfW, y: stair.start.y - ny * halfW },
    { x: stair.start.x + nx * halfW, y: stair.start.y + ny * halfW },
    { x: stair.end.x + nx * halfW, y: stair.end.y + ny * halfW },
    { x: stair.end.x - nx * halfW, y: stair.end.y - ny * halfW },
  ];

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const cp of cornerPoints) {
    minX = Math.min(minX, cp.x);
    maxX = Math.max(maxX, cp.x);
    minY = Math.min(minY, cp.y);
    maxY = Math.max(maxY, cp.y);
  }

  const finalPositions =
    vOffset * 3 === positions.length ? positions : positions.subarray(0, vOffset * 3);
  const finalNormals = vOffset * 3 === normals.length ? normals : normals.subarray(0, vOffset * 3);
  const finalUvs = vOffset * 2 === uvs.length ? uvs : uvs.subarray(0, vOffset * 2);
  const finalIndices = iOffset === indices.length ? indices : indices.subarray(0, iOffset);

  return {
    positions: finalPositions,
    normals: finalNormals,
    uvs: finalUvs,
    indices: finalIndices,
    elementId: stair.id,
    role: 'full',
    boundingBox: {
      min: { x: minX, y: minY, z: z0 },
      max: { x: maxX, y: maxY, z: z1 },
    },
    userData: {
      elementId: stair.id,
      category: 'stair',
    },
  };
}
