import { describe, it, expect } from 'vitest';
import { vec2, type Vec2 } from '../vec2.js';
import { signedArea } from '../polygon.js';
import { computeEffectiveSlabPolygon, SlabGeometryError } from './effective.js';

describe('Phase 6.1a — computeEffectiveSlabPolygon (packages/geometry/src/slabs/effective.ts)', () => {
  // Dalle de base 5000 x 4000 mm (aire brute = 20 000 000 mm²)
  const baseBoundary: Vec2[] = [vec2(0, 0), vec2(5000, 0), vec2(5000, 4000), vec2(0, 4000)];

  it('T-SLAB-POLY-01 : Dalle rectangulaire simple sans trou ni trémie -> outer CCW, holes vide', () => {
    const res = computeEffectiveSlabPolygon({ boundary: baseBoundary });

    expect(res.outer).toHaveLength(4);
    expect(signedArea(res.outer)).toBeGreaterThan(0); // CCW
    expect(res.holes).toHaveLength(0);
    expect(signedArea(res.outer)).toBeCloseTo(20_000_000, 2);
  });

  it('T-SLAB-POLY-02 : Dalle avec 1 trémie intérieure carrée -> outer CCW, 1 hole CW, aire conservée', () => {
    // Trémie intérieure de 1000 x 1000 mm (aire = 1 000 000 mm²)
    const opening: Vec2[] = [
      vec2(1000, 1000),
      vec2(2000, 1000),
      vec2(2000, 2000),
      vec2(1000, 2000),
    ];

    const res = computeEffectiveSlabPolygon({
      boundary: baseBoundary,
      openings: [opening],
    });

    expect(signedArea(res.outer)).toBeGreaterThan(0); // CCW
    expect(res.holes).toHaveLength(1);
    const hole = res.holes[0]!;
    expect(signedArea(hole)).toBeLessThan(0); // CW strict

    const netArea = signedArea(res.outer) + signedArea(hole); // CW hole has negative signedArea
    expect(netArea).toBeCloseTo(19_000_000, 2);
  });

  it('T-SLAB-POLY-03 : Dalle avec 1 trou manuel + 1 trémie disjoints -> outer CCW, 2 holes CW', () => {
    const manualHole: Vec2[] = [vec2(500, 500), vec2(1500, 500), vec2(1500, 1500), vec2(500, 1500)];
    const derivedOpening: Vec2[] = [
      vec2(2500, 2000),
      vec2(3500, 2000),
      vec2(3500, 3000),
      vec2(2500, 3000),
    ];

    const res = computeEffectiveSlabPolygon({
      boundary: baseBoundary,
      holes: [manualHole],
      openings: [derivedOpening],
    });

    expect(signedArea(res.outer)).toBeGreaterThan(0);
    expect(res.holes).toHaveLength(2);
    for (const h of res.holes) {
      expect(signedArea(h)).toBeLessThan(0); // All holes CW
    }

    const netArea = signedArea(res.outer) + res.holes.reduce((sum, h) => sum + signedArea(h), 0);
    expect(netArea).toBeCloseTo(18_000_000, 2);
  });

  it('T-SLAB-POLY-04 : Trémie traversant une dalle de part en part -> throw SLAB_SEVERED', () => {
    // Trémie coupant la dalle verticalement en x in [2000, 3000]
    const cuttingOpening: Vec2[] = [
      vec2(2000, -500),
      vec2(3000, -500),
      vec2(3000, 4500),
      vec2(2000, 4500),
    ];

    expect(() =>
      computeEffectiveSlabPolygon({
        boundary: baseBoundary,
        openings: [cuttingOpening],
      }),
    ).toThrowError(SlabGeometryError);

    expect(() =>
      computeEffectiveSlabPolygon({
        boundary: baseBoundary,
        openings: [cuttingOpening],
      }),
    ).toThrowError(/SLAB_SEVERED/);
  });

  it('T-SLAB-POLY-05 : Trémie plus grande ou égale à la dalle englobant tout -> throw SLAB_EMPTY', () => {
    const engulfingOpening: Vec2[] = [
      vec2(-500, -500),
      vec2(6000, -500),
      vec2(6000, 5000),
      vec2(-500, 5000),
    ];

    expect(() =>
      computeEffectiveSlabPolygon({
        boundary: baseBoundary,
        openings: [engulfingOpening],
      }),
    ).toThrowError(SlabGeometryError);

    expect(() =>
      computeEffectiveSlabPolygon({
        boundary: baseBoundary,
        openings: [engulfingOpening],
      }),
    ).toThrowError(/SLAB_EMPTY/);
  });

  it('T-SLAB-POLY-06 : Trémie en rive (encoche mordant sur le bord) -> outer modifié (concave), 0 hole interne', () => {
    // Encoche sur le bord sud de (1000, -200) à (3000, 1000)
    const notchOpening: Vec2[] = [
      vec2(1000, -200),
      vec2(3000, -200),
      vec2(3000, 1000),
      vec2(1000, 1000),
    ];

    const res = computeEffectiveSlabPolygon({
      boundary: baseBoundary,
      openings: [notchOpening],
    });

    expect(signedArea(res.outer)).toBeGreaterThan(0); // CCW
    expect(res.holes).toHaveLength(0); // Encoche = partie du bord extérieur, pas un trou fermé!
    // Le polygone extérieur a maintenant plus de 4 sommets (encoche concave)
    expect(res.outer.length).toBeGreaterThan(4);
    // Surface = 20M - 2000 * 1000 = 18 000 000 mm²
    expect(signedArea(res.outer)).toBeCloseTo(18_000_000, 2);
  });

  it('T-SLAB-POLY-07 : Deux trémies qui se chevauchent partiellement -> union automatique, fusion en 1 seul hole CW', () => {
    // Deux carrés se chevauchant au centre
    const op1: Vec2[] = [vec2(1000, 1000), vec2(2500, 1000), vec2(2500, 2500), vec2(1000, 2500)];
    const op2: Vec2[] = [vec2(2000, 1500), vec2(3500, 1500), vec2(3500, 3000), vec2(2000, 3000)];

    const res = computeEffectiveSlabPolygon({
      boundary: baseBoundary,
      openings: [op1, op2],
    });

    expect(signedArea(res.outer)).toBeGreaterThan(0);
    // Fusion des 2 trémies sécantes en un unique trou complexe
    expect(res.holes).toHaveLength(1);
    expect(signedArea(res.holes[0]!)).toBeLessThan(0); // CW
  });

  it('T-SLAB-POLY-08 : Trémie extérieure ne touchant pas la dalle -> sans effet sur la dalle', () => {
    const disjointOpening: Vec2[] = [
      vec2(10000, 10000),
      vec2(12000, 10000),
      vec2(12000, 12000),
      vec2(10000, 12000),
    ];

    const res = computeEffectiveSlabPolygon({
      boundary: baseBoundary,
      openings: [disjointOpening],
    });

    expect(res.outer).toHaveLength(4);
    expect(signedArea(res.outer)).toBeCloseTo(20_000_000, 2);
    expect(res.holes).toHaveLength(0);
  });

  it('T-SLAB-POLY-09 : Conservation numérique stricte de surface (Net = Brut - Découpe à 1e-4 mm²)', () => {
    const opening: Vec2[] = [
      vec2(1500, 1500),
      vec2(3500, 1500),
      vec2(3500, 2500),
      vec2(1500, 2500),
    ]; // 2000 x 1000 = 2 000 000 mm²

    const res = computeEffectiveSlabPolygon({
      boundary: baseBoundary,
      openings: [opening],
    });

    const netArea = signedArea(res.outer) + signedArea(res.holes[0]!);
    expect(Math.abs(netArea - 18_000_000)).toBeLessThan(1e-4);
  });

  it('T-SLAB-POLY-10 : Orientation canonique stricte : outer CCW et holes CW même si boundary fournie était CW', () => {
    // Boundary fournie dans le sens horaire (CW, signedArea < 0)
    const cwBoundary: Vec2[] = [vec2(0, 0), vec2(0, 4000), vec2(5000, 4000), vec2(5000, 0)];
    expect(signedArea(cwBoundary)).toBeLessThan(0);

    // Trémie fournie dans le sens anti-horaire (CCW, signedArea > 0)
    const ccwOpening: Vec2[] = [
      vec2(1000, 1000),
      vec2(2000, 1000),
      vec2(2000, 2000),
      vec2(1000, 2000),
    ];
    expect(signedArea(ccwOpening)).toBeGreaterThan(0);

    const res = computeEffectiveSlabPolygon({
      boundary: cwBoundary,
      openings: [ccwOpening],
    });

    // L'algorithme doit avoir normalisé : outer CCW (> 0) et hole CW (< 0)
    expect(signedArea(res.outer)).toBeGreaterThan(0);
    expect(res.holes).toHaveLength(1);
    expect(signedArea(res.holes[0]!)).toBeLessThan(0);
  });
});
