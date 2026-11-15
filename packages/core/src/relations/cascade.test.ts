import { describe, it, expect } from 'vitest';
import { resolveCascadeDeletions } from './cascade.js';
import type { BimState, Wall, Door, Window, Dimension, Level, WallType } from '../types.js';
import { BimValidationError } from '../rules.js';

function createMockState(partial: Partial<BimState> = {}): BimState {
  return {
    schemaVersion: 1,
    units: 'mm',
    levels: {},
    wallTypes: {},
    walls: {},
    doors: {},
    windows: {},
    rooms: {},
    dimensions: {},
    ...partial,
  };
}

describe('resolveCascadeDeletions — Cascade & Restrict Génériques (T-CAS-01 à 09)', () => {
  it('T-CAS-01: Suppression wall avec 2 portes + 1 fenêtre (cascade)', () => {
    const wallId = 'w_01';
    const doorA: Door = {
      id: 'd_01',
      category: 'door',
      kind: 'door',
      hostWallId: wallId,
      offsetAlong: 500,
      width: 900,
      height: 2100,
      swing: { side: 'left', direction: 'in' },
    };
    const doorB: Door = {
      id: 'd_02',
      category: 'door',
      kind: 'door',
      hostWallId: wallId,
      offsetAlong: 1800,
      width: 800,
      height: 2100,
      swing: { side: 'right', direction: 'out' },
    };
    const windowA: Window = {
      id: 'win_01',
      category: 'window',
      kind: 'window',
      hostWallId: wallId,
      offsetAlong: 3000,
      width: 1200,
      height: 1400,
      sillHeight: 900,
    };

    const state = createMockState({
      walls: {
        [wallId]: {
          id: wallId,
          category: 'wall',
          typeId: 'wt_01',
          levelId: 'lvl_01',
          start: { x: 0, y: 0 },
          end: { x: 5000, y: 0 },
        },
      },
      doors: { [doorA.id]: doorA, [doorB.id]: doorB },
      windows: { [windowA.id]: windowA },
    });

    const res = resolveCascadeDeletions(state, wallId);
    expect(res.restrictViolations).toEqual([]);
    expect(res.cascadeDeletes).toEqual(['d_01', 'd_02', 'w_01', 'win_01'].sort());
  });

  it('T-CAS-02: Suppression wall avec 1 dimension référencée (cascade)', () => {
    const wallId = 'w_01';
    const dim: Dimension = {
      id: 'dim_01',
      category: 'dimension',
      type: 'linear',
      references: [wallId],
      offset: 500,
      value: 5000,
    };

    const state = createMockState({
      walls: {
        [wallId]: {
          id: wallId,
          category: 'wall',
          typeId: 'wt_01',
          levelId: 'lvl_01',
          start: { x: 0, y: 0 },
          end: { x: 5000, y: 0 },
        },
      },
      dimensions: { [dim.id]: dim },
    });

    const res = resolveCascadeDeletions(state, wallId);
    expect(res.cascadeDeletes).toContain('dim_01');
    expect(res.cascadeDeletes).toContain(wallId);
  });

  it('T-CAS-03: Suppression wall avec 2 cotations référencées (2 dims)', () => {
    const wallId = 'w_01';
    const dim1: Dimension = {
      id: 'dim_01',
      category: 'dimension',
      type: 'linear',
      references: [wallId],
      offset: 500,
      value: 5000,
    };
    const dim2: Dimension = {
      id: 'dim_02',
      category: 'dimension',
      type: 'linear',
      references: [wallId, 'other_wall'],
      offset: -500,
      value: 5000,
    };

    const state = createMockState({
      walls: {
        [wallId]: {
          id: wallId,
          category: 'wall',
          typeId: 'wt_01',
          levelId: 'lvl_01',
          start: { x: 0, y: 0 },
          end: { x: 5000, y: 0 },
        },
      },
      dimensions: { [dim1.id]: dim1, [dim2.id]: dim2 },
    });

    const res = resolveCascadeDeletions(state, wallId);
    expect(res.cascadeDeletes).toContain('dim_01');
    expect(res.cascadeDeletes).toContain('dim_02');
  });

  it('T-CAS-04: Cascade transitive : wall → door → doorType utilisé nulle part ailleurs : doorType NON supprimé', () => {
    const wallId = 'w_01';
    const doorId = 'd_01';
    const doorTypeId = 'dt_01';

    const state = createMockState({
      walls: {
        [wallId]: {
          id: wallId,
          category: 'wall',
          typeId: 'wt_01',
          levelId: 'lvl_01',
          start: { x: 0, y: 0 },
          end: { x: 5000, y: 0 },
        },
      },
      doors: {
        [doorId]: {
          id: doorId,
          category: 'door',
          kind: 'door',
          hostWallId: wallId,
          offsetAlong: 500,
          width: 900,
          height: 2100,
          swing: { side: 'left', direction: 'in' },
          doorTypeId,
        } as any,
      },
    });

    const res = resolveCascadeDeletions(state, wallId);
    expect(res.cascadeDeletes).toContain(wallId);
    expect(res.cascadeDeletes).toContain(doorId);
    // Le doorType ne descend pas en cascade (cascade ne remonte pas aux types cibles)
    expect(res.cascadeDeletes).not.toContain(doorTypeId);
  });

  it('T-CAS-05: Double cascade : wall héberge door + window, dimension référence wall : Tous les IDs collectés, pas de doublon', () => {
    const wallId = 'w_01';
    const state = createMockState({
      walls: {
        [wallId]: {
          id: wallId,
          category: 'wall',
          typeId: 'wt_01',
          levelId: 'lvl_01',
          start: { x: 0, y: 0 },
          end: { x: 5000, y: 0 },
        },
      },
      doors: {
        d_1: {
          id: 'd_1',
          category: 'door',
          kind: 'door',
          hostWallId: wallId,
          offsetAlong: 500,
          width: 900,
          height: 2100,
          swing: { side: 'left', direction: 'in' },
        },
      },
      windows: {
        win_1: {
          id: 'win_1',
          category: 'window',
          kind: 'window',
          hostWallId: wallId,
          offsetAlong: 2500,
          width: 1000,
          height: 1200,
          sillHeight: 900,
        },
      },
      dimensions: {
        dim_1: {
          id: 'dim_1',
          category: 'dimension',
          type: 'linear',
          references: [wallId],
          offset: 400,
          value: 5000,
        },
      },
    });

    const res = resolveCascadeDeletions(state, wallId);
    const expected = ['d_1', 'dim_1', 'w_01', 'win_1'].sort();
    expect(res.cascadeDeletes).toEqual(expected);
    // Vérification de déduplication stricte
    expect(new Set(res.cascadeDeletes).size).toBe(expected.length);
  });

  it('T-CAS-06: Suppression wallType utilisé par 3 murs (restrict) : Lève DELETE_RESTRICTED avec blockingIds = [wall1, wall2, wall3]', () => {
    const typeId = 'wt_common';
    const state = createMockState({
      wallTypes: {
        [typeId]: { id: typeId, name: 'Placo', thickness: 100, height: 2800 },
      },
      walls: {
        w_1: {
          id: 'w_1',
          category: 'wall',
          typeId,
          levelId: 'lvl_01',
          start: { x: 0, y: 0 },
          end: { x: 1000, y: 0 },
        },
        w_2: {
          id: 'w_2',
          category: 'wall',
          typeId,
          levelId: 'lvl_01',
          start: { x: 1000, y: 0 },
          end: { x: 2000, y: 0 },
        },
        w_3: {
          id: 'w_3',
          category: 'wall',
          typeId,
          levelId: 'lvl_01',
          start: { x: 2000, y: 0 },
          end: { x: 3000, y: 0 },
        },
      },
    });

    try {
      resolveCascadeDeletions(state, typeId);
      expect.fail('Should have thrown BimValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(BimValidationError);
      const bve = err as BimValidationError;
      expect(bve.code).toBe('DELETE_RESTRICTED');
      expect(bve.blockingIds).toEqual(['w_1', 'w_2', 'w_3'].sort());
    }
  });

  it('T-CAS-07: Suppression level avec 4 murs + 2 dalles (restrict) : Lève DELETE_RESTRICTED avec blockingIds contenant les 6 IDs', () => {
    const levelId = 'lvl_ground';
    const state = createMockState({
      levels: {
        [levelId]: { id: levelId, name: 'RDC', elevation: 0 },
      },
      walls: {
        w_1: {
          id: 'w_1',
          category: 'wall',
          typeId: 'wt_1',
          levelId,
          start: { x: 0, y: 0 },
          end: { x: 1000, y: 0 },
        },
        w_2: {
          id: 'w_2',
          category: 'wall',
          typeId: 'wt_1',
          levelId,
          start: { x: 1000, y: 0 },
          end: { x: 2000, y: 0 },
        },
        w_3: {
          id: 'w_3',
          category: 'wall',
          typeId: 'wt_1',
          levelId,
          start: { x: 2000, y: 0 },
          end: { x: 3000, y: 0 },
        },
        w_4: {
          id: 'w_4',
          category: 'wall',
          typeId: 'wt_1',
          levelId,
          start: { x: 3000, y: 0 },
          end: { x: 4000, y: 0 },
        },
      },
    });
    // Inject mock slabs
    (state as any).slabs = {
      slab_1: { id: 'slab_1', levelId },
      slab_2: { id: 'slab_2', levelId },
    };

    try {
      resolveCascadeDeletions(state, levelId);
      expect.fail('Should have thrown BimValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(BimValidationError);
      const bve = err as BimValidationError;
      expect(bve.code).toBe('DELETE_RESTRICTED');
      expect(bve.blockingIds).toEqual(['slab_1', 'slab_2', 'w_1', 'w_2', 'w_3', 'w_4'].sort());
    }
  });

  it('T-CAS-08: Suppression doorType utilisé par 2 portes (restrict) : Lève DELETE_RESTRICTED avec blockingIds = [door1, door2]', () => {
    const doorTypeId = 'dt_isoplane';
    const state = createMockState({
      doors: {
        d_1: {
          id: 'd_1',
          category: 'door',
          kind: 'door',
          hostWallId: 'w_1',
          offsetAlong: 200,
          width: 900,
          height: 2100,
          swing: { side: 'left', direction: 'in' },
          doorTypeId,
        } as any,
        d_2: {
          id: 'd_2',
          category: 'door',
          kind: 'door',
          hostWallId: 'w_2',
          offsetAlong: 400,
          width: 900,
          height: 2100,
          swing: { side: 'right', direction: 'out' },
          doorTypeId,
        } as any,
      },
    });

    try {
      resolveCascadeDeletions(state, doorTypeId);
      expect.fail('Should have thrown BimValidationError');
    } catch (err) {
      expect(err).toBeInstanceOf(BimValidationError);
      const bve = err as BimValidationError;
      expect(bve.code).toBe('DELETE_RESTRICTED');
      expect(bve.blockingIds).toEqual(['d_1', 'd_2'].sort());
    }
  });

  it('T-CAS-09: Suppression level sans dépendant : Aucune violation, cascadeDeletes = [levelId]', () => {
    const levelId = 'lvl_empty';
    const state = createMockState({
      levels: {
        [levelId]: { id: levelId, name: 'Sous-sol', elevation: -3000 },
      },
    });

    const res = resolveCascadeDeletions(state, levelId);
    expect(res.restrictViolations).toEqual([]);
    expect(res.cascadeDeletes).toEqual([levelId]);
  });
});
