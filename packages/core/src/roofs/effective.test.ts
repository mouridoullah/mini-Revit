import { describe, it, expect } from 'vitest';
import { vec2 } from '@mini-bim/geometry';
import { type Roof } from '../types.js';
import { computeEffectiveRoofPolygon, RoofGeometryError } from './effective.js';

describe('computeEffectiveRoofPolygon (ADR-053 [D3])', () => {
  const baseRoof: Roof = {
    id: 'roof_test_eff',
    category: 'roof',
    roofTypeId: 'rt_flat_default',
    levelId: 'lvl_r1',
    footprint: [
      vec2(0, 0),
      vec2(10000, 0),
      vec2(10000, 8000),
      vec2(0, 8000),
    ],
  };

  it('T-ROOF-EFF-01 : Sans opening -> footprint identique, wasTrimmed = false, aucun trou', () => {
    const res = computeEffectiveRoofPolygon(baseRoof, []);
    expect(res.effectiveFootprint).toHaveLength(4);
    expect(res.effectiveHoles).toHaveLength(0);
    expect(res.wasTrimmed).toBe(false);
    expect(res.effectiveFootprint[0]?.x).toBe(0);
    expect(res.effectiveFootprint[0]?.y).toBe(0);
  });

  it('T-ROOF-EFF-02 : Avec 1 opening intérieur -> 1 hole, wasTrimmed = false', () => {
    const opening = {
      id: 'ro_1',
      category: 'roofOpening' as const,
      roofId: 'roof_test_eff',
      offsetU: 2000,
      offsetV: 2000,
      width: 1000,
      height: 1000,
    };

    const res = computeEffectiveRoofPolygon(baseRoof, [opening]);
    expect(res.effectiveFootprint).toHaveLength(4);
    expect(res.effectiveHoles).toHaveLength(1);
    expect(res.wasTrimmed).toBe(false);

    const hole = res.effectiveHoles[0];
    expect(hole).toBeDefined();
    expect(hole?.length).toBeGreaterThanOrEqual(3);
  });

  it('T-ROOF-EFF-03 : Avec opening sévère (sépare en 2) -> rejet ROOF_SEVERED', () => {
    // Trémie traversante d'un bord à l'autre (x de 4000 à 6000 sur toute la hauteur y de -100 à 9000)
    const severeOpening = [
      vec2(4000, -500),
      vec2(6000, -500),
      vec2(6000, 8500),
      vec2(4000, 8500),
    ];

    expect(() => {
      computeEffectiveRoofPolygon(baseRoof, [severeOpening]);
    }).toThrowError(RoofGeometryError);

    try {
      computeEffectiveRoofPolygon(baseRoof, [severeOpening]);
    } catch (err) {
      expect((err as RoofGeometryError).code).toBe('ROOF_SEVERED');
    }
  });

  it('T-ROOF-EFF-04 : Avec opening = footprint entier -> rejet ROOF_EMPTY', () => {
    const fullOpening = [
      vec2(-100, -100),
      vec2(10100, -100),
      vec2(10100, 8100),
      vec2(-100, 8100),
    ];

    expect(() => {
      computeEffectiveRoofPolygon(baseRoof, [fullOpening]);
    }).toThrowError(RoofGeometryError);

    try {
      computeEffectiveRoofPolygon(baseRoof, [fullOpening]);
    } catch (err) {
      expect((err as RoofGeometryError).code).toBe('ROOF_EMPTY');
    }
  });

  it('T-ROOF-EFF-05 : Ouverture de rive (intersecte le bord) -> trimmed footprint (wasTrimmed = true)', () => {
    // Encoche sur le bord bas (x entre 2000 et 4000, y de -500 à 1000)
    const edgeOpening = [
      vec2(2000, -500),
      vec2(4000, -500),
      vec2(4000, 1000),
      vec2(2000, 1000),
    ];

    const res = computeEffectiveRoofPolygon(baseRoof, [edgeOpening]);
    expect(res.wasTrimmed).toBe(true);
    expect(res.effectiveHoles).toHaveLength(0);
    // Le contour a plus de 4 sommets à cause de l'encoche
    expect(res.effectiveFootprint.length).toBeGreaterThan(4);
  });

  it('T-ROOF-EFF-06 : 2 openings chevauchants -> union propre en 1 seul hole', () => {
    const op1 = {
      id: 'ro_a',
      category: 'roofOpening' as const,
      roofId: 'roof_test_eff',
      offsetU: 2000,
      offsetV: 2000,
      width: 1500,
      height: 1500,
    };
    const op2 = {
      id: 'ro_b',
      category: 'roofOpening' as const,
      roofId: 'roof_test_eff',
      offsetU: 3000,
      offsetV: 2500,
      width: 1500,
      height: 1500,
    };

    const res = computeEffectiveRoofPolygon(baseRoof, [op1, op2]);
    expect(res.effectiveHoles).toHaveLength(1); // fusionné en un seul trou
    expect(res.wasTrimmed).toBe(false);
  });
});
