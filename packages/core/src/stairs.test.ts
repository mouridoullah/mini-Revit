import { describe, it, expect, vi } from 'vitest';
import { vec2 } from '@mini-bim/geometry';
import {
  BimDocument,
  Commands,
  type Stair,
  type StairType,
  type Level,
  BimValidationError,
  validateStairBlondel,
  computeStairGeometry,
  computeStairShaft,
  computeHeadroomCutoffStep,
  toJSON,
  fromJSON,
} from './index.js';

describe('Phase 6.4a — Modèle Escalier Droit, Validation & Blondel (packages/core/src/stairs.ts)', () => {
  function createTestDocWithLevels(): {
    doc: BimDocument;
    rdcId: string;
    r1Id: string;
    stairTypeId: string;
  } {
    const doc = BimDocument.createDefaultProject();
    const rdcId = Object.keys(doc.getState().levels)[0]!;

    const r1Id = 'lvl_r1';
    const r1Level: Level = {
      id: r1Id,
      name: 'Étage 1 (R+1)',
      elevation: 2800,
    };
    doc.execute(new Commands.AddLevelCommand(r1Level));

    const stairTypeId = 'stair-type-900';
    const stairType: StairType = {
      id: stairTypeId,
      name: 'Escalier Bois 900mm',
      width: 900,
    };
    doc.execute(new Commands.AddStairTypeCommand(stairType));

    return { doc, rdcId, r1Id, stairTypeId };
  }

  it('T-STAIR-01 : AddStairTypeCommand valide insère le StairType dans le catalogue', () => {
    const doc = BimDocument.createDefaultProject();
    const stairType: StairType = {
      id: 'st_standard',
      name: 'Escalier Métallique 1000mm',
      width: 1000,
    };
    doc.execute(new Commands.AddStairTypeCommand(stairType));

    const state = doc.getState();
    expect(state.stairTypes?.[stairType.id]).toEqual(stairType);
  });

  it('T-STAIR-02 : AddStairCommand valide insère l’escalier reliant deux étages', () => {
    const { doc, rdcId, r1Id, stairTypeId } = createTestDocWithLevels();

    const stair: Stair = {
      id: 'stair_01',
      category: 'stair',
      stairTypeId,
      bottomLevelId: rdcId,
      topLevelId: r1Id,
      start: vec2(1000, 1000),
      end: vec2(5350, 1000),
    };
    doc.execute(new Commands.AddStairCommand(stair));

    const state = doc.getState();
    expect(state.stairs?.[stair.id]).toEqual(stair);
  });

  it('T-STAIR-03 : validateStair avec STAIR_LEVELS_NOT_ADJACENT rejette les niveaux non consécutifs', () => {
    const { doc, rdcId, r1Id, stairTypeId } = createTestDocWithLevels();

    // 1. Rejet si topLevel.elevation <= bottomLevel.elevation
    const invertedStair: Stair = {
      id: 'stair_inv',
      category: 'stair',
      stairTypeId,
      bottomLevelId: r1Id,
      topLevelId: rdcId,
      start: vec2(1000, 1000),
      end: vec2(5000, 1000),
    };
    expect(() => doc.execute(new Commands.AddStairCommand(invertedStair))).toThrow(
      BimValidationError,
    );

    // 2. Rejet si un niveau intermédiaire existe
    const r2Level: Level = {
      id: 'lvl_r2',
      name: 'Étage 2 (R+2)',
      elevation: 5600,
    };
    doc.execute(new Commands.AddLevelCommand(r2Level));

    // Tentative de relier RDC (0) directement à R+2 (5600) en sautant R+1 (2800)
    const skippingStair: Stair = {
      id: 'stair_skip',
      category: 'stair',
      stairTypeId,
      bottomLevelId: rdcId,
      topLevelId: 'lvl_r2',
      start: vec2(1000, 1000),
      end: vec2(9000, 1000),
    };
    expect(() => doc.execute(new Commands.AddStairCommand(skippingStair))).toThrow(
      BimValidationError,
    );
  });

  it('T-STAIR-04 : validateStair avec INVALID_STAIR_GEOMETRY rejette un reculement trop court (< width)', () => {
    const { doc, rdcId, r1Id, stairTypeId } = createTestDocWithLevels();

    // Longueur de volée = 500 mm alors que width = 900 mm
    const shortStair: Stair = {
      id: 'stair_short',
      category: 'stair',
      stairTypeId,
      bottomLevelId: rdcId,
      topLevelId: r1Id,
      start: vec2(1000, 1000),
      end: vec2(1500, 1000),
    };

    expect(() => doc.execute(new Commands.AddStairCommand(shortStair))).toThrow(
      BimValidationError,
    );
  });

  it('T-STAIR-05 : validateStair avec INVALID_STAIR_GEOMETRY rejette un reculement excessif (> 20000 mm)', () => {
    const { doc, rdcId, r1Id, stairTypeId } = createTestDocWithLevels();

    // Longueur de volée = 25000 mm
    const hugeStair: Stair = {
      id: 'stair_huge',
      category: 'stair',
      stairTypeId,
      bottomLevelId: rdcId,
      topLevelId: r1Id,
      start: vec2(0, 0),
      end: vec2(25000, 0),
    };

    expect(() => doc.execute(new Commands.AddStairCommand(hugeStair))).toThrow(
      BimValidationError,
    );
  });

  it('T-STAIR-06 : computeStairGeometry sur ΔZ=2800 mm et L=4640 mm donne N=16, h=175 mm, g=290 mm', () => {
    const { doc, rdcId, r1Id, stairTypeId } = createTestDocWithLevels();

    const stair: Stair = {
      id: 'stair_std',
      category: 'stair',
      stairTypeId,
      bottomLevelId: rdcId,
      topLevelId: r1Id,
      start: vec2(0, 0),
      end: vec2(4640, 0),
    };

    const geom = computeStairGeometry(stair, doc.getState());
    expect(geom.totalRise).toBe(2800);
    expect(geom.numberOfSteps).toBe(16);
    expect(geom.stepHeight).toBe(175);
    expect(geom.totalRun).toBe(4640);
    expect(geom.stepDepth).toBe(290);
    expect(geom.isCompliant).toBe(true);
    expect(geom.warnings).toHaveLength(0);
  });

  it('T-STAIR-07 : computeStairGeometry sur ΔZ=3000 mm et L=4845 mm donne N=17, h=176.47 mm, g=285 mm (Blondel conforme)', () => {
    const doc = BimDocument.createDefaultProject();
    const rdcId = Object.keys(doc.getState().levels)[0]!;
    const topId = 'lvl_3000';
    doc.execute(new Commands.AddLevelCommand({ id: topId, name: 'Haut 3000', elevation: 3000 }));

    const stair: Stair = {
      id: 'stair_3000',
      category: 'stair',
      stairTypeId: 'default-stair-type',
      bottomLevelId: rdcId,
      topLevelId: topId,
      start: vec2(0, 0),
      end: vec2(4845, 0),
    };

    const geom = computeStairGeometry(stair, doc.getState());
    expect(geom.numberOfSteps).toBe(17);
    expect(geom.stepHeight).toBeCloseTo(3000 / 17, 2);
    expect(geom.stepDepth).toBeCloseTo(285, 2);
    expect(geom.isCompliant).toBe(true);
  });

  it('T-STAIR-08 : computeStairGeometry sur ΔZ=2500 mm et L=3920 mm donne N=14, h=178.57 mm, g=280 mm', () => {
    const doc = BimDocument.createDefaultProject();
    const rdcId = Object.keys(doc.getState().levels)[0]!;
    const topId = 'lvl_2500';
    doc.execute(new Commands.AddLevelCommand({ id: topId, name: 'Haut 2500', elevation: 2500 }));

    const stair: Stair = {
      id: 'stair_2500',
      category: 'stair',
      stairTypeId: 'default-stair-type',
      bottomLevelId: rdcId,
      topLevelId: topId,
      start: vec2(0, 0),
      end: vec2(3920, 0),
    };

    const geom = computeStairGeometry(stair, doc.getState());
    expect(geom.numberOfSteps).toBe(14);
    expect(geom.stepHeight).toBeCloseTo(2500 / 14, 2);
    expect(geom.stepDepth).toBe(280);
    expect(geom.isCompliant).toBe(true);
  });

  it('T-STAIR-09 : validateStairBlondel sur 2h+g=640 mm confirme la conformité confort', () => {
    const { doc, rdcId, r1Id, stairTypeId } = createTestDocWithLevels();

    // 2 * 175 + 290 = 640 mm
    const stair: Stair = {
      id: 'stair_blondel_ok',
      category: 'stair',
      stairTypeId,
      bottomLevelId: rdcId,
      topLevelId: r1Id,
      start: vec2(0, 0),
      end: vec2(4640, 0),
    };

    const res = validateStairBlondel(stair, doc.getState());
    expect(res.isCompliant).toBe(true);
    expect(res.warnings).toHaveLength(0);
  });

  it('T-STAIR-10 : validateStairBlondel sur 2h+g=580 mm émet un warning de confort sans blocage', () => {
    const { doc, rdcId, r1Id, stairTypeId } = createTestDocWithLevels();

    // 2 * 175 + 230 = 580 mm (hors confort [600,640], dans sécurité [560,680])
    const stair: Stair = {
      id: 'stair_blondel_comfort',
      category: 'stair',
      stairTypeId,
      bottomLevelId: rdcId,
      topLevelId: r1Id,
      start: vec2(0, 0),
      end: vec2(16 * 230, 0),
    };

    const res = validateStairBlondel(stair, doc.getState());
    expect(res.isCompliant).toBe(false);
    expect(res.warnings.some((w) => w.includes('STAIR_BLONDEL_OUT_OF_COMFORT'))).toBe(true);
    expect(res.warnings.some((w) => w.includes('STAIR_BLONDEL_OUT_OF_SAFETY'))).toBe(false);
  });

  it('T-STAIR-11 : validateStairBlondel sur 2h+g=700 mm émet un warning de sécurité', () => {
    const { doc, rdcId, r1Id, stairTypeId } = createTestDocWithLevels();

    // 2 * 175 + 350 = 700 mm (> 680 mm)
    const stair: Stair = {
      id: 'stair_blondel_safety',
      category: 'stair',
      stairTypeId,
      bottomLevelId: rdcId,
      topLevelId: r1Id,
      start: vec2(0, 0),
      end: vec2(16 * 350, 0),
    };

    const res = validateStairBlondel(stair, doc.getState());
    expect(res.isCompliant).toBe(false);
    expect(res.warnings.some((w) => w.includes('STAIR_BLONDEL_OUT_OF_SAFETY'))).toBe(true);
  });

  it('T-STAIR-12 : computeStairShaft génère un rectangle orienté avec les dégagements prescrits', () => {
    const { doc, rdcId, r1Id, stairTypeId } = createTestDocWithLevels();

    const stair: Stair = {
      id: 'stair_shaft_test',
      category: 'stair',
      stairTypeId,
      bottomLevelId: rdcId,
      topLevelId: r1Id,
      start: vec2(1000, 1000),
      end: vec2(5000, 1000), // L = 4000 mm, direction horizontale (1, 0)
    };

    const shaft = computeStairShaft(stair, doc.getState());
    expect(shaft).toHaveLength(4);

    // Dégagements : largeur = 900 + 100 = 1000 mm (+-500 en Y), longueur = 4000 + 200 = 4200 mm (900 à 5100 en X)
    const xs = shaft.map((p) => p.x);
    const ys = shaft.map((p) => p.y);

    expect(Math.min(...xs)).toBe(900);
    expect(Math.max(...xs)).toBe(5100);
    expect(Math.min(...ys)).toBe(500);
    expect(Math.max(...ys)).toBe(1500);
  });

  it('T-STAIR-CUTOFF-01 : computeHeadroomCutoffStep — échappée exacte à la marche k (hauteur libre = 2000 mm pile)', () => {
    // Cas configuré pour tomber exactement sur 2000 mm :
    // ΔZ = 2800 mm, N = 14 marches, h = 200 mm, slabThickness = 200 mm, minHeadroom = 2000 mm.
    // Sous-face dalle Z_inf = 2800 - 200 = 2600 mm.
    // Échappée à la marche k : H(k) = 2600 - k * 200.
    // k = 0 : 2600 mm
    // k = 1 : 2400 mm
    // k = 2 : 2200 mm
    // k = 3 : 2000 mm (EXACTEMENT minHeadroom -> encore suffisant !)
    // k = 4 : 1800 mm (< 2000 mm -> insuffisant -> rupture !)
    const dummyGeom = {
      numberOfSteps: 14,
      stepHeight: 200,
      stepDepth: 280,
      totalRise: 2800,
      totalRun: 14 * 280,
      direction: vec2(1, 0),
      isCompliant: false,
      warnings: [],
    };

    const cutoff = computeHeadroomCutoffStep(dummyGeom, 2000, 200);
    expect(cutoff).toBe(4); // La trémie doit s'ouvrir à la marche 4
  });

  it('T-STAIR-CUTOFF-02 : computeHeadroomCutoffStep — échappée insuffisante à l arrivée haute (N-1 < 2000 mm)', () => {
    // Sur tout escalier montant, la dernière marche N-1 sous plafond avant le palier
    // a une échappée H(N-1) = totalRise - slabThickness - (N-1)*h = h - slabThickness.
    // Si h = 175 mm et slabThickness = 200 mm, H(N-1) = -25 mm, donc < 2000 mm !
    const geomStandard = {
      numberOfSteps: 16,
      stepHeight: 175,
      stepDepth: 270,
      totalRise: 2800,
      totalRun: 16 * 270,
      direction: vec2(1, 0),
      isCompliant: true,
      warnings: [],
    };

    const cutoff = computeHeadroomCutoffStep(geomStandard, 2000, 200);
    // H(k) = 2800 - 200 - k*175 = 2600 - k*175
    // k = 3 : 2600 - 525 = 2075 mm (>= 2000)
    // k = 4 : 2600 - 700 = 1900 mm (< 2000)
    expect(cutoff).toBe(4);
    expect(cutoff).toBeLessThan(geomStandard.numberOfSteps);
  });

  it('T-STAIR-CUTOFF-03 : computeHeadroomCutoffStep — dalle épaisse (400 mm) déclenche un cutoff plus tôt', () => {
    const geom = {
      numberOfSteps: 16,
      stepHeight: 175,
      stepDepth: 270,
      totalRise: 2800,
      totalRun: 16 * 270,
      direction: vec2(1, 0),
      isCompliant: true,
      warnings: [],
    };

    const cutoffStandard = computeHeadroomCutoffStep(geom, 2000, 200); // k = 4
    const cutoffThick = computeHeadroomCutoffStep(geom, 2000, 400); // Sous-face à 2400 mm -> k = 3

    // Dalle plus épaisse -> sous-face plus basse -> échappée rompue plus bas dans l'escalier
    expect(cutoffThick).toBeLessThan(cutoffStandard);
    expect(cutoffThick).toBe(3); // 2400 - 2000 = 400 mm -> 400/175 = 2.28 -> k = 3
  });

  it('T-STAIR-CUTOFF-04 : computeHeadroomCutoffStep — ΔZ très grand (5000 mm) déclenche un cutoff plus tard', () => {
    const geomHigh = {
      numberOfSteps: 28,
      stepHeight: 5000 / 28, // ~178.57 mm
      stepDepth: 280,
      totalRise: 5000,
      totalRun: 28 * 280,
      direction: vec2(1, 0),
      isCompliant: true,
      warnings: [],
    };

    const cutoffHigh = computeHeadroomCutoffStep(geomHigh, 2000, 200);
    // Z_inf = 4800 mm. MaxClearance = 4800 - 2000 = 2800 mm.
    // 2800 / 178.57 = 15.68 -> k = 16
    expect(cutoffHigh).toBe(16);
    expect(cutoffHigh).toBeGreaterThan(4);
  });

  it('T-STAIR-CUTOFF-05 : computeStairShaft avec useHeadroomCutoff: true découpe à partir de la marche de rupture', () => {
    const { doc, rdcId, r1Id, stairTypeId } = createTestDocWithLevels();

    const stair: Stair = {
      id: 'stair_shaft_cutoff',
      category: 'stair',
      stairTypeId,
      bottomLevelId: rdcId,
      topLevelId: r1Id,
      start: vec2(1000, 1000),
      end: vec2(5000, 1000), // L = 4000 mm, direction (1, 0)
    };

    const shaftCutoff = computeStairShaft(stair, doc.getState(), {
      useHeadroomCutoff: true,
      minHeadroom: 2000,
      slabThickness: 200,
    });
    expect(shaftCutoff).toHaveLength(4);

    const xs = shaftCutoff.map((p) => p.x);
    // Le cutoff se situe à la marche 4 : 4 * (4000 / 16) = 1000 mm depuis start (x = 2000)
    // Avec 100 mm d'anticipation : pStart.x = 2000 - 100 = 1900 mm.
    expect(Math.min(...xs)).toBe(1900);
    expect(Math.max(...xs)).toBe(5100);
  });

  it('T-MIG-STAIR-01 : fromJSON() initialise stairs: {} et stairTypes: {} sur un état v2 sans escalier', () => {
    const v2Json = JSON.stringify({
      schemaVersion: 2,
      units: 'mm',
      levels: {
        lvl0: { id: 'lvl0', name: 'RDC', elevation: 0 },
      },
      wallTypes: {
        wt1: { id: 'wt1', name: 'Mur 200', thickness: 200, height: 2800 },
      },
      slabTypes: {
        st1: { id: 'st1', name: 'Dalle 200', thickness: 200 },
      },
      doorTypes: {},
      windowTypes: {},
      walls: {},
      slabs: {},
      doors: {},
      windows: {},
      rooms: {},
      dimensions: {},
    });

    const parsed = fromJSON(v2Json);
    expect(parsed.stairTypes).toBeDefined();
    expect(parsed.stairTypes).toEqual({});
    expect(parsed.stairs).toBeDefined();
    expect(parsed.stairs).toEqual({});
  });

  it('T-MIG-STAIR-02 : round-trip toJSON/fromJSON préserve intégralement les escaliers et types', () => {
    const { doc, rdcId, r1Id, stairTypeId } = createTestDocWithLevels();

    const stair: Stair = {
      id: 'stair_rt',
      category: 'stair',
      stairTypeId,
      bottomLevelId: rdcId,
      topLevelId: r1Id,
      start: vec2(2000, 1500),
      end: vec2(6500, 1500),
      widthOverride: 1100,
    };
    doc.execute(new Commands.AddStairCommand(stair));

    const json = toJSON(doc.getState());
    const reloaded = fromJSON(json);

    expect(reloaded.stairTypes?.[stairTypeId]).toBeDefined();
    expect(reloaded.stairs?.[stair.id]).toEqual(stair);
  });

  it('T-PURGE-WARN-01 : UpdateDoorCommand émet un avertissement console.warn si un patch de dimension est fourni en dev', () => {
    const doc = BimDocument.createDefaultProject();
    const wallTypeId = Object.keys(doc.getState().wallTypes)[0]!;
    const levelId = Object.keys(doc.getState().levels)[0]!;

    doc.execute(
      new Commands.AddWallCommand({
        id: 'w-warn',
        category: 'wall',
        typeId: wallTypeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(5000, 0),
      }),
    );
    doc.execute(
      new Commands.AddDoorCommand({
        id: 'd-warn',
        category: 'door',
        doorTypeId: 'default-door-type',
        hostWallId: 'w-warn',
        offsetAlong: 1000,
        swing: { side: 'left', direction: 'in' },
      }),
    );

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    doc.execute(
      new Commands.UpdateDoorCommand('d-warn', { width: 950 } as unknown as Partial<any>),
    );

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[UpdateDoorCommand] Patch with width/height is deprecated'),
    );

    warnSpy.mockRestore();
  });

  it('T-PURGE-WARN-02 : UpdateDoorCommand n émet AUCUN avertissement si doorTypeId est utilisé', () => {
    const doc = BimDocument.createDefaultProject();
    const wallTypeId = Object.keys(doc.getState().wallTypes)[0]!;
    const levelId = Object.keys(doc.getState().levels)[0]!;

    doc.execute(
      new Commands.AddWallCommand({
        id: 'w-clean',
        category: 'wall',
        typeId: wallTypeId,
        levelId,
        start: vec2(0, 0),
        end: vec2(5000, 0),
      }),
    );
    doc.execute(
      new Commands.AddDoorCommand({
        id: 'd-clean',
        category: 'door',
        doorTypeId: 'default-door-type',
        hostWallId: 'w-clean',
        offsetAlong: 1000,
        swing: { side: 'left', direction: 'in' },
      }),
    );

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    doc.execute(new Commands.UpdateDoorCommand('d-clean', { doorTypeId: 'default-door-type' }));

    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});
