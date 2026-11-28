import { describe, it, expect, vi } from 'vitest';
import type { BimState } from '@tabax/core';
import type { Scene3D } from '@tabax/view-3d';
import { syncArchitecturalComponents } from './syncArchitecturalComponents.js';

describe('syncArchitecturalComponents (LOD 350 — ADR-072)', () => {
  const mockScene = {
    updateComponentAssembly: vi.fn(),
    removeMesh: vi.fn(),
  } as unknown as Scene3D;

  const mockState: BimState = {
    schemaVersion: 2,
    units: 'mm',
    levels: {
      lvl_0: { id: 'lvl_0', name: 'RDC', elevation: 0, height: 3000 },
    },
    wallTypes: {},
    slabTypes: {},
    doorTypes: {},
    windowTypes: {},
    stairTypes: {},
    roofTypes: {},
    componentTypes: {
      ct_toilet: {
        id: 'ct_toilet',
        category: 'componentType',
        name: 'WC Suspendu',
        family: 'sanitary',
        subType: 'toilet',
        width: 360,
        depth: 540,
        height: 400,
      },
      ct_table: {
        id: 'ct_table',
        category: 'componentType',
        name: 'Table Repas',
        family: 'furniture',
        subType: 'table',
        width: 1600,
        depth: 900,
        height: 750,
      },
    },
    walls: {},
    slabs: {},
    doors: {},
    windows: {},
    rooms: {},
    dimensions: {},
    stairs: {},
    roofs: {},
    roofOpenings: {},
    components: {
      comp_wc: {
        id: 'comp_wc',
        category: 'component',
        typeId: 'ct_toilet',
        levelId: 'lvl_0',
        placement: { x: 1000, y: 1000, rotation: 0 },
      },
      comp_tbl: {
        id: 'comp_tbl',
        category: 'component',
        typeId: 'ct_table',
        levelId: 'lvl_0',
        placement: { x: 3000, y: 2000, rotation: Math.PI / 2 },
      },
    },
  };

  it('synchronise tous les composants en assemblages LOD 350', () => {
    const res = syncArchitecturalComponents(
      mockScene,
      mockState,
      new Set(),
      false,
    );

    expect(res.totalCount).toBe(2);
    expect(res.syncedCount).toBe(2);
    expect(mockScene.updateComponentAssembly).toHaveBeenCalledTimes(2);
  });

  it('supporte la synchronisation incrémentale dirty-checkée', () => {
    vi.clearAllMocks();
    const res = syncArchitecturalComponents(
      mockScene,
      mockState,
      new Set(['comp_tbl']),
      true,
    );

    expect(res.syncedCount).toBe(1);
    expect(mockScene.updateComponentAssembly).toHaveBeenCalledTimes(1);
  });
});
