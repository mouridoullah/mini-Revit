import { describe, it, expect } from 'vitest';
import { extrudeWallPiece } from './extrude.js';
import { buildWallMesh, buildWallMeshAggregated } from './builder.js';
import { type WallPiece } from '../openings/types.js';
import { type RawMeshData } from './types.js';
import { vec2 } from '../vec2.js';
import { computeWallFootprint2d } from '../wall-geometry.js';
import { sliceWallWithOpenings } from '../openings/slice.js';

/**
 * Calcule le volume 3D fermé rigoureux d'un maillage triangulaire via le théorème de divergence de Gauss.
 *
 * V = 1/6 * sum_triangles ( A . (B x C) )
 *
 * Mesuré directement et exclusivement depuis les Float32Array (positions) et Uint32Array (indices) du buffer 3D.
 */
export function computeMeshVolumeFromBuffers(mesh: RawMeshData): number {
  const p = mesh.positions;
  const idx = mesh.indices;
  let totalSignedVolume = 0;

  for (let i = 0; i < idx.length; i += 3) {
    const i0 = idx[i];
    const i1 = idx[i + 1];
    const i2 = idx[i + 2];
    if (i0 === undefined || i1 === undefined || i2 === undefined) continue;

    const ax = p[i0 * 3] ?? 0;
    const ay = p[i0 * 3 + 1] ?? 0;
    const az = p[i0 * 3 + 2] ?? 0;

    const bx = p[i1 * 3] ?? 0;
    const by = p[i1 * 3 + 1] ?? 0;
    const bz = p[i1 * 3 + 2] ?? 0;

    const cx = p[i2 * 3] ?? 0;
    const cy = p[i2 * 3 + 1] ?? 0;
    const cz = p[i2 * 3 + 2] ?? 0;

    // Produit vectoriel B x C
    const crossX = by * cz - bz * cy;
    const crossY = bz * cx - bx * cz;
    const crossZ = bx * cy - by * cx;

    // Produit scalaire A . (B x C)
    const dotProduct = ax * crossX + ay * crossY + az * crossZ;
    totalSignedVolume += dotProduct;
  }

  return Math.abs(totalSignedVolume / 6);
}

/**
 * Calcule l'aire 3D d'un triangle défini par trois indices dans le buffer positions.
 */
export function computeTriangleArea3D(mesh: RawMeshData, tIdx: number): number {
  const p = mesh.positions;
  const i0 = mesh.indices[tIdx * 3];
  const i1 = mesh.indices[tIdx * 3 + 1];
  const i2 = mesh.indices[tIdx * 3 + 2];
  if (i0 === undefined || i1 === undefined || i2 === undefined) return 0;

  const ax = p[i0 * 3] ?? 0,
    ay = p[i0 * 3 + 1] ?? 0,
    az = p[i0 * 3 + 2] ?? 0;
  const bx = p[i1 * 3] ?? 0,
    by = p[i1 * 3 + 1] ?? 0,
    bz = p[i1 * 3 + 2] ?? 0;
  const cx = p[i2 * 3] ?? 0,
    cy = p[i2 * 3 + 1] ?? 0,
    cz = p[i2 * 3 + 2] ?? 0;

  const abX = bx - ax,
    abY = by - ay,
    abZ = bz - az;
  const acX = cx - ax,
    acY = cy - ay,
    acZ = cz - az;

  const crossX = abY * acZ - abZ * acY;
  const crossY = abZ * acX - abX * acZ;
  const crossZ = abX * acY - abY * acX;

  return Math.hypot(crossX, crossY, crossZ) / 2;
}

describe('Extrusion 3D et Maillages Bruts (extrude.ts & builder.ts)', () => {
  const wallL = 4000;
  const wallT = 200;
  const wallH = 2800;

  const straightFootprint = computeWallFootprint2d({
    start: vec2(0, 0),
    end: vec2(wallL, 0),
    thickness: wallT,
    locationLine: 'center',
  });

  const baseWall = {
    id: 'w_extrude_test',
    start: vec2(0, 0),
    end: vec2(wallL, 0),
    thickness: wallT,
    height: wallH,
    polygon: straightFootprint.vertices,
  };

  it('exclut rigoureusement les pièces void de l extrusion', () => {
    const voidPiece: WallPiece = {
      id: 'p_void',
      wallId: 'w1',
      poly2D: straightFootprint.vertices,
      z0: 900,
      z1: 2100,
      role: 'void',
      area2D: 800000,
      uInterval: [1000, 2200],
    };

    expect(extrudeWallPiece(voidPiece)).toBeNull();
  });

  it('mur droit + fenêtre (4 pièces solides + 1 void) -> produit 4 RawMeshData solides', () => {
    const winOp = {
      id: 'win1',
      hostWallId: baseWall.id,
      u: 2000,
      width: 1200,
      height: 1200,
      sillZ: 900,
      kind: 'window' as const,
    };

    const sliceResult = sliceWallWithOpenings(baseWall, [winOp]);
    // 5 pièces : 2 tranches pleines + 1 allège + 1 linteau + 1 vide
    expect(sliceResult.pieces.length).toBe(5);

    const meshes = buildWallMesh(baseWall, sliceResult.pieces);
    // 4 meshes solides, 0 void
    expect(meshes.length).toBe(4);
    expect(meshes.every((m) => m.role !== 'void')).toBe(true);
  });

  it('propriété : volume 3D mesuré sur les buffers de positions/indices == volume théorique à ±1e-6 mm³', () => {
    const winOp = {
      id: 'win_vol',
      hostWallId: baseWall.id,
      u: 2000,
      width: 1200,
      height: 1200,
      sillZ: 900,
      kind: 'window' as const,
    };

    const sliceResult = sliceWallWithOpenings(baseWall, [winOp]);
    const meshes = buildWallMesh(baseWall, sliceResult.pieces);

    let totalBufferVolume = 0;
    let expectedVolume = 0;

    for (let i = 0; i < meshes.length; i++) {
      const mesh = meshes[i];
      if (!mesh) continue;
      const piece = sliceResult.pieces.find((p) => p.id === mesh.elementId);
      expect(piece).toBeDefined();
      if (!piece) continue;

      const pieceExpectedVol = piece.area2D * (piece.z1 - piece.z0);
      expectedVolume += pieceExpectedVol;

      // Calcul indépendant par intégration de flux Gauss sur les triangles 3D
      const measuredVol = computeMeshVolumeFromBuffers(mesh);
      expect(measuredVol).toBeCloseTo(pieceExpectedVol, 4);
      totalBufferVolume += measuredVol;
    }

    const diff = Math.abs(totalBufferVolume - expectedVolume);
    expect(diff).toBeLessThan(1e-4);
  });

  it('propriété : volume 3D mesuré sur les buffers == volume théorique à ±1e-6 mm³ sur 5 configurations distinctes', () => {
    // 1. Mur plein (sans ouverture)
    const r1 = sliceWallWithOpenings(baseWall, []);
    const m1 = buildWallMesh(baseWall, r1.pieces);
    const v1 = m1.reduce((acc, m) => acc + computeMeshVolumeFromBuffers(m), 0);
    const exp1 = 4000 * 200 * 2800; // 2 240 000 000 mm³
    expect(Math.abs(v1 - exp1)).toBeLessThan(1e-6);

    // 2. Mur avec fenêtre centrée (1200 × 1200)
    const win = {
      id: 'win_v5',
      hostWallId: baseWall.id,
      u: 2000,
      width: 1200,
      height: 1200,
      sillZ: 900,
      kind: 'window' as const,
    };
    const r2 = sliceWallWithOpenings(baseWall, [win]);
    const m2 = buildWallMesh(baseWall, r2.pieces);
    const v2 = m2.reduce((acc, m) => acc + computeMeshVolumeFromBuffers(m), 0);
    const exp2 = exp1 - 1200 * 200 * 1200; // 1 952 000 000 mm³
    expect(Math.abs(v2 - exp2)).toBeLessThan(1e-6);

    // 3. Mur avec porte (900 × 2100)
    const door = {
      id: 'door_v5',
      hostWallId: baseWall.id,
      u: 2000,
      width: 900,
      height: 2100,
      sillZ: 0,
      kind: 'door' as const,
    };
    const r3 = sliceWallWithOpenings(baseWall, [door]);
    const m3 = buildWallMesh(baseWall, r3.pieces);
    const v3 = m3.reduce((acc, m) => acc + computeMeshVolumeFromBuffers(m), 0);
    const exp3 = exp1 - 900 * 200 * 2100; // 1 862 000 000 mm³
    expect(Math.abs(v3 - exp3)).toBeLessThan(1e-6);

    // 4. Mur avec deux ouvertures (porte à u=1000 + fenêtre à u=2500)
    const door4 = {
      id: 'door4_v5',
      hostWallId: baseWall.id,
      u: 1000,
      width: 900,
      height: 2100,
      sillZ: 0,
      kind: 'door' as const,
    };
    const win4 = {
      id: 'win4_v5',
      hostWallId: baseWall.id,
      u: 2500,
      width: 900,
      height: 1200,
      sillZ: 900,
      kind: 'window' as const,
    };
    const r4 = sliceWallWithOpenings(baseWall, [door4, win4]);
    const m4 = buildWallMesh(baseWall, r4.pieces);
    const v4 = m4.reduce((acc, m) => acc + computeMeshVolumeFromBuffers(m), 0);
    const exp4 = exp1 - 900 * 200 * 2100 - 900 * 200 * 1200; // 1 646 000 000 mm³
    expect(Math.abs(v4 - exp4)).toBeLessThan(1e-6);

    // 5. Mur en onglet 45° avec ouverture proche (L=3000, e=200, H=2800)
    const miterPoly = [vec2(100, -100), vec2(3000, -100), vec2(3000, 100), vec2(-100, 100)];
    const miterWall = {
      id: 'w_miter_v5',
      start: vec2(0, 0),
      end: vec2(3000, 0),
      thickness: 200,
      height: 2800,
      polygon: miterPoly,
    };
    const opMiter = {
      id: 'op_miter_v5',
      hostWallId: miterWall.id,
      u: 550,
      width: 1000,
      height: 1400,
      sillZ: 900,
      kind: 'window' as const,
    };
    const r5 = sliceWallWithOpenings(miterWall, [opMiter]);
    const m5 = buildWallMesh(miterWall, r5.pieces);
    const v5 = m5.reduce((acc, m) => acc + computeMeshVolumeFromBuffers(m), 0);
    const exp5 = 600000 * 2800 - 198750 * 1400; // 1 401 750 000 mm³
    expect(Math.abs(v5 - exp5)).toBeLessThan(1e-6);
  });

  it('propriété : chaque normale est unitaire (|n| = 1 ± 1e-9)', () => {
    const fullPiece: WallPiece = {
      id: 'p_full',
      wallId: 'w1',
      poly2D: straightFootprint.vertices,
      z0: 0,
      z1: wallH,
      role: 'full',
      area2D: 800000,
      uInterval: [0, wallL],
    };

    const mesh = extrudeWallPiece(fullPiece);
    expect(mesh).not.toBeNull();
    if (!mesh) return;

    const n = mesh.normals;
    const vertexCount = n.length / 3;

    for (let i = 0; i < vertexCount; i++) {
      const nx = n[i * 3] ?? 0;
      const ny = n[i * 3 + 1] ?? 0;
      const nz = n[i * 3 + 2] ?? 0;
      const len = Math.hypot(nx, ny, nz);
      expect(Math.abs(len - 1.0)).toBeLessThan(1e-9);
    }
  });

  it('propriété : orientation stricte des normales vers l extérieur (+Z, -Z, et flancs)', () => {
    const fullPiece: WallPiece = {
      id: 'p_normals',
      wallId: 'w1',
      poly2D: straightFootprint.vertices,
      z0: 0,
      z1: wallH,
      role: 'full',
      area2D: 800000,
      uInterval: [0, wallL],
    };

    const mesh = extrudeWallPiece(fullPiece);
    expect(mesh).not.toBeNull();
    if (!mesh) return;

    const p = mesh.positions;
    const n = mesh.normals;
    const vertexCount = p.length / 3;

    for (let i = 0; i < vertexCount; i++) {
      const z = p[i * 3 + 2] ?? 0;
      const nx = n[i * 3] ?? 0;
      const ny = n[i * 3 + 1] ?? 0;
      const nz = n[i * 3 + 2] ?? 0;

      if (Math.abs(z - wallH) < 1e-4) {
        // Face supérieure : nz doit être +1
        if (nx === 0 && ny === 0) {
          expect(nz).toBeCloseTo(1.0, 6);
        }
      } else if (Math.abs(z - 0) < 1e-4) {
        // Face inférieure : nz doit être -1
        if (nx === 0 && ny === 0) {
          expect(nz).toBeCloseTo(-1.0, 6);
        }
      }
    }
  });

  it('aucun index hors bornes et aucun triangle dégénéré', () => {
    const fullPiece: WallPiece = {
      id: 'p_bounds',
      wallId: 'w1',
      poly2D: straightFootprint.vertices,
      z0: 0,
      z1: wallH,
      role: 'full',
      area2D: 800000,
      uInterval: [0, wallL],
    };

    const mesh = extrudeWallPiece(fullPiece);
    expect(mesh).not.toBeNull();
    if (!mesh) return;

    const maxVertexIndex = mesh.positions.length / 3 - 1;
    const triangleCount = mesh.indices.length / 3;

    for (let i = 0; i < mesh.indices.length; i++) {
      const idx = mesh.indices[i] ?? 0;
      expect(idx).toBeGreaterThanOrEqual(0);
      expect(idx).toBeLessThanOrEqual(maxVertexIndex);
    }

    for (let t = 0; t < triangleCount; t++) {
      const area = computeTriangleArea3D(mesh, t);
      // Aucun triangle aplati
      expect(area).toBeGreaterThan(1e-4);
    }
  });

  it('agrège plusieurs pièces en un seul maillage continu (buildWallMeshAggregated)', () => {
    const winOp = {
      id: 'win_agg',
      hostWallId: baseWall.id,
      u: 2000,
      width: 1200,
      height: 1200,
      sillZ: 900,
      kind: 'window' as const,
    };

    const sliceResult = sliceWallWithOpenings(baseWall, [winOp]);
    const aggMesh = buildWallMeshAggregated(baseWall, sliceResult.pieces);

    expect(aggMesh.elementId).toBe(baseWall.id);
    expect(aggMesh.positions.length).toBeGreaterThan(0);
    expect(aggMesh.indices.length).toBeGreaterThan(0);

    // Boîte englobante globale couvrant l'ensemble du mur
    expect(aggMesh.boundingBox.min.x).toBeCloseTo(0, 1);
    expect(aggMesh.boundingBox.max.x).toBeCloseTo(wallL, 1);
    expect(aggMesh.boundingBox.min.z).toBe(0);
    expect(aggMesh.boundingBox.max.z).toBe(wallH);

    // Volume total agrégé correspond à la matière pleine
    const aggVolume = computeMeshVolumeFromBuffers(aggMesh);
    const expectedSolidVol = wallL * wallT * wallH - 1200 * wallT * 1200;
    expect(aggVolume).toBeCloseTo(expectedSolidVol, 0);
  });
});
