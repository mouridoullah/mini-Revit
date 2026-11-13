import { describe, it, expect } from 'vitest';
import { extrudeWallPiece } from './extrude.js';
import { type WallPiece } from '../openings/types.js';
import { vec2 } from '../vec2.js';
import { computeMeshVolumeFromBuffers } from './extrude.test.js';
import { analyzeMeshTopology } from './watertight.test.js';

describe('Cas Limites et Robustesse Numérique (edge-cases.test.ts)', () => {
  it('pièce de rôle void -> retourne strictement null (aucune génération de buffer)', () => {
    const voidPiece: WallPiece = {
      id: 'p_void_edge',
      wallId: 'w1',
      poly2D: [vec2(0, 0), vec2(1000, 0), vec2(1000, 200), vec2(0, 200)],
      z0: 900,
      z1: 2100,
      role: 'void',
      area2D: 200000,
      uInterval: [500, 1500],
    };

    expect(extrudeWallPiece(voidPiece)).toBeNull();
  });

  it('hauteur nulle (z0 == z1) ou inversée (z0 > z1) -> retourne null', () => {
    const zeroHeightPiece: WallPiece = {
      id: 'p_zero_h',
      wallId: 'w1',
      poly2D: [vec2(0, 0), vec2(1000, 0), vec2(1000, 200), vec2(0, 200)],
      z0: 1000,
      z1: 1000, // Hauteur nulle
      role: 'full',
      area2D: 200000,
      uInterval: [0, 1000],
    };
    expect(extrudeWallPiece(zeroHeightPiece)).toBeNull();

    const invertedHeightPiece: WallPiece = {
      ...zeroHeightPiece,
      z0: 2000,
      z1: 1000, // Inversé
    };
    expect(extrudeWallPiece(invertedHeightPiece)).toBeNull();
  });

  it('polygone d aire quasi-nulle (inférieure à minArea) -> retourne null', () => {
    const flatPiece: WallPiece = {
      id: 'p_flat',
      wallId: 'w1',
      // Segment plat déguisé en polygone (aire = 0)
      poly2D: [vec2(0, 0), vec2(1000, 0), vec2(500, 0)],
      z0: 0,
      z1: 2000,
      role: 'full',
      area2D: 0,
      uInterval: [0, 1000],
    };
    expect(extrudeWallPiece(flatPiece)).toBeNull();
  });

  it('polygone avec 3 sommets colinéaires -> nettoyé sans créer de triangle plat dégénéré', () => {
    // Rectangle avec sommet supplémentaire au milieu de l'arête inférieure
    const polyWithCollinear = [
      vec2(0, 0),
      vec2(500, 0), // sommet colinéaire sur l'arête (0,0) -> (1000,0)
      vec2(1000, 0),
      vec2(1000, 200),
      vec2(0, 200),
    ];

    const piece: WallPiece = {
      id: 'p_collinear',
      wallId: 'w1',
      poly2D: polyWithCollinear,
      z0: 0,
      z1: 2500,
      role: 'full',
      area2D: 200000,
      uInterval: [0, 1000],
    };

    const mesh = extrudeWallPiece(piece);
    expect(mesh).not.toBeNull();
    if (!mesh) return;

    // Le polygone a été nettoyé à 4 sommets
    // Topologie 2-manifold fermée
    const topo = analyzeMeshTopology(mesh);
    expect(topo.isWatertight).toBe(true);
    expect(topo.isManifold).toBe(true);
    expect(topo.eulerCharacteristic).toBe(2);

    // Volume mesuré strictement égal à 1000 * 200 * 2500 = 500 000 000 mm³
    const vol = computeMeshVolumeFromBuffers(mesh);
    expect(vol).toBeCloseTo(1000 * 200 * 2500, 2);
  });

  it('polygone concave en forme de L -> triangulation earcut et volume exact', () => {
    const lPoly = [
      vec2(0, 0),
      vec2(600, 0),
      vec2(600, 200),
      vec2(200, 200),
      vec2(200, 600),
      vec2(0, 600),
    ];
    // Aire = 600*200 + 200*400 = 120 000 + 80 000 = 200 000 mm²
    const height = 3000;

    const piece: WallPiece = {
      id: 'p_lshape',
      wallId: 'w_l',
      poly2D: lPoly,
      z0: 0,
      z1: height,
      role: 'full',
      area2D: 200000,
      uInterval: [0, 600],
    };

    const mesh = extrudeWallPiece(piece);
    expect(mesh).not.toBeNull();
    if (!mesh) return;

    const topo = analyzeMeshTopology(mesh);
    expect(topo.isWatertight).toBe(true);
    expect(topo.isManifold).toBe(true);
    expect(topo.eulerCharacteristic).toBe(2);

    const vol = computeMeshVolumeFromBuffers(mesh);
    expect(vol).toBeCloseTo(200000 * height, 2);
  });

  it('grandes coordonnées à 1 km (1 000 000 mm) -> précision Float32 satisfaisante', () => {
    const offset = 1000000;
    const largePoly = [
      vec2(offset, offset),
      vec2(offset + 3000, offset),
      vec2(offset + 3000, offset + 200),
      vec2(offset, offset + 200),
    ];

    const piece: WallPiece = {
      id: 'p_1km',
      wallId: 'w_1km',
      poly2D: largePoly,
      z0: 0,
      z1: 2800,
      role: 'full',
      area2D: 600000,
      uInterval: [0, 3000],
    };

    const mesh = extrudeWallPiece(piece);
    expect(mesh).not.toBeNull();
    if (!mesh) return;

    // Précision mantisse Float32 à 1e6 : ULP ~ 0.06 mm
    expect(mesh.boundingBox.min.x).toBeCloseTo(offset, 0);
    expect(mesh.boundingBox.max.x).toBeCloseTo(offset + 3000, 0);

    const vol = computeMeshVolumeFromBuffers(mesh);
    const expectedVol = 3000 * 200 * 2800; // 1 680 000 000 mm³
    // Erreur relative < 0.01%
    const relDiff = Math.abs(vol - expectedVol) / expectedVol;
    expect(relDiff).toBeLessThan(1e-4);
  });
});
