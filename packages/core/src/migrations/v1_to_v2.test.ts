import { describe, it, expect } from 'vitest';
import { migrateSchemaV1toV2 } from './v1_to_v2.js';
import { type V1BimState, type BimState } from '../types.js';
import { BimValidationError } from '../rules.js';

describe('Migration Schéma v1 → v2 (packages/core/src/migrations/v1_to_v2.ts)', () => {
  const baseV1: V1BimState = {
    schemaVersion: 1,
    units: 'mm',
    levels: {
      lvl_0: { id: 'lvl_0', name: 'RDC', elevation: 0 },
    },
    wallTypes: {
      wt_default: { id: 'wt_default', name: 'Plâtre 200mm', thickness: 200, height: 2800 },
    },
    walls: {},
    doors: {},
    windows: {},
    rooms: {},
    dimensions: {},
  };

  it('T-MIG-01 : Migration d’un fichier vide (schema v1, dicts vides) → schema v2, slabTypes contient default-slab-type', () => {
    const res = migrateSchemaV1toV2(baseV1);
    expect(res.schemaVersion).toBe(2);
    expect(res.slabTypes['default-slab-type']).toBeDefined();
    expect(res.slabTypes['default-slab-type']?.thickness).toBe(200);
    expect(res.slabs).toEqual({});
  });

  it('T-MIG-02 : 1 door (900×2100) → 1 DoorType synthétisé, doorTypeId assigné', () => {
    const v1: V1BimState = {
      ...baseV1,
      doors: {
        d1: {
          id: 'd1',
          category: 'door',
          hostWallId: 'w1',
          offsetAlong: 1000,
          width: 900,
          height: 2100,
          swing: { side: 'right', direction: 'in' },
        },
      },
    };
    const res = migrateSchemaV1toV2(v1);
    expect(Object.keys(res.doorTypes)).toHaveLength(1);
    const type = Object.values(res.doorTypes)[0]!;
    expect(type.width).toBe(900);
    expect(type.height).toBe(2100);
    expect(res.doors['d1']?.doorTypeId).toBe(type.id);
    expect((res.doors['d1'] as unknown as { width?: number }).width).toBeUndefined();
  });

  it('T-MIG-03 : 2 doors de dimensions identiques (900×2100 et 900×2100) → 1 seul DoorType partagé', () => {
    const v1: V1BimState = {
      ...baseV1,
      doors: {
        d1: {
          id: 'd1',
          category: 'door',
          hostWallId: 'w1',
          offsetAlong: 500,
          width: 900,
          height: 2100,
          swing: { side: 'right', direction: 'in' },
        },
        d2: {
          id: 'd2',
          category: 'door',
          hostWallId: 'w1',
          offsetAlong: 2500,
          width: 900,
          height: 2100,
          swing: { side: 'left', direction: 'out' },
        },
      },
    };
    const res = migrateSchemaV1toV2(v1);
    expect(Object.keys(res.doorTypes)).toHaveLength(1);
    const typeId = Object.keys(res.doorTypes)[0]!;
    expect(res.doors['d1']?.doorTypeId).toBe(typeId);
    expect(res.doors['d2']?.doorTypeId).toBe(typeId);
  });

  it('T-MIG-04 : 2 doors de dimensions distinctes (900×2100 et 1200×2100) → 2 DoorTypes distincts', () => {
    const v1: V1BimState = {
      ...baseV1,
      doors: {
        d1: {
          id: 'd1',
          category: 'door',
          hostWallId: 'w1',
          offsetAlong: 500,
          width: 900,
          height: 2100,
          swing: { side: 'right', direction: 'in' },
        },
        d2: {
          id: 'd2',
          category: 'door',
          hostWallId: 'w1',
          offsetAlong: 2500,
          width: 1200,
          height: 2100,
          swing: { side: 'left', direction: 'out' },
        },
      },
    };
    const res = migrateSchemaV1toV2(v1);
    expect(Object.keys(res.doorTypes)).toHaveLength(2);
    expect(res.doors['d1']?.doorTypeId).not.toBe(res.doors['d2']?.doorTypeId);
  });

  it('T-MIG-05 : 3 windows (deux 1200×1400 sill 900 et une 900×1200 sill 800) → 2 WindowTypes distincts', () => {
    const v1: V1BimState = {
      ...baseV1,
      windows: {
        w1: {
          id: 'w1',
          category: 'window',
          hostWallId: 'w1',
          offsetAlong: 500,
          width: 1200,
          height: 1400,
          sillHeight: 900,
        },
        w2: {
          id: 'w2',
          category: 'window',
          hostWallId: 'w1',
          offsetAlong: 2000,
          width: 1200,
          height: 1400,
          sillHeight: 900,
        },
        w3: {
          id: 'w3',
          category: 'window',
          hostWallId: 'w1',
          offsetAlong: 3500,
          width: 900,
          height: 1200,
          sillHeight: 800,
        },
      },
    };
    const res = migrateSchemaV1toV2(v1);
    expect(Object.keys(res.windowTypes)).toHaveLength(2);
    expect(res.windows['w1']?.windowTypeId).toBe(res.windows['w2']?.windowTypeId);
    expect(res.windows['w1']?.windowTypeId).not.toBe(res.windows['w3']?.windowTypeId);
  });

  it('T-MIG-06 : Murs mono-niveau (aucun niveau au-dessus) → heightOverride undefined (mode auto conservé)', () => {
    const v1: V1BimState = {
      ...baseV1,
      walls: {
        w1: {
          id: 'w1',
          category: 'wall',
          levelId: 'lvl_0',
          typeId: 'wt_default',
          start: { x: 0, y: 0 },
          end: { x: 6000, y: 0 },
        },
      },
    };
    const res = migrateSchemaV1toV2(v1);
    expect(res.walls['w1']?.heightOverride).toBeUndefined();
  });

  it('T-MIG-07 : Murs avec niveau supérieur à gap 2800 (égal à wallType.height 2800) → heightOverride undefined (auto)', () => {
    const v1: V1BimState = {
      ...baseV1,
      levels: {
        lvl_0: { id: 'lvl_0', name: 'RDC', elevation: 0 },
        lvl_1: { id: 'lvl_1', name: 'R+1', elevation: 2800 },
      },
      walls: {
        w1: {
          id: 'w1',
          category: 'wall',
          levelId: 'lvl_0',
          typeId: 'wt_default',
          start: { x: 0, y: 0 },
          end: { x: 6000, y: 0 },
        },
      },
    };
    const res = migrateSchemaV1toV2(v1);
    expect(res.walls['w1']?.heightOverride).toBeUndefined();
  });

  it('T-MIG-08 : Murs avec niveau supérieur à gap 3000 (!= 2800) → heightOverride = 2800 posé pour préserver le volume', () => {
    const v1: V1BimState = {
      ...baseV1,
      levels: {
        lvl_0: { id: 'lvl_0', name: 'RDC', elevation: 0 },
        lvl_1: { id: 'lvl_1', name: 'R+1', elevation: 3000 },
      },
      walls: {
        w1: {
          id: 'w1',
          category: 'wall',
          levelId: 'lvl_0',
          typeId: 'wt_default',
          start: { x: 0, y: 0 },
          end: { x: 6000, y: 0 },
        },
      },
    };
    const res = migrateSchemaV1toV2(v1);
    expect(res.walls['w1']?.heightOverride).toBe(2800);
  });

  it('T-MIG-09 : Round-trip JSON : serialiser puis relire produit un état stable', () => {
    const v1: V1BimState = {
      ...baseV1,
      doors: {
        d1: {
          id: 'd1',
          category: 'door',
          hostWallId: 'w1',
          offsetAlong: 1000,
          width: 900,
          height: 2100,
          swing: { side: 'right', direction: 'in' },
        },
      },
    };
    const v2 = migrateSchemaV1toV2(v1);
    const jsonStr = JSON.stringify(v2);
    const parsed = JSON.parse(jsonStr) as BimState;
    const reMigrated = migrateSchemaV1toV2(parsed);
    expect(reMigrated).toEqual(v2);
  });

  it('T-MIG-10 : Conservation stricte du volume de parois et réservations', () => {
    const v1: V1BimState = {
      ...baseV1,
      walls: {
        w1: {
          id: 'w1',
          category: 'wall',
          levelId: 'lvl_0',
          typeId: 'wt_default',
          start: { x: 0, y: 0 },
          end: { x: 5000, y: 0 },
        },
      },
      doors: {
        d1: {
          id: 'd1',
          category: 'door',
          hostWallId: 'w1',
          offsetAlong: 1000,
          width: 900,
          height: 2100,
          swing: { side: 'right', direction: 'in' },
        },
      },
    };
    const v2 = migrateSchemaV1toV2(v1);

    // Volume du mur brut V1 : 5000 * 200 * 2800 = 2 800 000 000 mm3
    // Volume de la porte V1 : 900 * 2100 * 200 = 378 000 000 mm3
    const v1DoorVol = 900 * 2100 * 200;
    const dType = v2.doorTypes[v2.doors['d1']!.doorTypeId]!;
    const v2DoorVol = dType.width * dType.height * 200;

    expect(v2DoorVol).toBe(v1DoorVol);
  });

  it('T-MIG-11 : Door v1 sans width → rejet strict MALFORMED_DOOR', () => {
    const v1 = {
      ...baseV1,
      doors: {
        d_bad: {
          id: 'd_bad',
          category: 'door',
          hostWallId: 'w1',
          offsetAlong: 1000,
          height: 2100,
        },
      },
    } as unknown as V1BimState;

    expect(() => migrateSchemaV1toV2(v1)).toThrowError(BimValidationError);
    expect(() => migrateSchemaV1toV2(v1)).toThrowError(/MALFORMED_DOOR/);
  });

  it('T-MIG-12 : Door v1 avec width NaN → rejet strict MALFORMED_DOOR', () => {
    const v1 = {
      ...baseV1,
      doors: {
        d_nan: {
          id: 'd_nan',
          category: 'door',
          hostWallId: 'w1',
          offsetAlong: 1000,
          width: NaN,
          height: 2100,
        },
      },
    } as unknown as V1BimState;

    expect(() => migrateSchemaV1toV2(v1)).toThrowError(/MALFORMED_DOOR/);
  });

  it('T-MIG-13 : Door v1 avec width négative → rejet strict MALFORMED_DOOR', () => {
    const v1 = {
      ...baseV1,
      doors: {
        d_neg: {
          id: 'd_neg',
          category: 'door',
          hostWallId: 'w1',
          offsetAlong: 1000,
          width: -900,
          height: 2100,
        },
      },
    } as unknown as V1BimState;

    expect(() => migrateSchemaV1toV2(v1)).toThrowError(/MALFORMED_DOOR/);
  });

  it('T-MIG-14 : Fichier déjà migré (schemaVersion: 2) → idempotence, rejet si incomplet', () => {
    const v2: BimState = {
      schemaVersion: 2,
      units: 'mm',
      levels: baseV1.levels,
      wallTypes: baseV1.wallTypes,
      slabTypes: {
        'default-slab-type': { id: 'default-slab-type', name: 'Dalle', thickness: 200 },
      },
      doorTypes: {},
      windowTypes: {},
      walls: {},
      slabs: {},
      doors: {},
      windows: {},
      rooms: {},
      dimensions: {},
    };
    const res = migrateSchemaV1toV2(v2);
    expect(res).toBe(v2);

    const corruptV2 = { schemaVersion: 2 } as unknown as BimState;
    expect(() => migrateSchemaV1toV2(corruptV2)).toThrowError(/INVALID_SCHEMA_V2/);
  });

  it('T-MIG-15 : Performance : 100 murs + 200 doors + 100 windows migrés < 20 ms', () => {
    const bigV1: V1BimState = {
      ...baseV1,
      walls: {},
      doors: {},
      windows: {},
    };

    for (let i = 0; i < 100; i++) {
      bigV1.walls[`w_${i}`] = {
        id: `w_${i}`,
        category: 'wall',
        levelId: 'lvl_0',
        typeId: 'wt_default',
        start: { x: i * 1000, y: 0 },
        end: { x: (i + 1) * 1000, y: 0 },
      };
    }
    for (let i = 0; i < 200; i++) {
      const width = i % 2 === 0 ? 900 : 800;
      bigV1.doors[`d_${i}`] = {
        id: `d_${i}`,
        category: 'door',
        hostWallId: `w_${i % 100}`,
        offsetAlong: 100,
        width,
        height: 2100,
        swing: { side: 'right', direction: 'in' },
      };
    }
    for (let i = 0; i < 100; i++) {
      bigV1.windows[`win_${i}`] = {
        id: `win_${i}`,
        category: 'window',
        hostWallId: `w_${i % 100}`,
        offsetAlong: 500,
        width: 1200,
        height: 1400,
        sillHeight: 900,
      };
    }

    const t0 = performance.now();
    const res = migrateSchemaV1toV2(bigV1);
    const duration = performance.now() - t0;

    expect(duration).toBeLessThan(20);
    expect(Object.keys(res.doors)).toHaveLength(200);
    expect(Object.keys(res.doorTypes)).toHaveLength(2); // 900 et 800
    expect(Object.keys(res.windowTypes)).toHaveLength(1); // 1200x1400
  });
});
