import { describe, it, expect } from 'vitest';
import { vec2 } from '@tabax/geometry';
import { BimDocument } from './document.js';
import * as Commands from './commands.js';
import { BimValidationError } from './rules.js';
import { toJSON, fromJSON } from './serialization.js';
import { type GableRoofType, type FlatRoofType, type Roof, type Wall } from './types.js';

describe('Toitures & Commandes Métier (ADR-053)', () => {
  const gableType: GableRoofType = {
    id: 'rt_gable_valid',
    name: 'Toit 2 Pans 35°',
    category: 'roofType',
    family: 'gable',
    thickness: 250,
    slopeDeg: 35,
    overhangMm: 300,
    materialId: 'tile',
  };

  const flatType: FlatRoofType = {
    id: 'rt_flat_valid',
    name: 'Toit Terrasse',
    category: 'roofType',
    family: 'flat',
    thickness: 200,
    acrotereHeight: 300,
    materialId: 'concrete',
  };

  it('T-ROOF-01 : AddRoofTypeCommand(gable) ajoute proprement un type de toiture à deux pans', () => {
    const doc = BimDocument.createDefaultProject();
    doc.execute(new Commands.AddRoofTypeCommand(gableType));

    const state = doc.getState();
    expect(state.roofTypes?.[gableType.id]).toEqual(gableType);
  });

  it('T-ROOF-02 : AddRoofTypeCommand(flat) ajoute un type de toiture terrasse', () => {
    const doc = BimDocument.createDefaultProject();
    doc.execute(new Commands.AddRoofTypeCommand(flatType));

    const state = doc.getState();
    expect(state.roofTypes?.[flatType.id]).toEqual(flatType);
  });

  it('T-ROOF-03 : AddRoofTypeCommand avec slopeDeg hors [5°, 60°] -> rejet INVALID_ROOF_SLOPE', () => {
    const doc = BimDocument.createDefaultProject();
    const invalidType: GableRoofType = {
      ...gableType,
      id: 'rt_invalid_slope',
      slopeDeg: 75, // > 60°
    };

    expect(() => {
      doc.execute(new Commands.AddRoofTypeCommand(invalidType));
    }).toThrowError(BimValidationError);

    try {
      doc.execute(new Commands.AddRoofTypeCommand(invalidType));
    } catch (err) {
      expect((err as BimValidationError).code).toBe('INVALID_ROOF_SLOPE');
    }
  });

  it('T-ROOF-04 : AddRoofCommand(gable) valide avec ridgeAxis', () => {
    const doc = BimDocument.createDefaultProject();
    doc.execute(new Commands.AddRoofTypeCommand(gableType));
    const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';

    const roof: Roof = {
      id: 'roof_valid_gable',
      category: 'roof',
      roofTypeId: gableType.id,
      levelId,
      footprint: [vec2(0, 0), vec2(8000, 0), vec2(8000, 6000), vec2(0, 6000)],
      ridgeAxis: { start: vec2(0, 3000), end: vec2(8000, 3000) },
    };

    doc.execute(new Commands.AddRoofCommand(roof));
    expect(doc.getState().roofs?.[roof.id]).toEqual(roof);
  });

  it('T-ROOF-05 : AddRoofCommand(gable) sans ridgeAxis -> rejet MISSING_RIDGE_AXIS', () => {
    const doc = BimDocument.createDefaultProject();
    doc.execute(new Commands.AddRoofTypeCommand(gableType));
    const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';

    const roofWithoutRidge: Roof = {
      id: 'roof_no_ridge',
      category: 'roof',
      roofTypeId: gableType.id,
      levelId,
      footprint: [vec2(0, 0), vec2(8000, 0), vec2(8000, 6000), vec2(0, 6000)],
    };

    expect(() => {
      doc.execute(new Commands.AddRoofCommand(roofWithoutRidge));
    }).toThrowError(BimValidationError);

    try {
      doc.execute(new Commands.AddRoofCommand(roofWithoutRidge));
    } catch (err) {
      expect((err as BimValidationError).code).toBe('MISSING_RIDGE_AXIS');
    }
  });

  it('T-ROOF-06 : AddRoofCommand avec footprint < 3 sommets -> rejet INVALID_ROOF_FOOTPRINT', () => {
    const doc = BimDocument.createDefaultProject();
    doc.execute(new Commands.AddRoofTypeCommand(flatType));
    const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';

    const roofInvalidFootprint: Roof = {
      id: 'roof_bad_fp',
      category: 'roof',
      roofTypeId: flatType.id,
      levelId,
      footprint: [vec2(0, 0), vec2(8000, 0)],
    };

    expect(() => {
      doc.execute(new Commands.AddRoofCommand(roofInvalidFootprint));
    }).toThrowError(BimValidationError);

    try {
      doc.execute(new Commands.AddRoofCommand(roofInvalidFootprint));
    } catch (err) {
      expect((err as BimValidationError).code).toBe('INVALID_ROOF_FOOTPRINT');
    }
  });

  it('T-ROOF-07 : AddRoofCommand avec ridgeAxis hors footprint -> rejet RIDGE_OUTSIDE_FOOTPRINT', () => {
    const doc = BimDocument.createDefaultProject();
    doc.execute(new Commands.AddRoofTypeCommand(gableType));
    const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';

    const roofOutsideRidge: Roof = {
      id: 'roof_out_ridge',
      category: 'roof',
      roofTypeId: gableType.id,
      levelId,
      footprint: [vec2(0, 0), vec2(8000, 0), vec2(8000, 6000), vec2(0, 6000)],
      ridgeAxis: { start: vec2(0, 20000), end: vec2(8000, 20000) }, // 20m plus loin
    };

    expect(() => {
      doc.execute(new Commands.AddRoofCommand(roofOutsideRidge));
    }).toThrowError(BimValidationError);

    try {
      doc.execute(new Commands.AddRoofCommand(roofOutsideRidge));
    } catch (err) {
      expect((err as BimValidationError).code).toBe('RIDGE_OUTSIDE_FOOTPRINT');
    }
  });

  it('T-ROOF-08 : DeleteRoofCommand référencé par un mur -> DELETE_RESTRICTED', () => {
    const doc = BimDocument.createDefaultProject();
    doc.execute(new Commands.AddRoofTypeCommand(gableType));
    const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';
    const wallTypeId = Object.keys(doc.getState().wallTypes)[0] ?? 'wt_0';

    const roof: Roof = {
      id: 'roof_referenced',
      category: 'roof',
      roofTypeId: gableType.id,
      levelId,
      footprint: [vec2(0, 0), vec2(8000, 0), vec2(8000, 6000), vec2(0, 6000)],
      ridgeAxis: { start: vec2(0, 3000), end: vec2(8000, 3000) },
    };
    doc.execute(new Commands.AddRoofCommand(roof));

    const wall: Wall = {
      id: 'w_under_roof',
      category: 'wall',
      typeId: wallTypeId,
      levelId,
      start: vec2(0, 0),
      end: vec2(8000, 0),
      topConstraint: { kind: 'roof', roofId: roof.id },
    };
    doc.execute(new Commands.AddWallCommand(wall));

    expect(() => {
      doc.execute(new Commands.DeleteRoofCommand(roof.id));
    }).toThrowError(BimValidationError);

    try {
      doc.execute(new Commands.DeleteRoofCommand(roof.id));
    } catch (err) {
      expect((err as BimValidationError).code).toBe('DELETE_RESTRICTED');
    }
  });

  it('T-ROOF-09 : Undo/Redo sur AddRoof rétablit fidèlement l’état', () => {
    const doc = BimDocument.createDefaultProject();
    doc.execute(new Commands.AddRoofTypeCommand(flatType));
    const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';

    const roof: Roof = {
      id: 'roof_undo',
      category: 'roof',
      roofTypeId: flatType.id,
      levelId,
      footprint: [vec2(0, 0), vec2(5000, 0), vec2(5000, 5000), vec2(0, 5000)],
    };

    doc.execute(new Commands.AddRoofCommand(roof));
    expect(doc.getState().roofs?.[roof.id]).toBeDefined();

    doc.undo();
    expect(doc.getState().roofs?.[roof.id]).toBeUndefined();

    doc.redo();
    expect(doc.getState().roofs?.[roof.id]).toBeDefined();
  });

  it('T-ROOF-10 : Round-trip JSON avec roof + roofType préserve l’intégrité', () => {
    const doc = BimDocument.createDefaultProject();
    doc.execute(new Commands.AddRoofTypeCommand(gableType));
    const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';

    const roof: Roof = {
      id: 'roof_serial',
      category: 'roof',
      roofTypeId: gableType.id,
      levelId,
      footprint: [vec2(0, 0), vec2(10000, 0), vec2(10000, 6000), vec2(0, 6000)],
      ridgeAxis: { start: vec2(0, 3000), end: vec2(10000, 3000) },
      slopeOverrideDeg: 40,
      overhangOverrideMm: 400,
    };
    doc.execute(new Commands.AddRoofCommand(roof));

    const json = toJSON(doc.getState(), true);
    const restored = fromJSON(json);

    expect(restored.roofTypes?.[gableType.id]).toEqual(gableType);
    expect(restored.roofs?.[roof.id]).toEqual(roof);
  });

  it('T-ROOF-11 : Migration topConstraint v2 -> v2Extended (normalise kind: "level")', () => {
    const legacyDoc = BimDocument.createDefaultProject();
    const wallTypeId = Object.keys(legacyDoc.getState().wallTypes)[0] ?? 'wt_0';
    const levelId = Object.keys(legacyDoc.getState().levels)[0] ?? 'lvl_0';

    // JSON avec topConstraint legacy sans kind
    const stateObj = legacyDoc.getState();
    const legacyWall = {
      id: 'w_legacy_tc',
      category: 'wall' as const,
      typeId: wallTypeId,
      levelId,
      start: { x: 0, y: 0 },
      end: { x: 5000, y: 0 },
      topConstraint: { levelId, offset: 150 }, // pas de 'kind'
    };

    const rawState = {
      ...stateObj,
      walls: {
        ...stateObj.walls,
        w_legacy_tc: legacyWall,
      },
    };

    const json = JSON.stringify(rawState);
    const migrated = fromJSON(json);

    const migratedWall = migrated.walls['w_legacy_tc'];
    expect(migratedWall?.topConstraint?.kind).toBe('level');
    expect(migratedWall?.topConstraint?.levelId).toBe(levelId);
    expect(migratedWall?.topConstraint?.offset).toBe(150);
  });

  it('T-ROOF-12 : Sérialisation d’un mur avec topConstraint kind: "roof" préservée fidèlement', () => {
    const doc = BimDocument.createDefaultProject();
    doc.execute(new Commands.AddRoofTypeCommand(flatType));
    const levelId = Object.keys(doc.getState().levels)[0] ?? 'lvl_0';
    const wallTypeId = Object.keys(doc.getState().wallTypes)[0] ?? 'wt_0';

    const roof: Roof = {
      id: 'roof_for_tc',
      category: 'roof',
      roofTypeId: flatType.id,
      levelId,
      footprint: [vec2(0, 0), vec2(6000, 0), vec2(6000, 6000), vec2(0, 6000)],
    };
    doc.execute(new Commands.AddRoofCommand(roof));

    const wall: Wall = {
      id: 'w_roof_tc',
      category: 'wall',
      typeId: wallTypeId,
      levelId,
      start: vec2(0, 0),
      end: vec2(6000, 0),
      topConstraint: { kind: 'roof', roofId: roof.id },
    };
    doc.execute(new Commands.AddWallCommand(wall));

    const json = toJSON(doc.getState());
    const reloaded = fromJSON(json);

    expect(reloaded.walls['w_roof_tc']?.topConstraint).toEqual({
      kind: 'roof',
      roofId: roof.id,
    });
  });

  it('T-ROOF-13 : BimDocument.createEmptyState() initialise explicitement roofTypes, roofs et roofOpenings', () => {
    const emptyState = BimDocument.createEmptyState();
    expect(emptyState.roofTypes).toBeDefined();
    expect(emptyState.roofTypes).toEqual({});
    expect(emptyState.roofs).toBeDefined();
    expect(emptyState.roofs).toEqual({});
    expect(emptyState.roofOpenings).toBeDefined();
    expect(emptyState.roofOpenings).toEqual({});
  });
});
