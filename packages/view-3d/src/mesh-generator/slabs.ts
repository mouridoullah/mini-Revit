import {
  computeEffectiveSlabPolygon,
  triangulatePolygonWithHoles,
  vec2,
  type RawMeshData,
  type Vec2,
} from '@tabax/geometry';
import type { SlabGeometryParams, SlabTypeGeometryParams } from './types.js';
import {
  ArchitecturalMeshAccumulator,
  type Vec3D,
} from '../components/architectural-primitives.js';
import type {
  ComponentAssembly3D,
  ComponentAssemblyPart,
  ComponentMaterialRole,
  ComponentDetailLevel,
} from '../components/types.js';

/**
 * Génère le maillage 3D brut (RawMeshData) d'une dalle horizontale extrudée vers le bas
 * avec découpe effective des réservations/trémies (ADR-046 / Phase 6.1b).
 *
 * Z_sup = elevation + (slab.baseOffset ?? 0)
 * Z_inf = Z_sup - slabType.thickness
 */
export function createSlabMesh(
  slab: SlabGeometryParams,
  slabType: SlabTypeGeometryParams,
  elevation: number = 0,
): RawMeshData | null {
  if (!slab.boundary || slab.boundary.length < 3) return null;

  const boundary2D = slab.boundary.map((p) => vec2(p.x, p.y));
  const rawHoles = [...(slab.holes ?? []), ...(slab.openings ?? [])].map((h) =>
    h.map((p) => vec2(p.x, p.y)),
  );

  let effective;
  try {
    effective = computeEffectiveSlabPolygon({
      boundary: boundary2D,
      holes: rawHoles,
    });
  } catch {
    return null;
  }

  const thickness = Math.max(1, slabType.thickness);
  const zSup = elevation + (slab.baseOffset ?? 0);
  const zInf = zSup - thickness;

  // Triangulation des faces horizontales (avec trous)
  const { vertices, indices: topIndices } = triangulatePolygonWithHoles(
    effective.outer,
    effective.holes,
  );

  const numFaceVerts = vertices.length;
  const numFaceTris = topIndices.length / 3;

  // Calcul du nombre de segments pour les flancs verticaux
  let numWallSegments = effective.outer.length;
  for (const h of effective.holes) {
    numWallSegments += h.length;
  }
  const numWallQuads = numWallSegments;
  const numWallTris = numWallQuads * 2;
  const totalTris = numFaceTris * 2 + numWallTris;
  const totalVerts = numFaceVerts * 2 + numWallQuads * 4;

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const indices = new Uint32Array(totalTris * 3);

  let vOffset = 0;
  let iOffset = 0;

  // 1. Face Supérieure (+Z)
  const topStartV = vOffset;
  for (let i = 0; i < numFaceVerts; i++) {
    const v = vertices[i];
    if (!v) continue;
    const idx = (topStartV + i) * 3;
    positions[idx] = v.x;
    positions[idx + 1] = v.y;
    positions[idx + 2] = zSup;

    normals[idx] = 0;
    normals[idx + 1] = 0;
    normals[idx + 2] = 1;

    uvs[(topStartV + i) * 2] = v.x / 1000;
    uvs[(topStartV + i) * 2 + 1] = v.y / 1000;
  }
  vOffset += numFaceVerts;

  for (let i = 0; i < topIndices.length; i++) {
    const tIdx = topIndices[i];
    if (tIdx !== undefined) {
      indices[iOffset++] = topStartV + tIdx;
    }
  }

  // 2. Face Inférieure (-Z)
  const bottomStartV = vOffset;
  for (let i = 0; i < numFaceVerts; i++) {
    const v = vertices[i];
    if (!v) continue;
    const idx = (bottomStartV + i) * 3;
    positions[idx] = v.x;
    positions[idx + 1] = v.y;
    positions[idx + 2] = zInf;

    normals[idx] = 0;
    normals[idx + 1] = 0;
    normals[idx + 2] = -1;

    uvs[(bottomStartV + i) * 2] = v.x / 1000;
    uvs[(bottomStartV + i) * 2 + 1] = v.y / 1000;
  }
  vOffset += numFaceVerts;

  // Inversion de l'ordre d'enroulement pour orienter la normale vers le bas (-Z)
  for (let i = 0; i < topIndices.length; i += 3) {
    const i0 = topIndices[i];
    const i1 = topIndices[i + 1];
    const i2 = topIndices[i + 2];
    if (i0 !== undefined && i1 !== undefined && i2 !== undefined) {
      indices[iOffset++] = bottomStartV + i0;
      indices[iOffset++] = bottomStartV + i2;
      indices[iOffset++] = bottomStartV + i1;
    }
  }

  // Fonction helper pour construire les flancs verticaux d'un anneau
  const addFlanks = (ring: readonly Vec2[]) => {
    const n = ring.length;
    for (let i = 0; i < n; i++) {
      const pA = ring[i];
      const pB = ring[(i + 1) % n];
      if (!pA || !pB) continue;

      const dx = pB.x - pA.x;
      const dy = pB.y - pA.y;
      const len = Math.hypot(dx, dy);
      if (len < 1e-6) continue;

      const nx = dy / len;
      const ny = -dx / len;

      const baseV = vOffset;
      const pts = [
        { x: pA.x, y: pA.y, z: zInf, u: 0, v: 0 },
        { x: pB.x, y: pB.y, z: zInf, u: len / 1000, v: 0 },
        { x: pB.x, y: pB.y, z: zSup, u: len / 1000, v: thickness / 1000 },
        { x: pA.x, y: pA.y, z: zSup, u: 0, v: thickness / 1000 },
      ];

      for (let k = 0; k < 4; k++) {
        const pt = pts[k];
        if (!pt) continue;
        const idx = (baseV + k) * 3;
        positions[idx] = pt.x;
        positions[idx + 1] = pt.y;
        positions[idx + 2] = pt.z;

        normals[idx] = nx;
        normals[idx + 1] = ny;
        normals[idx + 2] = 0;

        uvs[(baseV + k) * 2] = pt.u;
        uvs[(baseV + k) * 2 + 1] = pt.v;
      }
      vOffset += 4;

      // Triangles quad : (V0, V1, V2) et (V0, V2, V3)
      indices[iOffset++] = baseV;
      indices[iOffset++] = baseV + 1;
      indices[iOffset++] = baseV + 2;

      indices[iOffset++] = baseV;
      indices[iOffset++] = baseV + 2;
      indices[iOffset++] = baseV + 3;
    }
  };

  addFlanks(effective.outer);
  for (const hole of effective.holes) {
    addFlanks(hole);
  }

  // Calcul AABB
  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  for (const p of effective.outer) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minY = Math.min(minY, p.y);
    maxY = Math.max(maxY, p.y);
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
    elementId: slab.id,
    role: 'full',
    boundingBox: {
      min: { x: minX, y: minY, z: zInf },
      max: { x: maxX, y: maxY, z: zSup },
    },
    userData: {
      elementId: slab.id,
      category: 'slab',
    },
  };
}

export interface SlabAssemblyOptions {
  readonly detailLevel?: ComponentDetailLevel;
  readonly structureMaterial?: ComponentMaterialRole;
  readonly finishMaterial?: ComponentMaterialRole;
  readonly finishThickness?: number;
}

/**
 * Génère l'assemblage 3D complet d'une dalle LOD 350 multi-couches :
 * - Corps porteur en béton armé (face inférieure sous-plafond et flancs périphériques / trémies)
 * - Revêtement de sol de surface supérieur noble (parquet chêne, carrelage ou chape lissée)
 */
export function createSlabAssembly(
  slab: SlabGeometryParams,
  slabType: SlabTypeGeometryParams,
  elevation: number = 0,
  options?: SlabAssemblyOptions,
): ComponentAssembly3D | null {
  const baseMesh = createSlabMesh(slab, slabType, elevation);
  if (!baseMesh) return null;

  const detailLevel = options?.detailLevel ?? 'lod350';
  const structureMat = options?.structureMaterial ?? 'concrete_structural';
  const finishMat = options?.finishMaterial ?? 'wood_oak';

  if (detailLevel !== 'lod350') {
    return {
      elementId: slab.id,
      category: 'slab',
      family: 'slab',
      subType: 'floor_slab',
      parts: [
        {
          rawData: baseMesh,
          materialRole: structureMat,
        },
      ],
    };
  }

  // En LOD 350 : séparation structure béton + revêtement noble supérieur
  const boundary2D = slab.boundary.map((p) => vec2(p.x, p.y));
  const rawHoles = [...(slab.holes ?? []), ...(slab.openings ?? [])].map((h) =>
    h.map((p) => vec2(p.x, p.y)),
  );

  let effective;
  try {
    effective = computeEffectiveSlabPolygon({
      boundary: boundary2D,
      holes: rawHoles,
    });
  } catch {
    effective = { outer: boundary2D, holes: rawHoles };
  }

  const zSup = elevation + (slab.baseOffset ?? 0);
  const zVec: Vec3D = { x: 0, y: 0, z: 1 };

  const { vertices, indices: topIndices } = triangulatePolygonWithHoles(
    effective.outer,
    effective.holes,
  );

  const finishAcc = new ArchitecturalMeshAccumulator();
  const zFinish = zSup + 1; // Légère surélévation pour éliminer tout z-fighting
  for (const v of vertices) {
    finishAcc.addVertex({ x: v.x, y: v.y, z: zFinish }, zVec, v.x / 1000, v.y / 1000);
  }
  for (let i = 0; i < topIndices.length; i += 3) {
    const i0 = topIndices[i];
    const i1 = topIndices[i + 1];
    const i2 = topIndices[i + 2];
    if (i0 !== undefined && i1 !== undefined && i2 !== undefined) {
      finishAcc.addTriangle(i0, i1, i2);
    }
  }

  const parts: ComponentAssemblyPart[] = [
    {
      rawData: baseMesh,
      materialRole: structureMat,
    },
    {
      rawData: finishAcc.toRawMeshData(`${slab.id}_finish`),
      materialRole: finishMat,
    },
  ];

  return {
    elementId: slab.id,
    category: 'slab',
    family: 'slab',
    subType: 'multi_layer_slab',
    parts,
  };
}

