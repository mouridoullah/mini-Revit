import { describe, it, expect } from 'vitest';
import { vec2, type Vec2 } from '@mini-bim/geometry';
import { BimDocument } from './document.js';
import {
  AddSlabTypeCommand,
  UpdateSlabTypeCommand,
  DeleteSlabTypeCommand,
  AddSlabCommand,
  UpdateSlabCommand,
  DeleteSlabCommand,
  DeleteLevelCommand,
} from './commands.js';
import { BimValidationError } from './rules.js';
import { type Slab, type SlabType } from './types.js';

describe('Phase 6.1a — Slab & SlabType Commands & Business Rules (packages/core/src/slabs.test.ts)', () => {
  function setupTestDoc() {
    const doc = BimDocument.createDefaultProject();
    const state = doc.getState();
    const levelId = Object.keys(state.levels)[0]!;
    const defaultSlabTypeId = Object.keys(state.slabTypes)[0]!;

    const baseBoundary: Vec2[] = [vec2(0, 0), vec2(6000, 0), vec2(6000, 5000), vec2(0, 5000)];

    return { doc, levelId, defaultSlabTypeId, baseBoundary };
  }

  it('T-SLAB-01 : AddSlabTypeCommand ajoute un SlabType valide', () => {
    const { doc } = setupTestDoc();
    const slabType: SlabType = {
      id: 'st_concrete_250',
      name: 'Dalle BA 250mm',
      thickness: 250,
    };

    const res = doc.execute(new AddSlabTypeCommand(slabType));
    expect(res.changed).toEqual(['st_concrete_250']);
    expect(doc.getState().slabTypes['st_concrete_250']).toEqual(slabType);
  });

  it('T-SLAB-02 : AddSlabTypeCommand rejette une épaisseur < 50 mm (INVALID_SLAB_THICKNESS)', () => {
    const { doc } = setupTestDoc();
    const thinSlabType: SlabType = {
      id: 'st_thin',
      name: 'Chape trop fine',
      thickness: 30, // < 50 mm !
    };

    expect(() => doc.execute(new AddSlabTypeCommand(thinSlabType))).toThrowError(
      BimValidationError,
    );
    expect(() => doc.execute(new AddSlabTypeCommand(thinSlabType))).toThrowError(
      /INVALID_SLAB_THICKNESS/,
    );
  });

  it('T-SLAB-03 : UpdateSlabTypeCommand modifie les propriétés d’un SlabType', () => {
    const { doc, defaultSlabTypeId } = setupTestDoc();

    doc.execute(
      new UpdateSlabTypeCommand(defaultSlabTypeId, {
        name: 'Dalle BA Renforcée 220mm',
        thickness: 220,
      }),
    );

    const updated = doc.getState().slabTypes[defaultSlabTypeId]!;
    expect(updated.name).toBe('Dalle BA Renforcée 220mm');
    expect(updated.thickness).toBe(220);
  });

  it('T-SLAB-04 : DeleteSlabTypeCommand rejette la suppression si utilisé par une dalle (DELETE_RESTRICTED)', () => {
    const { doc, levelId, defaultSlabTypeId, baseBoundary } = setupTestDoc();
    const slab: Slab = {
      id: 'slab_01',
      category: 'slab',
      slabTypeId: defaultSlabTypeId,
      levelId,
      boundary: baseBoundary,
    };
    doc.execute(new AddSlabCommand(slab));

    expect(() => doc.execute(new DeleteSlabTypeCommand(defaultSlabTypeId))).toThrowError(
      BimValidationError,
    );
    expect(() => doc.execute(new DeleteSlabTypeCommand(defaultSlabTypeId))).toThrowError(
      /DELETE_RESTRICTED/,
    );
  });

  it('T-SLAB-05 : DeleteSlabTypeCommand supprime un type non référencé', () => {
    const { doc } = setupTestDoc();
    const tempType: SlabType = {
      id: 'st_temp',
      name: 'Type temporaire',
      thickness: 180,
    };
    doc.execute(new AddSlabTypeCommand(tempType));
    expect(doc.getState().slabTypes['st_temp']).toBeDefined();

    doc.execute(new DeleteSlabTypeCommand('st_temp'));
    expect(doc.getState().slabTypes['st_temp']).toBeUndefined();
  });

  it('T-SLAB-06 : AddSlabCommand ajoute une dalle rectangulaire sur un niveau existant', () => {
    const { doc, levelId, defaultSlabTypeId, baseBoundary } = setupTestDoc();
    const slab: Slab = {
      id: 'slab_living',
      category: 'slab',
      slabTypeId: defaultSlabTypeId,
      levelId,
      boundary: baseBoundary,
    };

    const res = doc.execute(new AddSlabCommand(slab));
    expect(res.changed).toEqual(['slab_living']);
    expect(doc.getState().slabs['slab_living']).toEqual(slab);
  });

  it('T-SLAB-07 : AddSlabCommand rejette un SlabType inexistant (UNKNOWN_SLAB_TYPE)', () => {
    const { doc, levelId, baseBoundary } = setupTestDoc();
    const orphanSlab: Slab = {
      id: 'slab_ghost_type',
      category: 'slab',
      slabTypeId: 'st_non_existent',
      levelId,
      boundary: baseBoundary,
    };

    expect(() => doc.execute(new AddSlabCommand(orphanSlab))).toThrowError(BimValidationError);
    expect(() => doc.execute(new AddSlabCommand(orphanSlab))).toThrowError(/UNKNOWN_SLAB_TYPE/);
  });

  it('T-SLAB-08 : AddSlabCommand rejette un Level inexistant (UNKNOWN_LEVEL)', () => {
    const { doc, defaultSlabTypeId, baseBoundary } = setupTestDoc();
    const orphanSlab: Slab = {
      id: 'slab_ghost_level',
      category: 'slab',
      slabTypeId: defaultSlabTypeId,
      levelId: 'lvl_unknown',
      boundary: baseBoundary,
    };

    expect(() => doc.execute(new AddSlabCommand(orphanSlab))).toThrowError(BimValidationError);
    expect(() => doc.execute(new AddSlabCommand(orphanSlab))).toThrowError(/UNKNOWN_LEVEL/);
  });

  it('T-SLAB-09 : AddSlabCommand rejette un contour < 3 sommets ou aplati (INVALID_SLAB_BOUNDARY)', () => {
    const { doc, levelId, defaultSlabTypeId } = setupTestDoc();
    const invalidSlab: Slab = {
      id: 'slab_invalid_boundary',
      category: 'slab',
      slabTypeId: defaultSlabTypeId,
      levelId,
      boundary: [vec2(0, 0), vec2(1000, 0)], // 2 sommets seulement
    };

    expect(() => doc.execute(new AddSlabCommand(invalidSlab))).toThrowError(BimValidationError);
    expect(() => doc.execute(new AddSlabCommand(invalidSlab))).toThrowError(
      /INVALID_SLAB_BOUNDARY/,
    );
  });

  it('T-SLAB-10 : AddSlabCommand avec trémie intérieure valide crée une dalle évidée', () => {
    const { doc, levelId, defaultSlabTypeId, baseBoundary } = setupTestDoc();
    const hopperOpening: Vec2[] = [
      vec2(1000, 1000),
      vec2(2500, 1000),
      vec2(2500, 2500),
      vec2(1000, 2500),
    ];
    const slabWithHopper: Slab = {
      id: 'slab_hopper',
      category: 'slab',
      slabTypeId: defaultSlabTypeId,
      levelId,
      boundary: baseBoundary,
      openings: [hopperOpening],
    };

    expect(() => doc.execute(new AddSlabCommand(slabWithHopper))).not.toThrow();
    expect(doc.getState().slabs['slab_hopper']).toBeDefined();
  });

  it('T-SLAB-11 : AddSlabCommand avec trémie scindant la dalle est rejetée (SLAB_SEVERED)', () => {
    const { doc, levelId, defaultSlabTypeId, baseBoundary } = setupTestDoc();
    // Trémie coupant la dalle en deux de part en part
    const splittingOpening: Vec2[] = [
      vec2(2500, -100),
      vec2(3500, -100),
      vec2(3500, 6000),
      vec2(2500, 6000),
    ];
    const severedSlab: Slab = {
      id: 'slab_severed',
      category: 'slab',
      slabTypeId: defaultSlabTypeId,
      levelId,
      boundary: baseBoundary,
      openings: [splittingOpening],
    };

    expect(() => doc.execute(new AddSlabCommand(severedSlab))).toThrowError(BimValidationError);
    expect(() => doc.execute(new AddSlabCommand(severedSlab))).toThrowError(/SLAB_SEVERED/);
  });

  it('T-SLAB-12 : AddSlabCommand avec trémie englobant la dalle est rejetée (SLAB_EMPTY)', () => {
    const { doc, levelId, defaultSlabTypeId, baseBoundary } = setupTestDoc();
    const engulfingOpening: Vec2[] = [
      vec2(-500, -500),
      vec2(7000, -500),
      vec2(7000, 6000),
      vec2(-500, 6000),
    ];
    const emptySlab: Slab = {
      id: 'slab_empty',
      category: 'slab',
      slabTypeId: defaultSlabTypeId,
      levelId,
      boundary: baseBoundary,
      openings: [engulfingOpening],
    };

    expect(() => doc.execute(new AddSlabCommand(emptySlab))).toThrowError(BimValidationError);
    expect(() => doc.execute(new AddSlabCommand(emptySlab))).toThrowError(/SLAB_EMPTY/);
  });

  it('T-SLAB-13 : UpdateSlabCommand modifie le contour ou le type de dalle', () => {
    const { doc, levelId, defaultSlabTypeId, baseBoundary } = setupTestDoc();
    const slab: Slab = {
      id: 'slab_to_update',
      category: 'slab',
      slabTypeId: defaultSlabTypeId,
      levelId,
      boundary: baseBoundary,
    };
    doc.execute(new AddSlabCommand(slab));

    const extendedBoundary: Vec2[] = [vec2(0, 0), vec2(8000, 0), vec2(8000, 5000), vec2(0, 5000)];
    doc.execute(new UpdateSlabCommand('slab_to_update', { boundary: extendedBoundary }));

    const updated = doc.getState().slabs['slab_to_update']!;
    expect(updated.boundary[1]!.x).toBe(8000);
  });

  it('T-SLAB-14 : DeleteSlabCommand supprime la dalle', () => {
    const { doc, levelId, defaultSlabTypeId, baseBoundary } = setupTestDoc();
    const slab: Slab = {
      id: 'slab_to_delete',
      category: 'slab',
      slabTypeId: defaultSlabTypeId,
      levelId,
      boundary: baseBoundary,
    };
    doc.execute(new AddSlabCommand(slab));
    expect(doc.getState().slabs['slab_to_delete']).toBeDefined();

    const res = doc.execute(new DeleteSlabCommand('slab_to_delete'));
    expect(res.changed).toEqual(['slab_to_delete']);
    expect(doc.getState().slabs['slab_to_delete']).toBeUndefined();
  });

  it('T-SLAB-15 : DeleteLevelCommand est bloqué si une dalle y est rattachée (DELETE_RESTRICTED)', () => {
    const { doc, levelId, defaultSlabTypeId, baseBoundary } = setupTestDoc();
    const slab: Slab = {
      id: 'slab_on_level',
      category: 'slab',
      slabTypeId: defaultSlabTypeId,
      levelId,
      boundary: baseBoundary,
    };
    doc.execute(new AddSlabCommand(slab));

    expect(() => doc.execute(new DeleteLevelCommand(levelId))).toThrowError(BimValidationError);
    expect(() => doc.execute(new DeleteLevelCommand(levelId))).toThrowError(/DELETE_RESTRICTED/);
  });
});
