import { describe, it, expect } from 'vitest';
import { resolveWallGeometry, computeWallPolygonalSideArea } from './resolve.js';
import { computeLevelMetrics } from '../metrics.js';
import { checkWindowViolations, checkDoorViolations } from '../rules.js';
import { type BimState, type Window, type Door, type Wall, type Level, type WallType, type Roof } from '../types.js';

describe('Phase 7.6 - Fiabilité Géométrique (Chantiers 7.6-A & 7.6-B)', () => {
  const lvl0: Level = { id: 'lvl_0', name: 'RDC', elevation: 0, height: 2800 };
  const wt200: WallType = { id: 'wt_200', name: 'Mur 200mm', thickness: 200, height: 2800 };

  const gableWall: Wall = {
    id: 'wall_gable_west',
    category: 'wall',
    typeId: 'wt_200',
    levelId: 'lvl_0',
    start: { x: 0, y: 0 },
    end: { x: 0, y: 8000 },
    topConstraint: { kind: 'roof', roofId: 'roof_1' },
  };

  const straightWall: Wall = {
    id: 'wall_straight',
    category: 'wall',
    typeId: 'wt_200',
    levelId: 'lvl_0',
    start: { x: 0, y: 0 },
    end: { x: 6000, y: 0 },
  };

  const roofGable: Roof = {
    id: 'roof_1',
    category: 'roof',
    roofTypeId: 'rt_gable',
    levelId: 'lvl_0',
    baseOffset: 2800,
    footprint: [
      { x: 0, y: 0 },
      { x: 10000, y: 0 },
      { x: 10000, y: 8000 },
      { x: 0, y: 8000 },
    ],
    ridgeAxis: {
      start: { x: 0, y: 4000 },
      end: { x: 10000, y: 4000 },
    },
  };

  const gableState: BimState = {
    schemaVersion: 2,
    units: 'mm',
    levels: { lvl_0: lvl0 },
    wallTypes: { wt_200: wt200 },
    slabTypes: {},
    doorTypes: {
      dt_1: { id: 'dt_1', name: 'Porte 900x2150', width: 900, height: 2150 },
    },
    windowTypes: {
      wt_1: { id: 'wt_1', name: 'Fenêtre 1200x1400', width: 1200, height: 1400, defaultSillHeight: 900 },
    },
    stairTypes: {},
    roofTypes: {
      rt_gable: {
        id: 'rt_gable',
        category: 'roofType',
        name: 'Toit 2 pans 35°',
        family: 'gable',
        thickness: 250,
        slopeDeg: 35,
        overhangMm: 0,
      },
    },
    roofs: { roof_1: roofGable },
    walls: {
      wall_gable_west: gableWall,
      wall_straight: straightWall,
    },
    slabs: {},
    doors: {},
    windows: {},
    rooms: {},
    dimensions: {},
    stairs: {},
    roofOpenings: {},
  };

  it('T-7.6-A1 : computeWallPolygonalSideArea calcule la surface exacte d un pignon biseauté (vs rectangle L x Hmax)', () => {
    const resolvedGable = resolveWallGeometry(gableState.walls['wall_gable_west']!, gableState);
    const resolvedStraight = resolveWallGeometry(gableState.walls['wall_straight']!, gableState);

    // Mur droit standard : grossArea = L * H = 6000 * 2800 = 16.8 m² = 16 800 000 mm²
    expect(resolvedStraight.grossAreaMm2).toBeCloseTo(6000 * 2800);

    // Mur pignon biseauté : la hauteur crête Hmax est à la faîtière (environ 5600 mm)
    // Mais l'arase basse est à 2800 mm. L'enveloppe rectangulaire L * Hmax vaudrait 8000 * Hmax (~44.8 m²)
    const apexHeight = resolvedGable.height;
    const naiveEnvelopeArea = 8000 * apexHeight;

    // L'aire polygonale exacte doit être strictement inférieure au rectangle naïf L * Hmax
    expect(resolvedGable.grossAreaMm2).toBeLessThan(naiveEnvelopeArea * 0.85);
    expect(resolvedGable.grossAreaMm2).toBeGreaterThan(8000 * 2800);

    // Vérification géométrique de la formule trapézoïdale directe
    const manualArea = computeWallPolygonalSideArea(resolvedGable.topProfile, resolvedGable.zBase);
    expect(resolvedGable.grossAreaMm2).toBeCloseTo(manualArea);
  });

  it('T-7.6-A2 : computeLevelMetrics utilise la surface polygonale réelle pour le métré brut et net', () => {
    const metrics = computeLevelMetrics(gableState, 'lvl_0');
    const gableMetric = metrics.walls.find((w) => w.wallId === 'wall_gable_west');
    expect(gableMetric).toBeDefined();

    const resolvedGable = resolveWallGeometry(gableState.walls['wall_gable_west']!, gableState);
    // Le métré doit correspondre exactement à l'aire polygonale
    expect(gableMetric!.grossAreaMm2).toBeCloseTo(resolvedGable.grossAreaMm2);
    expect(gableMetric!.netAreaMm2).toBeCloseTo(resolvedGable.grossAreaMm2); // Pas d'ouverture
    expect(gableMetric!.volumeMm3).toBeCloseTo(resolvedGable.grossAreaMm2 * 200); // Épaisseur 200mm
  });

  it('T-7.6-B1 : checkWindowViolations rejette une fenêtre qui déborde de la pente locale sous toiture', () => {
    // Fenêtre placée à 200 mm du départ (u in [200, 1400]) où la toiture est encore très basse (~2940 mm)
    // avec allège 1800 mm + hauteur 1400 mm = 3200 mm > cote locale sous pente !
    const winPiercingRoof: Window = {
      id: 'win_piercing',
      category: 'window',
      windowTypeId: 'wt_1',
      hostWallId: 'wall_gable_west',
      offsetAlong: 200,
      sillHeight: 1800, // 1800 + 1400 = 3200 mm (> hauteur locale sous rive basse)
    };

    const violations = checkWindowViolations(winPiercingRoof, gableState);
    const heightViolation = violations.find((v) => v.code === 'INVALID_OPENING_HEIGHT');
    expect(heightViolation).toBeDefined();
    expect(heightViolation!.message).toContain('exceeds host wall local headroom');
  });

  it('T-7.6-B2 : checkWindowViolations accepte la même fenêtre au centre du mur pignon où la hauteur sous faîtage est maximale', () => {
    // Fenêtre centrée à offsetAlong = 3400 mm (u in [3400, 4600] sous le faîtage où z >= 5100 mm)
    // 1800 mm + 1400 mm = 3200 mm <= cote sous faîtage (qui vaut > 5000 mm)
    const winUnderRidge: Window = {
      id: 'win_under_ridge',
      category: 'window',
      windowTypeId: 'wt_1',
      hostWallId: 'wall_gable_west',
      offsetAlong: 3400,
      sillHeight: 1800,
    };

    const violations = checkWindowViolations(winUnderRidge, gableState);
    const heightViolation = violations.find((v) => v.code === 'INVALID_OPENING_HEIGHT');
    expect(heightViolation).toBeUndefined();
  });

  it('T-7.6-B3 : checkDoorViolations rejette une porte trop haute en rive basse sous toiture', () => {
    // Mur avec toiture très basse en rive
    const lowRoofState: BimState = {
      ...gableState,
      roofs: {
        roof_low: {
          id: 'roof_low',
          category: 'roof',
          roofTypeId: 'rt_gable',
          levelId: 'lvl_0',
          baseOffset: 1800, // Démarre à 1800 mm
          footprint: [
            { x: 0, y: 0 },
            { x: 10000, y: 0 },
            { x: 10000, y: 8000 },
            { x: 0, y: 8000 },
          ],
          ridgeAxis: {
            start: { x: 0, y: 4000 },
            end: { x: 10000, y: 4000 },
          },
        },
      },
      walls: {
        wall_low_gable: {
          id: 'wall_low_gable',
          category: 'wall',
          typeId: 'wt_200',
          levelId: 'lvl_0',
          start: { x: 0, y: 0 },
          end: { x: 0, y: 8000 },
          topConstraint: { kind: 'roof', roofId: 'roof_low' },
        },
      },
    };

    // Porte de 2100 mm placée en rive basse (où le mur démarre à 1800 mm)
    const doorPiercingRoof: Door = {
      id: 'door_piercing',
      category: 'door',
      doorTypeId: 'dt_1',
      hostWallId: 'wall_low_gable',
      offsetAlong: 100, // 2100 mm > hauteur locale ~1870 mm
      swing: { side: 'right', direction: 'in' },
    };

    const violations = checkDoorViolations(doorPiercingRoof, lowRoofState);
    const heightViolation = violations.find((v) => v.code === 'INVALID_OPENING_HEIGHT');
    expect(heightViolation).toBeDefined();
    expect(heightViolation!.message).toContain('exceeds host wall local headroom');
  });
});
