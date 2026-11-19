import {
  vec2,
  triangulatePolygonWithHoles,
  type RawMeshData,
  type Vec2,
} from '@mini-bim/geometry';
import type {
  RoofGeometryParams,
  RoofTypeGeometryParams,
  GableRoofTypeGeometryParams,
} from './types.js';

/**
 * Génère le maillage 3D brut (RawMeshData) d'une toiture (plate ou 2 pans).
 * Garantit un solide fermé étanche (caractéristique d'Euler V - E + F = 2) et des normales
 * unitaires orientées vers l'extérieur.
 */
export function createRoofMesh(
  roof: RoofGeometryParams,
  roofType: RoofTypeGeometryParams,
  effectivePolygon?: { outer: readonly Vec2[]; holes: readonly (readonly Vec2[])[] },
): RawMeshData | null {
  if (!roof.footprint || roof.footprint.length < 3) return null;

  const elevation = roof.elevation ?? 0;
  const baseOffset = roof.baseOffset ?? 0;
  const zBase = elevation + baseOffset;
  const thickness = Math.max(10, roofType.thickness);

  // ---------------------------------------------------------------------------
  // 1. Toiture plate (Flat) : Prisme horizontal fermé (comme une dalle)
  // ---------------------------------------------------------------------------
  if (roofType.family === 'flat') {
    const boundary2D = roof.footprint.map((p) => vec2(p.x, p.y));
    const holes2D: Vec2[][] = [];

    if (effectivePolygon?.holes && effectivePolygon.holes.length > 0) {
      holes2D.push(...effectivePolygon.holes.map((h) => h.map((p) => vec2(p.x, p.y))));
    } else if (roof.openings && roof.openings.length > 0) {
      for (const op of roof.openings) {
        holes2D.push([
          vec2(op.offsetU, op.offsetV),
          vec2(op.offsetU + op.width, op.offsetV),
          vec2(op.offsetU + op.width, op.offsetV + op.height),
          vec2(op.offsetU, op.offsetV + op.height),
        ]);
      }
    }

    const zSup = zBase + thickness;
    const zInf = zBase;

    const outerLoop =
      effectivePolygon?.outer && effectivePolygon.outer.length >= 3
        ? effectivePolygon.outer.map((p) => vec2(p.x, p.y))
        : boundary2D;

    const { vertices, indices: topIndices } = triangulatePolygonWithHoles(
      outerLoop,
      holes2D,
    );

    const numFaceVerts = vertices.length;
    const numFaceTris = topIndices.length / 3;

    let numWallSegments = outerLoop.length;
    for (const h of holes2D) {
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

    // Face supérieure (+Z)
    const topStartV = vOffset;
    for (const v of vertices) {
      positions[vOffset * 3] = v.x;
      positions[vOffset * 3 + 1] = v.y;
      positions[vOffset * 3 + 2] = zSup;

      normals[vOffset * 3] = 0;
      normals[vOffset * 3 + 1] = 0;
      normals[vOffset * 3 + 2] = 1;

      uvs[vOffset * 2] = v.x / 1000;
      uvs[vOffset * 2 + 1] = v.y / 1000;
      vOffset++;
    }
    for (let i = 0; i < topIndices.length; i++) {
      indices[iOffset++] = topStartV + (topIndices[i] ?? 0);
    }

    // Face inférieure (-Z)
    const botStartV = vOffset;
    for (const v of vertices) {
      positions[vOffset * 3] = v.x;
      positions[vOffset * 3 + 1] = v.y;
      positions[vOffset * 3 + 2] = zInf;

      normals[vOffset * 3] = 0;
      normals[vOffset * 3 + 1] = 0;
      normals[vOffset * 3 + 2] = -1;

      uvs[vOffset * 2] = v.x / 1000;
      uvs[vOffset * 2 + 1] = v.y / 1000;
      vOffset++;
    }
    for (let i = 0; i < topIndices.length; i += 3) {
      indices[iOffset++] = botStartV + (topIndices[i] ?? 0);
      indices[iOffset++] = botStartV + (topIndices[i + 2] ?? 0);
      indices[iOffset++] = botStartV + (topIndices[i + 1] ?? 0);
    }

    // Flancs verticaux (périphérie extérieure + trous)
    const allLoops = [outerLoop, ...holes2D];
    for (let lIdx = 0; lIdx < allLoops.length; lIdx++) {
      const loop = allLoops[lIdx];
      if (!loop) continue;
      const isHole = lIdx > 0;
      const count = loop.length;
      for (let j = 0; j < count; j++) {
        const p1 = loop[j];
        const p2 = loop[(j + 1) % count];
        if (!p1 || !p2) continue;

        const edx = p2.x - p1.x;
        const edy = p2.y - p1.y;
        const eLen = Math.hypot(edx, edy);
        let nx = 0;
        let ny = 0;
        if (eLen > 1e-5) {
          nx = edy / eLen;
          ny = -edx / eLen;
          if (isHole) {
            nx = -nx;
            ny = -ny;
          }
        }

        const v0 = vOffset;
        positions[vOffset * 3] = p1.x;
        positions[vOffset * 3 + 1] = p1.y;
        positions[vOffset * 3 + 2] = zInf;
        normals[vOffset * 3] = nx;
        normals[vOffset * 3 + 1] = ny;
        normals[vOffset * 3 + 2] = 0;
        uvs[vOffset * 2] = 0;
        uvs[vOffset * 2 + 1] = 0;
        vOffset++;

        const v1 = vOffset;
        positions[vOffset * 3] = p2.x;
        positions[vOffset * 3 + 1] = p2.y;
        positions[vOffset * 3 + 2] = zInf;
        normals[vOffset * 3] = nx;
        normals[vOffset * 3 + 1] = ny;
        normals[vOffset * 3 + 2] = 0;
        uvs[vOffset * 2] = eLen / 1000;
        uvs[vOffset * 2 + 1] = 0;
        vOffset++;

        const v2 = vOffset;
        positions[vOffset * 3] = p2.x;
        positions[vOffset * 3 + 1] = p2.y;
        positions[vOffset * 3 + 2] = zSup;
        normals[vOffset * 3] = nx;
        normals[vOffset * 3 + 1] = ny;
        normals[vOffset * 3 + 2] = 0;
        uvs[vOffset * 2] = eLen / 1000;
        uvs[vOffset * 2 + 1] = thickness / 1000;
        vOffset++;

        const v3 = vOffset;
        positions[vOffset * 3] = p1.x;
        positions[vOffset * 3 + 1] = p1.y;
        positions[vOffset * 3 + 2] = zSup;
        normals[vOffset * 3] = nx;
        normals[vOffset * 3 + 1] = ny;
        normals[vOffset * 3 + 2] = 0;
        uvs[vOffset * 2] = 0;
        uvs[vOffset * 2 + 1] = thickness / 1000;
        vOffset++;

        indices[iOffset++] = v0;
        indices[iOffset++] = v1;
        indices[iOffset++] = v2;
        indices[iOffset++] = v0;
        indices[iOffset++] = v2;
        indices[iOffset++] = v3;
      }
    }

    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const p of outerLoop) {
      if (p.x < minX) minX = p.x;
      if (p.x > maxX) maxX = p.x;
      if (p.y < minY) minY = p.y;
      if (p.y > maxY) maxY = p.y;
    }

    return {
      positions,
      normals,
      uvs,
      indices,
      elementId: roof.id,
      role: 'full',
      boundingBox: {
        min: { x: minX, y: minY, z: zInf },
        max: { x: maxX, y: maxY, z: zSup },
      },
      userData: {
        elementId: roof.id,
        category: 'roof',
      },
    };
  }

  // ---------------------------------------------------------------------------
  // 2. Toiture à deux pans (Gable) : Solide fermé étanche (Euler V - E + F = 2)
  // ---------------------------------------------------------------------------
  const gableType = roofType as GableRoofTypeGeometryParams;
  const slopeDeg = roof.slopeOverrideDeg ?? gableType.slopeDeg ?? 35;
  const slopeRad = (slopeDeg * Math.PI) / 180;
  const tanSlope = Math.tan(slopeRad);
  const cosSlope = Math.cos(slopeRad);
  const deltaZ = thickness / cosSlope;

  const ridgeAxis = roof.ridgeAxis ?? {
    start: { x: 0, y: 0 },
    end: { x: 1000, y: 0 },
  };

  const ridgeDx = ridgeAxis.end.x - ridgeAxis.start.x;
  const ridgeDy = ridgeAxis.end.y - ridgeAxis.start.y;
  const ridgeLen = Math.hypot(ridgeDx, ridgeDy);
  const uRidge = ridgeLen > 1e-5 ? vec2(ridgeDx / ridgeLen, ridgeDy / ridgeLen) : vec2(1, 0);
  const nRidge = vec2(-uRidge.y, uRidge.x);

  let sMin = Infinity;
  let sMax = -Infinity;
  let dMin = Infinity;
  let dMax = -Infinity;

  for (const v of roof.footprint) {
    const s = (v.x - ridgeAxis.start.x) * uRidge.x + (v.y - ridgeAxis.start.y) * uRidge.y;
    const d = (v.x - ridgeAxis.start.x) * nRidge.x + (v.y - ridgeAxis.start.y) * nRidge.y;
    if (s < sMin) sMin = s;
    if (s > sMax) sMax = s;
    if (d < dMin) dMin = d;
    if (d > dMax) dMax = d;
  }

  const overhang = roof.overhangOverride ?? gableType.overhangMm ?? 0;
  if (overhang > 0) {
    sMin -= overhang;
    sMax += overhang;
    dMin -= overhang;
    dMax += overhang;
  }

  const w1 = Math.max(10, Math.abs(dMin));
  const w2 = Math.max(10, Math.abs(dMax));
  const maxHalfSpan = Math.max(w1, w2);
  const totalRise = maxHalfSpan * tanSlope;
  const zRidge = zBase + totalRise;
  const zEave = zBase;

  const c0 = vec2(ridgeAxis.start.x + sMin * uRidge.x, ridgeAxis.start.y + sMin * uRidge.y);
  const c1 = vec2(ridgeAxis.start.x + sMax * uRidge.x, ridgeAxis.start.y + sMax * uRidge.y);

  // 6 sommets à c0 (sMin)
  const v0 = { x: c0.x - w1 * nRidge.x, y: c0.y - w1 * nRidge.y, z: zEave - deltaZ };
  const v1 = { x: c0.x - w1 * nRidge.x, y: c0.y - w1 * nRidge.y, z: zEave };
  const v2 = { x: c0.x, y: c0.y, z: zRidge };
  const v3 = { x: c0.x + w2 * nRidge.x, y: c0.y + w2 * nRidge.y, z: zEave };
  const v4 = { x: c0.x + w2 * nRidge.x, y: c0.y + w2 * nRidge.y, z: zEave - deltaZ };
  const v5 = { x: c0.x, y: c0.y, z: zRidge - deltaZ };

  // 6 sommets à c1 (sMax)
  const w0 = { x: c1.x - w1 * nRidge.x, y: c1.y - w1 * nRidge.y, z: zEave - deltaZ };
  const w1Pt = { x: c1.x - w1 * nRidge.x, y: c1.y - w1 * nRidge.y, z: zEave };
  const w2Pt = { x: c1.x, y: c1.y, z: zRidge };
  const w3 = { x: c1.x + w2 * nRidge.x, y: c1.y + w2 * nRidge.y, z: zEave };
  const w4 = { x: c1.x + w2 * nRidge.x, y: c1.y + w2 * nRidge.y, z: zEave - deltaZ };
  const w5 = { x: c1.x, y: c1.y, z: zRidge - deltaZ };

  // Normales unitaires pour chaque face
  const nEave1 = { x: -nRidge.x, y: -nRidge.y, z: 0 };
  const nEave2 = { x: nRidge.x, y: nRidge.y, z: 0 };
  const nGable0 = { x: -uRidge.x, y: -uRidge.y, z: 0 };
  const nGable1 = { x: uRidge.x, y: uRidge.y, z: 0 };

  const normHypot = Math.hypot(tanSlope, 1);
  const nExtrados1 = {
    x: (-tanSlope * nRidge.x) / normHypot,
    y: (-tanSlope * nRidge.y) / normHypot,
    z: 1 / normHypot,
  };
  const nExtrados2 = {
    x: (tanSlope * nRidge.x) / normHypot,
    y: (tanSlope * nRidge.y) / normHypot,
    z: 1 / normHypot,
  };
  const nIntrados2 = {
    x: (-tanSlope * nRidge.x) / normHypot,
    y: (-tanSlope * nRidge.y) / normHypot,
    z: -1 / normHypot,
  };
  const nIntrados1 = {
    x: (tanSlope * nRidge.x) / normHypot,
    y: (tanSlope * nRidge.y) / normHypot,
    z: -1 / normHypot,
  };

  const posList: number[] = [];
  const normList: number[] = [];
  const uvList: number[] = [];
  const indList: number[] = [];

  const addQuad = (
    p0: { x: number; y: number; z: number },
    p1: { x: number; y: number; z: number },
    p2: { x: number; y: number; z: number },
    p3: { x: number; y: number; z: number },
    norm: { x: number; y: number; z: number },
  ) => {
    const v0Start = posList.length / 3;
    posList.push(p0.x, p0.y, p0.z, p1.x, p1.y, p1.z, p2.x, p2.y, p2.z, p3.x, p3.y, p3.z);
    normList.push(norm.x, norm.y, norm.z, norm.x, norm.y, norm.z, norm.x, norm.y, norm.z, norm.x, norm.y, norm.z);
    uvList.push(0, 0, 1, 0, 1, 1, 0, 1);
    indList.push(v0Start, v0Start + 1, v0Start + 2, v0Start, v0Start + 2, v0Start + 3);
  };

  const hasOpenings = roof.openings && roof.openings.length > 0;
  if (!hasOpenings) {
    addQuad(v0, w0, w1Pt, v1, nEave1);
    addQuad(v1, w1Pt, w2Pt, v2, nExtrados1);
    addQuad(v2, w2Pt, w3, v3, nExtrados2);
    addQuad(v3, w3, w4, v4, nEave2);
    addQuad(v4, w4, w5, v5, nIntrados2);
    addQuad(v5, w5, w0, v0, nIntrados1);
  } else {
    addQuad(v0, w0, w1Pt, v1, nEave1);
    addQuad(v2, w2Pt, w3, v3, nExtrados2);
    addQuad(v3, w3, w4, v4, nEave2);
    addQuad(v4, w4, w5, v5, nIntrados2);

    const op = roof.openings?.[0];
    if (op) {
      const opS0 = sMin + op.offsetU;
      const opS1 = opS0 + op.width;
      const opD0 = -w1 + op.offsetV;
      const opD1 = opD0 + op.height;

      const pt3D = (s: number, d: number, isIntrados: boolean) => {
        const c = vec2(ridgeAxis.start.x + s * uRidge.x, ridgeAxis.start.y + s * uRidge.y);
        const frac = Math.abs(d) / (w1 || 1);
        const z = zRidge - frac * totalRise - (isIntrados ? deltaZ : 0);
        return {
          x: c.x + d * nRidge.x,
          y: c.y + d * nRidge.y,
          z,
        };
      };

      // 4 quads autour du trou sur extrados
      addQuad(v1, pt3D(opS0, -w1, false), pt3D(opS0, 0, false), v2, nExtrados1);
      addQuad(pt3D(opS1, -w1, false), w1Pt, w2Pt, pt3D(opS1, 0, false), nExtrados1);
      addQuad(pt3D(opS0, -w1, false), pt3D(opS1, -w1, false), pt3D(opS1, opD0, false), pt3D(opS0, opD0, false), nExtrados1);
      addQuad(pt3D(opS0, opD1, false), pt3D(opS1, opD1, false), pt3D(opS1, 0, false), pt3D(opS0, 0, false), nExtrados1);

      // 4 quads autour du trou sur intrados
      addQuad(pt3D(opS0, -w1, true), v0, v5, pt3D(opS0, 0, true), nIntrados1);
      addQuad(w0, pt3D(opS1, -w1, true), pt3D(opS1, 0, true), w5, nIntrados1);
      addQuad(pt3D(opS1, -w1, true), pt3D(opS0, -w1, true), pt3D(opS0, opD0, true), pt3D(opS1, opD0, true), nIntrados1);
      addQuad(pt3D(opS1, opD1, true), pt3D(opS0, opD1, true), pt3D(opS0, 0, true), pt3D(opS1, 0, true), nIntrados1);

      // 4 flancs intérieurs de l'ouverture
      addQuad(pt3D(opS0, opD1, false), pt3D(opS0, opD0, false), pt3D(opS0, opD0, true), pt3D(opS0, opD1, true), { x: uRidge.x, y: uRidge.y, z: 0 });
      addQuad(pt3D(opS1, opD0, false), pt3D(opS1, opD1, false), pt3D(opS1, opD1, true), pt3D(opS1, opD0, true), { x: -uRidge.x, y: -uRidge.y, z: 0 });
      addQuad(pt3D(opS0, opD0, false), pt3D(opS1, opD0, false), pt3D(opS1, opD0, true), pt3D(opS0, opD0, true), { x: nRidge.x, y: nRidge.y, z: 0 });
      addQuad(pt3D(opS1, opD1, false), pt3D(opS0, opD1, false), pt3D(opS0, opD1, true), pt3D(opS1, opD1, true), { x: -nRidge.x, y: -nRidge.y, z: 0 });
    }
  }

  // Pignon 0 (sMin) : 2 quads CCW
  addQuad(v0, v5, v2, v1, nGable0);
  addQuad(v5, v4, v3, v2, nGable0);

  // Pignon 1 (sMax) : 2 quads CCW
  addQuad(w0, w5, w2Pt, w1Pt, nGable1);
  addQuad(w5, w4, w3, w2Pt, nGable1);

  const positions = new Float32Array(posList);
  const normals = new Float32Array(normList);
  const uvs = new Float32Array(uvList);
  const indices = new Uint32Array(indList);

  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i] ?? 0;
    const y = positions[i + 1] ?? 0;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  return {
    positions,
    normals,
    uvs,
    indices,
    elementId: roof.id,
    role: 'full',
    boundingBox: {
      min: { x: minX, y: minY, z: zEave - deltaZ },
      max: { x: maxX, y: maxY, z: zRidge },
    },
    userData: {
      elementId: roof.id,
      category: 'roof',
    },
  };
}
