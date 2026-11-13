import { describe, it, expect } from 'vitest';
import { extrudeWallPiece } from './extrude.js';
import { buildWallMesh } from './builder.js';
import { type RawMeshData } from './types.js';
import { type WallPiece } from '../openings/types.js';
import { vec2 } from '../vec2.js';
import { computeWallFootprint2d } from '../wall-geometry.js';
import { sliceWallWithOpenings } from '../openings/slice.js';

interface TopologyReport {
  readonly uniqueVertexCount: number;
  readonly uniqueEdgeCount: number;
  readonly triangleCount: number;
  readonly eulerCharacteristic: number;
  readonly boundaryEdgeCount: number;
  readonly nonManifoldEdgeCount: number;
  readonly isWatertight: boolean;
  readonly isManifold: boolean;
}

/**
 * Analyse la topologie 3D d'un maillage brut en regroupant les sommets géométriquement confondus.
 * Vérifie rigoureusement l'étanchéité 2-manifold (aucune arête frontière, aucune arête multiple,
 * cohérence d'orientation de demi-arêtes, caractéristique d'Euler V - E + F = 2).
 */
export function analyzeMeshTopology(mesh: RawMeshData): TopologyReport {
  const p = mesh.positions;
  const idx = mesh.indices;
  const vertexCount = p.length / 3;
  const triangleCount = idx.length / 3;

  // 1. Regroupement spatial des sommets à EPSILON près (tolérance 0.001 mm = 1 µm)
  const keyToUniqueId = new Map<string, number>();
  const vertexToUnique = new Int32Array(vertexCount);
  let uniqueVertexCount = 0;

  for (let i = 0; i < vertexCount; i++) {
    const x = Math.round((p[i * 3] ?? 0) * 1000);
    const y = Math.round((p[i * 3 + 1] ?? 0) * 1000);
    const z = Math.round((p[i * 3 + 2] ?? 0) * 1000);
    const key = `${x},${y},${z}`;

    let uId = keyToUniqueId.get(key);
    if (uId === undefined) {
      uId = uniqueVertexCount++;
      keyToUniqueId.set(key, uId);
    }
    vertexToUnique[i] = uId;
  }

  // 2. Comptage des arêtes non-orientées et demi-arêtes orientées
  const edgeCountMap = new Map<string, number>();
  const halfEdgeSet = new Set<string>();

  for (let t = 0; t < triangleCount; t++) {
    const i0 = idx[t * 3] ?? 0;
    const i1 = idx[t * 3 + 1] ?? 0;
    const i2 = idx[t * 3 + 2] ?? 0;

    const u0 = vertexToUnique[i0] ?? 0;
    const u1 = vertexToUnique[i1] ?? 0;
    const u2 = vertexToUnique[i2] ?? 0;

    const triangleEdges = [
      [u0, u1],
      [u1, u2],
      [u2, u0],
    ];

    for (let e = 0; e < 3; e++) {
      const edge = triangleEdges[e];
      if (!edge) continue;
      const [a, b] = edge;
      if (a === undefined || b === undefined) continue;

      // Arête non-orientée
      const minU = Math.min(a, b);
      const maxU = Math.max(a, b);
      const edgeKey = `${minU}_${maxU}`;
      edgeCountMap.set(edgeKey, (edgeCountMap.get(edgeKey) ?? 0) + 1);

      // Demi-arête orientée (a -> b)
      halfEdgeSet.add(`${a}->${b}`);
    }
  }

  // 3. Détection des trous (boundary) et anomalies non-manifold
  let boundaryEdgeCount = 0;
  let nonManifoldEdgeCount = 0;

  for (const count of edgeCountMap.values()) {
    if (count === 1) {
      boundaryEdgeCount++; // Arête isolée -> trou dans le maillage
    } else if (count > 2) {
      nonManifoldEdgeCount++; // Arête partagée par 3+ triangles -> non-manifold
    }
  }

  // 4. Vérification de l'appariement des demi-arêtes opposées
  let opposingHalfEdgeConsistent = true;
  for (const halfEdge of halfEdgeSet) {
    const [fromStr, toStr] = halfEdge.split('->');
    const opposing = `${toStr}->${fromStr}`;
    if (!halfEdgeSet.has(opposing)) {
      opposingHalfEdgeConsistent = false;
      break;
    }
  }

  const uniqueEdgeCount = edgeCountMap.size;
  const euler = uniqueVertexCount - uniqueEdgeCount + triangleCount;
  const isWatertight = boundaryEdgeCount === 0 && opposingHalfEdgeConsistent;
  const isManifold = nonManifoldEdgeCount === 0;

  return {
    uniqueVertexCount,
    uniqueEdgeCount,
    triangleCount,
    eulerCharacteristic: euler,
    boundaryEdgeCount,
    nonManifoldEdgeCount,
    isWatertight,
    isManifold,
  };
}

describe('Étanchéité et Propriétés 2-Manifold 3D (watertight.test.ts)', () => {
  it('cas 1 : mur plein (cuboïde simple) -> 0 trou, 0 non-manifold, Euler = 2', () => {
    const footprint = computeWallFootprint2d({
      start: vec2(0, 0),
      end: vec2(3000, 0),
      thickness: 200,
      locationLine: 'center',
    });

    const piece: WallPiece = {
      id: 'full_wall_piece',
      wallId: 'w_solid',
      poly2D: footprint.vertices,
      z0: 0,
      z1: 2500,
      role: 'full',
      area2D: 600000,
      uInterval: [0, 3000],
    };

    const mesh = extrudeWallPiece(piece);
    expect(mesh).not.toBeNull();
    if (!mesh) return;

    const topo = analyzeMeshTopology(mesh);
    expect(topo.isWatertight).toBe(true);
    expect(topo.isManifold).toBe(true);
    expect(topo.boundaryEdgeCount).toBe(0);
    expect(topo.nonManifoldEdgeCount).toBe(0);
    expect(topo.eulerCharacteristic).toBe(2); // Topologie d'une sphère (solide fermé)
  });

  it('cas 2 : mur avec fenêtre (toutes les pièces solides sont individuellement watertight)', () => {
    const wall = {
      id: 'w_window_topo',
      start: vec2(0, 0),
      end: vec2(4000, 0),
      thickness: 200,
      height: 2800,
      polygon: computeWallFootprint2d({
        start: vec2(0, 0),
        end: vec2(4000, 0),
        thickness: 200,
        locationLine: 'center',
      }).vertices,
    };

    const winOp = {
      id: 'win_topo',
      hostWallId: wall.id,
      u: 2000,
      width: 1200,
      height: 1200,
      sillZ: 900,
      kind: 'window' as const,
    };

    const sliceResult = sliceWallWithOpenings(wall, [winOp]);
    const meshes = buildWallMesh(wall, sliceResult.pieces);

    expect(meshes.length).toBe(4);

    for (let i = 0; i < meshes.length; i++) {
      const m = meshes[i];
      if (!m) continue;

      const topo = analyzeMeshTopology(m);
      expect(topo.isWatertight).toBe(true);
      expect(topo.isManifold).toBe(true);
      expect(topo.boundaryEdgeCount).toBe(0);
      expect(topo.nonManifoldEdgeCount).toBe(0);
      expect(topo.eulerCharacteristic).toBe(2);
    }
  });

  it('cas 3 : mur avec onglet à 45° et ouverture en biseau -> 0 trou, 0 non-manifold, Euler = 2', () => {
    // Mur avec tête en onglet à 45°
    const miterPoly = [vec2(100, -100), vec2(3000, -100), vec2(3000, 100), vec2(-100, 100)];
    const miterWall = {
      id: 'w_miter_topo',
      start: vec2(0, 0),
      end: vec2(3000, 0),
      thickness: 200,
      height: 2800,
      polygon: miterPoly,
    };

    const winNearMiter = {
      id: 'win_near_miter_topo',
      hostWallId: miterWall.id,
      u: 550,
      width: 1000,
      height: 1400,
      sillZ: 900,
      kind: 'window' as const,
    };

    const sliceResult = sliceWallWithOpenings(miterWall, [winNearMiter]);
    const meshes = buildWallMesh(miterWall, sliceResult.pieces);

    // 4 meshes solides générés (tranche 0 avec tête biseautée, allège, linteau, tranche finale)
    expect(meshes.length).toBe(4);

    for (let i = 0; i < meshes.length; i++) {
      const m = meshes[i];
      if (!m) continue;

      const topo = analyzeMeshTopology(m);
      expect(topo.isWatertight).toBe(true);
      expect(topo.isManifold).toBe(true);
      expect(topo.boundaryEdgeCount).toBe(0);
      expect(topo.nonManifoldEdgeCount).toBe(0);
      expect(topo.eulerCharacteristic).toBe(2);
    }
  });
});
