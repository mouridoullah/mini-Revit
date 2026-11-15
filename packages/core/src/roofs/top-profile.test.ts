import { describe, it, expect } from 'vitest';
import { vec2 } from '@mini-bim/geometry';
import { type BimState, type Wall, type Roof, type GableRoofType, type WallType, type Level } from '../types.js';
import { computeWallTopProfile } from './top-profile.js';

describe('computeWallTopProfile (ADR-053 [D2 / 4.3])', () => {
  const level0: Level = { id: 'lvl_0', name: 'RDC', elevation: 0 };
  const wallType: WallType = { id: 'wt_standard', name: 'Mur 200', thickness: 200, height: 2800 };

  const gableType: GableRoofType = {
    id: 'rt_gable_45',
    name: 'Toiture 2 Pans 45°',
    category: 'roofType',
    family: 'gable',
    thickness: 250,
    slopeDeg: 45, // tan(45°) = 1.0 exactement !
    overhangMm: 0,
    materialId: 'tile',
  };

  // Toiture 10m x 8m centrée sur le faîtage y = 4000
  // x de 0 à 10000, y de 0 à 8000
  // Demi-portée = 4000 mm. Avec slope 45° : totalRise = 4000 * tan(45°) = 4000 mm.
  // zBase = 0 -> zRidge = 0 + 4000 = 4000 mm.
  const gableRoof: Roof = {
    id: 'roof_gable_1',
    category: 'roof',
    roofTypeId: 'rt_gable_45',
    levelId: 'lvl_0',
    baseOffset: 0,
    footprint: [
      vec2(0, 0),
      vec2(10000, 0),
      vec2(10000, 8000),
      vec2(0, 8000),
    ],
    ridgeAxis: {
      start: vec2(0, 4000),
      end: vec2(10000, 4000),
    },
  };

  const state: BimState = {
    schemaVersion: 2,
    units: 'mm',
    levels: { lvl_0: level0 },
    wallTypes: { wt_standard: wallType },
    roofTypes: { rt_gable_45: gableType },
    slabTypes: {},
    doorTypes: {},
    windowTypes: {},
    walls: {},
    slabs: {},
    doors: {},
    windows: {},
    rooms: {},
    dimensions: {},
    roofs: { roof_gable_1: gableRoof },
  };

  it('T-TOP-PROFILE-01 : Mur sous 1 pan, parallèle au ridge -> profil horizontal constant (trapézoïdal)', () => {
    // Mur le long de la ligne d'égout y = 1000, x de 0 à 6000 (distance au faîtage = 3000 mm)
    // z = 4000 - 3000 * tan(45°) = 1000 mm constant
    const wallParallel: Wall = {
      id: 'w_par',
      category: 'wall',
      typeId: 'wt_standard',
      levelId: 'lvl_0',
      start: vec2(0, 1000),
      end: vec2(6000, 1000),
    };

    const profile = computeWallTopProfile(wallParallel, gableRoof, state);
    expect(profile).toHaveLength(2);
    expect(profile[0]?.x).toBe(0);
    expect(profile[0]?.y).toBeCloseTo(1000, 1);
    expect(profile[1]?.x).toBe(6000);
    expect(profile[1]?.y).toBeCloseTo(1000, 1);
  });

  it('T-TOP-PROFILE-02 : Mur sous 1 pan, perpendiculaire au ridge -> profil trapézoïdal linéaire montant', () => {
    // Mur situé sous le versant Sud (y de 0 à 3000 à x = 2000), ne traverse pas le faîtage (qui est à 4000)
    // À y = 0 : dist = 4000 -> z = 0
    // À y = 3000 : dist = 1000 -> z = 3000
    const wallSlope: Wall = {
      id: 'w_one_slope',
      category: 'wall',
      typeId: 'wt_standard',
      levelId: 'lvl_0',
      start: vec2(2000, 0),
      end: vec2(2000, 3000),
    };

    const profile = computeWallTopProfile(wallSlope, gableRoof, state);
    expect(profile).toHaveLength(2);
    expect(profile[0]?.x).toBe(0);
    expect(profile[0]?.y).toBeCloseTo(0, 1);
    expect(profile[1]?.x).toBe(3000);
    expect(profile[1]?.y).toBeCloseTo(3000, 1);
  });

  it('T-TOP-PROFILE-03 : Mur pignon (2 pans) -> chevron avec pic exact à zBase + totalRise', () => {
    // Mur pignon traversant toute la largeur de y = 0 à y = 8000 à x = 0
    // Traverse le faîtage à y = 4000 (u = 4000)
    // zBase = 0, totalRise = 4000 mm -> pic exactement à 4000 mm !
    const wallGable: Wall = {
      id: 'w_pignon',
      category: 'wall',
      typeId: 'wt_standard',
      levelId: 'lvl_0',
      start: vec2(0, 0),
      end: vec2(0, 8000),
    };

    const profile = computeWallTopProfile(wallGable, gableRoof, state);
    expect(profile).toHaveLength(3);

    // 1. Départ à l'égout Sud (u = 0, z = 0)
    expect(profile[0]?.x).toBe(0);
    expect(profile[0]?.y).toBeCloseTo(0, 1);

    // 2. Pic au faîtage (u = 4000, z = 4000 = zBase + totalRise)
    expect(profile[1]?.x).toBeCloseTo(4000, 1);
    expect(profile[1]?.y).toBeCloseTo(4000, 1);

    // 3. Arrivée à l'égout Nord (u = 8000, z = 0)
    expect(profile[2]?.x).toBe(8000);
    expect(profile[2]?.y).toBeCloseTo(0, 1);
  });

  it('T-TOP-PROFILE-04 : Mur hors toit -> fallback nominal (wallType.height = 2800 mm)', () => {
    // Mur complètement en dehors de l'emprise du toit (x = 20000)
    const wallOutside: Wall = {
      id: 'w_out',
      category: 'wall',
      typeId: 'wt_standard',
      levelId: 'lvl_0',
      start: vec2(20000, 0),
      end: vec2(20000, 4000),
    };

    const profile = computeWallTopProfile(wallOutside, gableRoof, state);
    expect(profile).toHaveLength(2);
    expect(profile[0]?.y).toBe(2800);
    expect(profile[1]?.y).toBe(2800);
  });

  it('T-TOP-PROFILE-05 : Mur qui traverse le faîtage obliquement -> polyline 3 sommets avec pic au point d’intersection', () => {
    // Mur oblique de (1000, 2000) à (5000, 6000)
    // Longueur = hypot(4000, 4000) = 4000 * sqrt(2) ≈ 5656.85 mm
    // Le faîtage est à y = 4000. Le mur croise y = 4000 exactement à son milieu t = 0.5 (u = 2828.43 mm)
    // À ce point de croisement, z doit atteindre le faîtage z = 4000 mm.
    const wallOblique: Wall = {
      id: 'w_oblique',
      category: 'wall',
      typeId: 'wt_standard',
      levelId: 'lvl_0',
      start: vec2(1000, 2000),
      end: vec2(5000, 6000),
    };

    const profile = computeWallTopProfile(wallOblique, gableRoof, state);
    expect(profile).toHaveLength(3);

    // Point 1 : départ (dist au faîtage = 2000 -> z = 2000)
    expect(profile[0]?.x).toBe(0);
    expect(profile[0]?.y).toBeCloseTo(2000, 1);

    // Point 2 : intersection faîtage au sommet z = 4000
    const expectedUCross = 4000 * Math.SQRT2 * 0.5;
    expect(profile[1]?.x).toBeCloseTo(expectedUCross, 1);
    expect(profile[1]?.y).toBeCloseTo(4000, 1);

    // Point 3 : arrivée (dist au faîtage = 2000 -> z = 2000)
    const totalLen = 4000 * Math.SQRT2;
    expect(profile[2]?.x).toBeCloseTo(totalLen, 1);
    expect(profile[2]?.y).toBeCloseTo(2000, 1);
  });

  it('T-TOP-PROFILE-06 : Mur très court (faible longueur) -> géré gracieusement sans plantage', () => {
    const wallShort: Wall = {
      id: 'w_short',
      category: 'wall',
      typeId: 'wt_standard',
      levelId: 'lvl_0',
      start: vec2(2000, 2000),
      end: vec2(2000.00001, 2000), // longueur < 1e-4
    };

    const profile = computeWallTopProfile(wallShort, gableRoof, state);
    expect(profile).toHaveLength(2);
    expect(profile[0]?.y).toBe(2800);
    expect(profile[1]?.y).toBe(2800);
  });
});
