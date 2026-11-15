import { describe, it, expect } from 'vitest';
import { vec2 } from '@mini-bim/geometry';
import { Transform2D } from './transform.js';
import { renderPlanView, drawUnderlay, DEFAULT_UNDERLAY_RENDER_CONFIG } from './renderer.js';
import { View2D } from './View2D.js';
import { createUnderlayPath } from './underlay/UnderlayCache.js';
import { createMockCanvas } from './test-utils.js';
import { type DocumentFor2D } from './types.js';

describe('Underlay View2D Integration (packages/view-2d/src/underlay-view2d.test.ts)', () => {
  it('T-V2D-U-01 — renderPlanView sans underlay n’émet aucun tracé underlay', () => {
    const { mock } = createMockCanvas(800, 600);
    const transform = new Transform2D({
      viewportWidth: 800,
      viewportHeight: 600,
    });
    const doc: DocumentFor2D = {
      getState: () => ({
        walls: {},
        wallTypes: {},
      }),
    };

    renderPlanView(mock.ctx, transform, doc, new Set(), {}, null, null, [], [], [], [], null);

    const setTransformCalls = mock.filterCalls('setTransform');
    expect(setTransformCalls).toHaveLength(0);
  });

  it('T-V2D-U-02 — drawUnderlay applique le style normalisé (#9ca3af, tireté 4px, opacité 0.5, lineWidth 1/scale)', () => {
    const { mock } = createMockCanvas(800, 600);
    const transform = new Transform2D({
      scale: 0.05,
      origin: vec2(1000, 1000),
      viewportWidth: 800,
      viewportHeight: 600,
    });

    const path = createUnderlayPath();
    drawUnderlay(mock.ctx, transform, path, DEFAULT_UNDERLAY_RENDER_CONFIG);

    expect(mock.ctx.strokeStyle).toBe('#9ca3af');
    expect(mock.ctx.globalAlpha).toBe(0.5);
    expect(mock.ctx.lineWidth).toBe(1 / 0.05);

    const setDashCalls = mock.filterCalls('setLineDash');
    expect(setDashCalls).toHaveLength(1);
    expect(setDashCalls[0]?.args[0]).toEqual([4 / 0.05, 4 / 0.05]);

    const strokeCalls = mock.filterCalls('stroke');
    expect(strokeCalls).toHaveLength(1);
    expect(strokeCalls[0]?.args[0]).toBe(path);

    const setTransformCalls = mock.filterCalls('setTransform');
    expect(setTransformCalls).toHaveLength(1);
  });

  it('T-V2D-U-03 — View2D accesseurs getUnderlayLevelId / setUnderlayLevelId', () => {
    const { canvas } = createMockCanvas(800, 600);
    const view2d = new View2D(canvas, { activeLevelId: 'lvl_rdc' });

    expect(view2d.getUnderlayLevelId()).toBeNull();
    view2d.setUnderlayLevelId('lvl_ss');
    expect(view2d.getUnderlayLevelId()).toBe('lvl_ss');

    view2d.setUnderlayLevelId(null);
    expect(view2d.getUnderlayLevelId()).toBeNull();
  });

  it('T-V2D-U-04 — View2D.render avec underlay extrait les murs du niveau N-1 et exploite le cache', () => {
    const { canvas } = createMockCanvas(800, 600);
    const view2d = new View2D(canvas, {
      activeLevelId: 'lvl_r1',
      underlayLevelId: 'lvl_rdc',
    });

    const doc: DocumentFor2D = {
      getState: () => ({
        walls: {
          w_rdc_1: {
            id: 'w_rdc_1',
            typeId: 'wt_standard',
            levelId: 'lvl_rdc',
            start: vec2(0, 0),
            end: vec2(6000, 0),
          },
          w_r1_1: {
            id: 'w_r1_1',
            typeId: 'wt_standard',
            levelId: 'lvl_r1',
            start: vec2(0, 0),
            end: vec2(6000, 0),
          },
        },
        wallTypes: {
          wt_standard: {
            id: 'wt_standard',
            name: 'Mur 200',
            thickness: 200,
          },
        },
        doors: {
          d_rdc: {
            id: 'd_rdc',
            hostWallId: 'w_rdc_1',
            offsetAlong: 1000,
            swing: { side: 'left', direction: 'in' },
            doorTypeId: 'dt_900',
          },
        },
        doorTypes: {
          dt_900: {
            id: 'dt_900',
            name: 'Porte 900',
            width: 900,
            height: 2100,
          },
        },
      }),
    };

    const cache = view2d.getUnderlayCache();
    expect(cache.get('lvl_rdc')).toBeUndefined();
    cache.resetStats();

    // 1er rendu : compilation et mise en cache
    view2d.render(doc);
    expect(cache.get('lvl_rdc')).toBeDefined();
    expect(cache.getMissCount()).toBe(1);

    // 2ème rendu (ex: pan/zoom) : hit du cache
    view2d.render();
    expect(cache.getHitCount()).toBe(2); // 1 pour la vérification get + 1 pour getOrCompile
  });

  it('T-V2D-U-05 — invalidateUnderlayCache invalide le cache et force la recompilation au rendu suivant', () => {
    const { canvas } = createMockCanvas(800, 600);
    const view2d = new View2D(canvas, {
      activeLevelId: 'lvl_r1',
      underlayLevelId: 'lvl_rdc',
    });

    const doc: DocumentFor2D = {
      getState: () => ({
        walls: {
          w_rdc_1: {
            id: 'w_rdc_1',
            typeId: 'wt_standard',
            levelId: 'lvl_rdc',
            start: vec2(0, 0),
            end: vec2(6000, 0),
          },
        },
        wallTypes: {
          wt_standard: {
            id: 'wt_standard',
            name: 'Mur 200',
            thickness: 200,
          },
        },
      }),
    };

    view2d.render(doc);
    const cache = view2d.getUnderlayCache();
    expect(cache.get('lvl_rdc')).toBeDefined();

    // Modification du mur w_rdc_1
    view2d.invalidateUnderlayCache(['w_rdc_1']);
    expect(cache.get('lvl_rdc')).toBeUndefined();

    // Rendu suivant : recompilation automatique
    view2d.render();
    expect(cache.get('lvl_rdc')).toBeDefined();
  });
});
