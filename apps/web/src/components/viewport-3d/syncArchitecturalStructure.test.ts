import { describe, it, expect, vi, beforeEach } from 'vitest';
import { syncArchitecturalStructure } from './syncArchitecturalStructure.js';
import type { Scene3D } from '@tabax/view-3d';
import type { BimState } from '@tabax/core';

describe('syncArchitecturalStructure', () => {
  let mockScene: Partial<Scene3D>;
  let baseState: BimState;

  beforeEach(() => {
    mockScene = {
      updateMeshBatch: vi.fn(),
      updateComponentAssembly: vi.fn(),
      updateSlabMesh: vi.fn(),
      updateStairMesh: vi.fn(),
      updateRoofMesh: vi.fn(),
    };

    baseState = {
      schemaVersion: 2,
      units: 'mm',
      levels: {
        lvl_0: { id: 'lvl_0', name: 'RDC', elevation: 0 },
        lvl_1: { id: 'lvl_1', name: 'R+1', elevation: 2800 },
      },
      wallTypes: {
        wt_1: { id: 'wt_1', name: 'Standard 200', thickness: 200, height: 2800 },
      },
      doorTypes: {},
      windowTypes: {},
      rooms: {},
      dimensions: {},
      componentTypes: {},
      roofOpenings: {},
      walls: {
        w_1: {
          id: 'w_1',
          category: 'wall',
          typeId: 'wt_1',
          levelId: 'lvl_0',
          start: { x: 0, y: 0 },
          end: { x: 4000, y: 0 },
        },
      },
      doors: {},
      windows: {},
      slabs: {
        sl_1: {
          id: 'sl_1',
          category: 'slab',
          slabTypeId: 'st_1',
          levelId: 'lvl_0',
          boundary: [
            { x: 0, y: 0 },
            { x: 4000, y: 0 },
            { x: 4000, y: 3000 },
            { x: 0, y: 3000 },
          ],
        },
      },
      slabTypes: {
        st_1: { id: 'st_1', name: 'Dalle 200', thickness: 200 },
      },
      stairs: {
        st_1: {
          id: 'st_1',
          category: 'stair',
          stairTypeId: 'stt_1',
          bottomLevelId: 'lvl_0',
          topLevelId: 'lvl_1',
          start: { x: 0, y: 0 },
          end: { x: 3000, y: 0 },
        },
      },
      stairTypes: {
        stt_1: { id: 'stt_1', name: 'Escalier 900', width: 900 },
      },
      roofs: {
        rf_1: {
          id: 'rf_1',
          category: 'roof',
          roofTypeId: 'rt_flat',
          levelId: 'lvl_1',
          footprint: [
            { x: 0, y: 0 },
            { x: 4000, y: 0 },
            { x: 4000, y: 3000 },
            { x: 0, y: 3000 },
          ],
        },
      },
      roofTypes: {
        rt_flat: { id: 'rt_flat', category: 'roofType', name: 'Toit plat', family: 'flat', thickness: 200 },
      },
    };
  });

  it('en mode lod200 : génère des maillages simples (updateMeshBatch, updateSlabMesh, etc.)', () => {
    syncArchitecturalStructure(
      mockScene as Scene3D,
      baseState,
      new Set(['w_1', 'sl_1', 'st_1', 'rf_1']),
      false,
      { detailLevel: 'lod200' },
    );

    expect(mockScene.updateMeshBatch).toHaveBeenCalledWith('w_1', expect.any(Array));
    expect(mockScene.updateSlabMesh).toHaveBeenCalledWith('sl_1', expect.any(Object));
    expect(mockScene.updateStairMesh).toHaveBeenCalledWith('st_1', expect.any(Object));
    expect(mockScene.updateRoofMesh).toHaveBeenCalledWith('rf_1', expect.any(Object));
  });

  it('en mode par défaut ou réaliste : génère des assemblages multi-matériaux LOD 350', () => {
    syncArchitecturalStructure(
      mockScene as Scene3D,
      baseState,
      new Set(['w_1', 'sl_1', 'st_1', 'rf_1']),
      false,
      { renderMode: 'realiste' },
    );

    // Murs, dalles, escaliers, toitures sont envoyés comme assemblies multi-matériaux
    expect(mockScene.updateComponentAssembly).toHaveBeenCalled();
  });
});
