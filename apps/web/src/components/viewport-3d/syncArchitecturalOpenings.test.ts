import { describe, it, expect, vi } from 'vitest';
import type { BimState } from '@tabax/core';
import type { Scene3D } from '@tabax/view-3d';
import { syncArchitecturalOpenings } from './syncArchitecturalOpenings.js';

describe('syncArchitecturalOpenings (LOD 200 / LOD 350 — ADR-072)', () => {
  const mockScene = {
    updateMesh: vi.fn(() => ({ userData: {} })),
    updateComponentAssembly: vi.fn(),
    updateOpeningGroup: vi.fn(),
    removeMesh: vi.fn(),
  } as unknown as Scene3D;

  const mockState: BimState = {
    schemaVersion: 2,
    units: 'mm',
    levels: {
      lvl_0: { id: 'lvl_0', name: 'RDC', elevation: 0, height: 3000 },
    },
    wallTypes: {
      wt_ext: { id: 'wt_ext', name: 'Ext 200', thickness: 200, height: 3000 },
    },
    slabTypes: {},
    doorTypes: {
      dt_830: { id: 'dt_830', name: 'Isoplane 830', width: 830, height: 2040 },
    },
    windowTypes: {
      win_120: { id: 'win_120', name: 'Fenêtre 1200x1250', width: 1200, height: 1250, defaultSillHeight: 900 },
    },
    stairTypes: {},
    roofTypes: {},
    componentTypes: {},
    walls: {
      wall_1: {
        id: 'wall_1',
        category: 'wall',
        typeId: 'wt_ext',
        levelId: 'lvl_0',
        start: { x: 0, y: 0 },
        end: { x: 5000, y: 0 },
      },
    },
    slabs: {},
    doors: {
      door_1: {
        id: 'door_1',
        category: 'door',
        doorTypeId: 'dt_830',
        hostWallId: 'wall_1',
        offsetAlong: 1000,
        swing: { side: 'left', direction: 'in' },
      },
    },
    windows: {
      win_1: {
        id: 'win_1',
        category: 'window',
        windowTypeId: 'win_120',
        hostWallId: 'wall_1',
        offsetAlong: 3000,
        sillHeight: 900,
      },
    },
    rooms: {},
    dimensions: {},
    stairs: {},
    roofs: {},
    roofOpenings: {},
    components: {},
  };

  it('synchronise les menuiseries en mode LOD 200 (placeholders simples)', () => {
    vi.clearAllMocks();
    const res = syncArchitecturalOpenings(
      mockScene,
      mockState,
      new Set(),
      false,
      { detailLevel: 'lod200' },
    );

    expect(res.doorsSynced).toBe(1);
    expect(res.windowsSynced).toBe(1);
    expect(mockScene.updateMesh).toHaveBeenCalledTimes(2);
    expect(mockScene.updateComponentAssembly).not.toHaveBeenCalled();
  });

  it('synchronise les menuiseries en mode LOD 350 (assemblages PBR multi-matériaux & quincaillerie GPU)', () => {
    vi.clearAllMocks();
    const res = syncArchitecturalOpenings(
      mockScene,
      mockState,
      new Set(),
      false,
      { detailLevel: 'lod350' },
    );

    expect(res.doorsSynced).toBe(1);
    expect(res.windowsSynced).toBe(1);
    expect(mockScene.updateComponentAssembly).toHaveBeenCalledTimes(2);
    expect(mockScene.updateMesh).not.toHaveBeenCalled();
  });
});
