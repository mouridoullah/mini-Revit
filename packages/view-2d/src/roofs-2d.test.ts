import { describe, it, expect } from 'vitest';
import { vec2 } from '@tabax/geometry';
import { Transform2D } from './transform.js';
import { drawRoof, DEFAULT_ROOF_RENDER_CONFIG } from './renderer.js';
import {
  type RoofFor2D,
  type GableRoofTypeFor2D,
  type FlatRoofTypeFor2D,
  type RoofOpeningFor2D,
} from './types.js';
import { createMockCanvas } from './test-utils.js';
import { View2D } from './View2D.js';

describe('Phase 7 — Rendu 2D des Toitures (packages/view-2d/src/roofs-2d.test.ts)', () => {
  const transform = new Transform2D({
    origin: vec2(0, 0),
    scale: 0.1, // 100 px pour 1000 mm
    viewportWidth: 800,
    viewportHeight: 600,
  });

  const baseGableRoof: RoofFor2D = {
    id: 'roof_gable_01',
    category: 'roof',
    roofTypeId: 'rt_gable_35',
    levelId: 'lvl_1',
    footprint: [vec2(0, 0), vec2(8000, 0), vec2(8000, 6000), vec2(0, 6000)],
    ridgeAxis: [vec2(0, 3000), vec2(8000, 3000)],
  };

  const gableRoofType: GableRoofTypeFor2D = {
    id: 'rt_gable_35',
    name: 'Toiture 2 pans Tuiles 35°',
    family: 'gable',
    thickness: 250,
    slopeDeg: 35,
    overhangMm: 400,
  };

  const flatRoofType: FlatRoofTypeFor2D = {
    id: 'rt_flat_concrete',
    name: 'Toiture terrasse béton',
    family: 'flat',
    thickness: 200,
  };

  it('T-ROOF-2D-01 : drawRoof contour + débord — trace le contour extérieur du débord en pointillé et l’empreinte', () => {
    const { mock } = createMockCanvas(800, 600);

    drawRoof(mock.ctx, transform, baseGableRoof, gableRoofType, [], false, DEFAULT_ROOF_RENDER_CONFIG);

    const fillCalls = mock.filterCalls('fill');
    expect(fillCalls.length).toBeGreaterThanOrEqual(1);

    const strokeCalls = mock.filterCalls('stroke');
    // Au moins 3 stroke : débord + empreinte murale + faîtage
    expect(strokeCalls.length).toBeGreaterThanOrEqual(3);

    const lineDashCalls = mock.filterCalls('setLineDash');
    expect(lineDashCalls.length).toBeGreaterThanOrEqual(2);
  });

  it('T-ROOF-2D-01b : drawRoof toit plat — trace l’empreinte sans débord ni faîtage', () => {
    const { mock } = createMockCanvas(800, 600);
    const flatRoof: RoofFor2D = {
      id: 'roof_flat_01',
      category: 'roof',
      roofTypeId: flatRoofType.id,
      levelId: 'lvl_01',
      footprint: [vec2(0, 0), vec2(5000, 0), vec2(5000, 4000), vec2(0, 4000)],
    };

    drawRoof(mock.ctx, transform, flatRoof, flatRoofType, [], false, DEFAULT_ROOF_RENDER_CONFIG);

    const fillCalls = mock.filterCalls('fill');
    expect(fillCalls.length).toBe(1);

    const strokeCalls = mock.filterCalls('stroke');
    expect(strokeCalls.length).toBe(1);
  });

  it('T-ROOF-2D-02 : Faîtage en trait fort — tracé distinctif de ridgeAxis avec ridgeColor et ridgeWidth', () => {
    const { mock } = createMockCanvas(800, 600);

    drawRoof(mock.ctx, transform, baseGableRoof, gableRoofType, [], false, DEFAULT_ROOF_RENDER_CONFIG);

    expect(mock.ctx.lineWidth).toBe(DEFAULT_ROOF_RENDER_CONFIG.ridgeWidth);
    expect(mock.ctx.strokeStyle).toBe(DEFAULT_ROOF_RENDER_CONFIG.ridgeColor);
  });

  it('T-ROOF-2D-03 : Opening affiche une croix de réservation — tracé du rectangle et diagonales de réservation', () => {
    const { mock } = createMockCanvas(800, 600);

    const opening: RoofOpeningFor2D = {
      id: 'skylight_01',
      category: 'roofOpening',
      roofId: baseGableRoof.id,
      offsetU: 2000,
      offsetV: 1000,
      width: 800,
      height: 1200,
    };

    drawRoof(mock.ctx, transform, baseGableRoof, gableRoofType, [opening], false, DEFAULT_ROOF_RENDER_CONFIG);

    const strokeCalls = mock.filterCalls('stroke');
    // Débord + empreinte + faîtage + cadre ouverture + croix diagonale
    expect(strokeCalls.length).toBeGreaterThanOrEqual(4);
  });

  it('T-ROOF-2D-04 : Sélection -> surbrillance — contour et faîtage accentués avec selectedStrokeColor et selectedStrokeWidth', () => {
    const { mock } = createMockCanvas(800, 600);

    drawRoof(mock.ctx, transform, baseGableRoof, gableRoofType, [], true, DEFAULT_ROOF_RENDER_CONFIG);

    expect(mock.ctx.strokeStyle).toBe(DEFAULT_ROOF_RENDER_CONFIG.selectedStrokeColor);
    expect(mock.ctx.lineWidth).toBe(DEFAULT_ROOF_RENDER_CONFIG.selectedStrokeWidth);
  });

  it('T-ROOF-2D-05 : view.setRoofs / view.getRoofs — configuration réactive de toitures dans View2D', () => {
    const { canvas } = createMockCanvas(800, 600);
    const view = new View2D(canvas);

    expect(view.getRoofs()).toEqual([]);

    view.setRoofs([baseGableRoof]);
    expect(view.getRoofs()).toHaveLength(1);
    expect(view.getRoofs()[0]?.id).toBe(baseGableRoof.id);

    view.setRoofs([]);
    expect(view.getRoofs()).toHaveLength(0);
  });
});
